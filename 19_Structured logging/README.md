# Module 19: Structured logging

## Apply structured logging to the project

<details>
<summary><b>Using a simple logger</b></summary><p>

The [AWS Lambda Powertools](https://awslabs.github.io/aws-lambda-powertools-typescript/latest/) has a number of utilities to make it easier to build production-ready serverless applications. The project is also available in Python, Java and .Net.

One of the tools available is a very simple logger that supports structured logging (amongst other things).

So, first, let's install the logger for our project.

1. At the project root, run the command `npm install --save @aws-lambda-powertools/logger` to install the logger.

Now we need to change all the places where we're using `console.log`.

2. Open `functions/get-index.js` and add the following to the top of the file

```javascript
const { Logger } = require('@aws-lambda-powertools/logger')
const logger = new Logger({ serviceName: process.env.serviceName })
```

on line 20, replace

```javascript
console.log(`loading restaurants from ${restaurantsApiRoot}...`)
```

with

```javascript
logger.debug('getting restaurants...', { url: restaurantsApiRoot })
```

Notice that the `restaurantsApiRoot` is captured as a separate `url` attribute in the log message. Capturing variables as attributes (instead of baking them into the message) makes them easier to search and filter by.

On line 37, replace

```javascript
console.log(`found ${restaurants.length} restaurants`)
```

with

```javascript
logger.debug('got restaurants', { count: restaurants.length })
```

Again, notice how `count` is captured as a separate attribute.

3. Open `functions/get-restaurants.js` and add the following to the top of the file

```javascript
const { Logger } = require('@aws-lambda-powertools/logger')
const logger = new Logger({ serviceName: process.env.serviceName })
```

On line 15, replace

```javascript
console.log(`fetching ${count} restaurants from ${tableName}...`)
```

with

```javascript
logger.debug('getting restaurants from DynamoDB...', {
  count,
  tableName
})
```

And then on line 25, replace

```javascript
console.log(`found ${resp.Items.length} restaurants`)
```

with

```javascript
logger.debug('found restaurants', {
  count: resp.Items.length
})
```

4. Open `functions/place-order.js` and add the following to the top of the file

```javascript
const { Logger } = require('@aws-lambda-powertools/logger')
const logger = new Logger({ serviceName: process.env.serviceName })
```

On line 13, replace

```javascript
console.log(`placing order ID [${orderId}] to [${restaurantName}]`)
```

with

```javascript
logger.debug('placing order...', { orderId, restaurantName })
```

Similarly, on line 28, replace

```javascript
console.log(`published 'order_placed' event into EventBridge`)
```

with

```javascript
logger.debug(`published event into EventBridge`, {
  eventType: 'order_placed',
  busName
})
```

5. Repeat the same process for `functions/notify-restaurant` and `functions/search-restaurants`, using your best judgement on what information you should log in each case.

6. So far, we have added a number of debug log messages. By default, the log level is set to `info` so we won't see these log messages. We can control the behaviour of the logger through a number of settings. These settings can be configured at the constructor level (for each logger) or using environment variables:

* Service name
* Logging level
* Log incoming event (applicable when used with `injectLambdaContext` middleware, more on this later)
* Debug log sampling (more on this later)

For now, let's set the log level to `debug`. Go back to the `serverless.yml`, and add this to `provider.environment`:

`LOG_LEVEL: debug`

(mind the indentation)

7. Run the integration tests

`npm run test`

and see that the functions are now logging in JSON

```
{"level":"DEBUG","message":"getting restaurants...","service":"workshop-yancui","timestamp":"2023-04-18T11:19:46.199Z","url":"https://os9v5foa01.execute-api.us-east-1.amazonaws.com/dev/restaurants"}
{"level":"DEBUG","message":"notified restaurant of order","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.205Z","orderId":"7e9768b5-cdc8-5413-b37f-c0969aab985e","restaurantName":"Fangtasia"}
{"level":"DEBUG","message":"getting restaurants from DynamoDB...","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.273Z","count":8,"tableName":"workshop-yancui-dev-RestaurantsTable-12DJXBCLOPCIP"}
 PASS  tests/test_cases/get-restaurants.tests.js
  ● Console

    console.log
      AWS credential loaded

      at log (tests/steps/init.js:25:11)

{"level":"DEBUG","message":"published event to EventBridge","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.608Z","eventType":"restaurant_notified","busName":"order_events_dev_yancui"}
{"level":"DEBUG","message":"found restaurants","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.664Z","count":8}
 PASS  tests/test_cases/get-index.tests.js
  ● Console

    console.log
      AWS credential loaded

      at log (tests/steps/init.js:25:11)

{"level":"DEBUG","message":"placing order...","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.956Z","orderId":"f55c3c7e-cfb4-525f-b97b-cda0d7845ab7","restaurantName":"Fangtasia"}
{"level":"DEBUG","message":"got restaurants","service":"workshop-yancui","timestamp":"2023-04-18T11:19:47.994Z","count":8}
 PASS  tests/test_cases/notify-restaurant.tests.js
  ● Console

    console.log
      AWS credential loaded

      at log (tests/steps/init.js:25:11)

    console.log
      stop polling SQS...

      at Object.log [as stop] (tests/messages.js:54:13)

    console.log
      long polling stopped

      at Object.log [as stop] (tests/messages.js:58:13)

{"level":"DEBUG","message":"published event into EventBridge","service":"workshop-yancui","timestamp":"2023-04-18T11:19:48.366Z","eventType":"order_placed","busName":"order_events_dev_yancui"}
{"level":"DEBUG","message":"finding restaurants with matching theme...","service":"workshop-yancui","timestamp":"2023-04-18T11:19:48.464Z","count":8,"theme":"cartoon"}
{"level":"DEBUG","message":"found restaurants","service":"workshop-yancui","timestamp":"2023-04-18T11:19:48.880Z","count":4}
 PASS  tests/test_cases/place-order.tests.js
  ● Console

    console.log
      AWS credential loaded

      at log (tests/steps/init.js:25:11)

    console.log
      [test-Andre-Bell-vjohkdzn] - user is created

      at Object.log [as an_authenticated_user] (tests/steps/given.js:38:11)

    console.log
      [test-Andre-Bell-vjohkdzn] - initialised auth flow

      at Object.log [as an_authenticated_user] (tests/steps/given.js:51:11)

    console.log
      [test-Andre-Bell-vjohkdzn] - responded to auth challenge

      at Object.log [as an_authenticated_user] (tests/steps/given.js:65:11)

    console.log
      [test-Andre-Bell-vjohkdzn] - user deleted

      at Object.log [as an_authenticated_user] (tests/steps/teardown.js:15:11)

    console.log
      stop polling SQS...

      at Object.log [as stop] (tests/messages.js:54:13)

    console.log
      long polling stopped

      at Object.log [as stop] (tests/messages.js:58:13)

 PASS  tests/test_cases/search-restaurants.tests.js
  ● Console

    console.log
      AWS credential loaded

      at log (tests/steps/init.js:25:11)

    console.log
      [test-Trevor-Harper-cxwsnhwx] - user is created

      at Object.log [as an_authenticated_user] (tests/steps/given.js:38:11)

    console.log
      [test-Trevor-Harper-cxwsnhwx] - initialised auth flow

      at Object.log [as an_authenticated_user] (tests/steps/given.js:51:11)

    console.log
      [test-Trevor-Harper-cxwsnhwx] - responded to auth challenge

      at Object.log [as an_authenticated_user] (tests/steps/given.js:65:11)

    console.info
      this is a secret

      at info (functions/search-restaurants.js:34:11)

    console.log
      [test-Trevor-Harper-cxwsnhwx] - user deleted

      at Object.log [as an_authenticated_user] (tests/steps/teardown.js:15:11)


Test Suites: 5 passed, 5 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        4.644 s, estimated 5 s
Ran all test suites.
```

</p></details>

<details>
<summary><b>Disable debug logging in production</b></summary><p>

Let's configure the `LOG_LEVEL` environment such that we'll be logging at `info` level in production, but logging at `debug` level everywhere else.

1. Open `serverless.yml`. Under the `custom` section at the top, add `logLevel` as below:

```yml
logLevel:
  prod: INFO
  default: DEBUG
```

2. Still in the `serverless.yml`, under `provider.environment` section, change the `LOG_LEVEL` environment variable to this

```yml
LOG_LEVEL: ${self:custom.logLevel.${sls:stage}, self:custom.logLevel.default}
```

This uses the `${xxx, yyy}` syntax to provide a fall back. In this case, we're saying "if there is an environment specific override available for the current stage, e.g. `custom.logLevel.dev`, then use it. Otherwise, fall back to `custom.logLevel.default`"

This is a nice trick to specify a stage-specific override, but then fall back to some default value otherwise.

After this change, the `provider` section should look like this:

```yml
provider:
  name: aws
  runtime: nodejs16.x
  eventBridge:
    useCloudFormation: true
  environment:
    rest_api_url: !Sub https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${sls:stage}
    serviceName: ${self:service}
    stage: ${sls:stage}
    ssmStage: ${param:ssmStage, sls:stage}
    middy_cache_enabled: true
    middy_cache_expiry_milliseconds: 60000 # 1 mins
    LOG_LEVEL: ${self:custom.logLevel.${sls:stage}, self:custom.logLevel.default}
```

This applies the `LOG_LEVEL` environment variable (used to decide what level the logger should log at) to all the functions in the project (since it's specified under `provider`).

</p></details>
