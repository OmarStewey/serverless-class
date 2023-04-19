# Module 21: X-Ray

Invocation traces in X-Ray

<details>
<summary><b>Integrating with X-Ray</b></summary><p>

1. In the `serverless.yml` under the `provider` section, add the following:

```yml
tracing:
  apiGateway: true
  lambda: true
```

**NOTE** this should align with `name`, `runtime` and `environment`.

2. Add the following back to the `provider` section:

```yml
iam:
  role:
    statements:
      - Effect: Allow
        Action:
          - "xray:PutTraceSegments"
          - "xray:PutTelemetryRecords"
        Resource: "*"
```

**IMPORTANT** this should be aligned with `provider.tracing` and `provider.environment`. e.g.

```yml
provider:
  name: aws
  runtime: nodejs18.x
  stage: dev
  environment:
    ...
  tracing:
    apiGateway: true
    lambda: true
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - "xray:PutTraceSegments"
            - "xray:PutTelemetryRecords"
          Resource: "*"
```

This enables X-Ray tracing for all the functions in this project. Normally, when you enable X-Ray tracing in the `provider.tracing` the Serverless framework would add these permissions for you automatically. However, since we're using the `serverless-iam-roles-per-function`, these additional permissions are not passed along...

So far, the best workaround I have found, short of fixing the plugin to do it automatically, is to add this blob back to the `provider` section and tell the plugin to inherit these shared permissions in each function's IAM role.

To do that, we need the functions to inherit the permissions from this default IAM role.

3. Modify `serverless.yml` to add the following to the `custom` section

```yml
serverless-iam-roles-per-function:
  defaultInherit: true
```

This is courtesy of the `serverless-iam-roles-per-function` plugin, and tells the per-function roles to inherit these common permissions.

4. Deploy the project

`npx sls deploy`

5. Load up the landing page, and place an order. Then head to the X-Ray console and see what you get.

![](/images/mod23-001.png)

![](/images/mod23-002.png)

![](/images/mod23-003.png)

As you can see, you get some useful bits of information. However, if I were to debug performance issues of, say, the `get-restaurants` function, I need to see how long the call to DynamoDB took, that's completely missing right now.

To make our traces more useful, we need to capture more information about what our functions are doing. To do that, we need more instrumentation.

</p></details>

<details>
<summary><b>Enhancing X-Ray traces</b></summary><p>

At the moment we're not getting a lot of value out of X-Ray. We can get much more information about what's happening in our code if we instrument the various steps.

The AWS Lambda Powertools have some built-in facilities to help enhance the tracing. Such as tracing the AWS SDK and HTTP requests.

1. Install `@aws-lambda-powertools/tracer` as a production dependency

`npm install --save @aws-lambda-powertools/tracer`

2. In `functions/get-index.js`, add the following to the list of dependencies at the top of the file

```js
const { Tracer, captureLambdaHandler } = require('@aws-lambda-powertools/tracer')
const tracer = new Tracer({ serviceName: process.env.serviceName })
```

Creating a `Tracer` would automatically capture outgoing HTTP requests (such as the request to the `GET /restaurants` endpoint). So if this is all we do, and we deploy now, then in the X-Ray traces for the `get-index` function we will see the calls to the `GET /restaurants` endpoint as well as basic information from the `get-restaurants` function.

![](/images/mod23-004.png)

But we can do more, while we're here.

3. Staying in the `get-index.js` module, at the bottom of the file, add the `captureLambdaHandler` middleware:

```js
.use(captureLambdaHandler(tracer))
```

After this change, the `handler` function should look like this:

```js
module.exports.handler = middy(async (event, context) => {
  logger.refreshSampleRateCalculation()

  ...
}).use(injectLambdaContext(logger))
.use(captureLambdaHandler(tracer))
```

The `captureLambdaHandler` middleware adds a `## functions/get-index.handler` segment to the X-Ray trace, and captures additional information about the invocation:

* if it's a cold start
* the name of the service
* the response of the invocation

![](/images/mod23-005.png)

![](/images/mod23-006.png)

4. Still in the `get-index.js` module, we can also add the HTTP response from the `GET /restaurants` endpoint as metadata.

On line 35, where we have:

```js
return (await httpReq).data
```

replace it with:

```js
const data = (await httpReq).data
tracer.addResponseAsMetadata(data, 'GET /restaurants')

return data
```

Doing this would add the HTTP response to metadata for the `## functions/get-index.handler` segment mentioned above:

![](/images/mod23-007.png)

5. Open `get-restaurants.js` and add the following to list of dependencies at the top of the file:

```js
const { Tracer, captureLambdaHandler } = require('@aws-lambda-powertools/tracer')
const tracer = new Tracer({ serviceName: process.env.serviceName })
tracer.captureAWSv3Client(dynamodb)
```

**IMPORTANT**: this block needs to come **AFTER** where you have declared the `dynamodb` client instance.

6. Staying in the `get-restaurants.js` module, at the bottom of the file, add the `captureLambdaHandler` middleware:

```js
.use(captureLambdaHandler(tracer))
```

After this change, the `handler` function should look like this:

```js
module.exports.handler = middy(async (event, context) => {
  logger.refreshSampleRateCalculation()

  ...
}).use(injectLambdaContext(logger))
.use(captureLambdaHandler(tracer))
```

Doing these two steps would enrich the trace for the `get-restaurants` function. You will now be able to see the DynamoDB Scan call:

![](/images/mod23-008.png)

7. Repeat step 5-6 for `functions/search-restaurants.js`.

8. Repeat step 5-6 for `functions/place-order.js`, **EXCEPT** you want to use the tracer to capture the `eventBridge` client instead of the DynamoDB client.

9. Repeat step 5-6 for `functions/place-order.js`, **EXCEPT** you want to use the tracer to capture both the `eventBridge` client **AND** the `sns` client.

10. Deploy the project

`npx sls deploy`

11. Load up the landing page, and place an order. Then head to the X-Ray console and see what you get now.

</p></details>
