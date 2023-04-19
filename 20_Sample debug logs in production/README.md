# Module 20: Sample debug logs in production

<details>
<summary><b>Configure the sampling rate</b></summary><p>

1. In the `serverless.yml`, add a `POWERTOOLS_LOGGER_SAMPLE_RATE` environment variable to `provider.environment`, i.e.

```yml
POWERTOOLS_LOGGER_SAMPLE_RATE: 0.1
```

(mind the indentation)

This tells the logger we installed in the last module to print all the log items regardless the current log level at a given percentage. Here, `0.1` means 10%.

However, the decision to sample all logs or not happens in the constructor of the `Logger` type. So if we want to sample logs for a percentage of invocations, we have two choices:

A) initialize the logger inside the handler body, or
B) call `logger.refreshSampleRateCalculation()` at the start or end of every invocation to force the logger to re-evaluate (based on our configured sample rate) whether it should include all log items.

Option A makes using the logger more difficult because you'd need to pass the logger instance around to every method you call. E.g. when the `get-index` module's `handler` function calls the `getRestaurants` function, which needs to write some logs.

There are ways to get around this. But I think option B is simpler and offers less resistance, so let's go with that!

2. Open `get-index.js` and add this as the 1st line in the `handler` function:

```js
logger.refreshSampleRateCalculation()
```

So after the change, the `handler` function should look like this:

```js
module.exports.handler = async (event, context) => {
  logger.refreshSampleRateCalculation()
  
  const restaurants = await getRestaurants()
  logger.debug('got restaurants', { count: restaurants.length })
  const dayOfWeek = days[new Date().getDay()]
  const view = {
    awsRegion,
    cognitoUserPoolId,
    cognitoClientId,
    dayOfWeek,
    restaurants,
    searchUrl: `${restaurantsApiRoot}/search`,
    placeOrderUrl: `${ordersApiRoot}`
  }
  const html = Mustache.render(template, view)
  const response = {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8'
    },
    body: html
  }

  return response
}
```

3. Repeat step 2 for `get-restaurants.js`, `notify-restaurant.js`, `place-order.js` and `search-restaurants.js`.

</p></details>

<details>
<summary><b>Log the incoming invocation event</b></summary><p>

1. In the `serverless.yml`, add a `POWERTOOLS_LOGGER_LOG_EVENT` environment variable to `provider.environment`, i.e.

```yml
POWERTOOLS_LOGGER_LOG_EVENT: true
```

(mind the indentation)

This tells the logger we installed in the last module to log the Lambda invocation event. It's very helpful for troubleshooting problems, but keep in mind that there is no built-in data scrubbing. So any sensitive information (such as PII data) in the invocation event would be included in your logs.

For this to work, however, we need to add the `injectLambdaContext` middleware, which also enriches the log messages with these additional fields:

* cold_start
* function_name
* function_memory_size
* function_arn
* function_request_id

2. In the `get-index.js`, towards the top of the file, where we had:

```js
const { Logger } = require('@aws-lambda-powertools/logger')
```

change it to:

```js
const { Logger, injectLambdaContext } = require('@aws-lambda-powertools/logger')
```

3. Staying in the `get-index.js`, bring in `middy`. At the top of the file, add:

```js
const middy = require('@middy/core')
```

4. Wrap the `handler` function with `middy` and apply the `injectLambdaContext` middleware from step 2. Such that this:

```js
module.exports.handler = async (event, context) => {
  ...
}
```

becomes this:

```js
module.exports.handler = middy(async (event, context) => {
  ...
}).use(injectLambdaContext(logger))
```

5. In the `get-restaurants.js`, change the line

```js
const { Logger } = require('@aws-lambda-powertools/logger')
```

to

```js
const { Logger, injectLambdaContext } = require('@aws-lambda-powertools/logger')
```

6. The `get-restaurants` function already uses `middy` to load SSM parameters, so we don't need to wrap its handler. Instead, add the `injectLambdaContext` middleware to the list.

The handler goes from this:

```js
module.exports.handler = middy(async (event, context) => {
  ...
}).use(ssm({
  ...
})
```

to this:

```js
module.exports.handler = middy(async (event, context) => {
  ...
}).use(ssm({
  ...
}).use(injectLambdaContext(logger))
```

7. Repeat the same process for `search-restaurants.js`, `place-order.js` and `notify-restaurant.js`. Some of these uses `middy` already, some don't. Follow the same steps as above to add `middy` as necessary.

8. Run the integration tests with `npm run test` to make sure the tests are still passing. And notice in the console output that new fields are added to the log messages, such as `cold_start` and `function_memory_size`.

</p></details>

<details>
<summary><b>See the sampling in action</b></summary><p>

To see this sampling behaviour in action, you can either deploy to a `prod` stage, or you can change the default log level for our `dev` stage. For simplicity (and to avoid the hassle of setting up those SSM parameters for another stage), let's do that.

1. If you change the default log level to `INFO`, i.e. in the `serverless.yml`, change `custom.logLevel` to:

```yml
logLevel:
  prod: ERROR
  default: INFO
```

then redeploy

`npx sls deploy`

2. Now reload the homepage a few times, and you should occassionally see `debug` log messages in the logs for the `get-index` and `get-restaurants` functions. But you will always see the invocation event logged as `info`.

![](/images/mod22-001.png)

</p></details>
