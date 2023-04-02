# Module 10: SSM Parameter Store

## Environment variables is not the answer for every configuration

So far all the configurations for our functions have been passed along via environment variables.

While environment variables is easy to configure and access from our code, and the Serverless framework makes it possible to share environment variables across all the functions in a project.

They do have a number of limitations:

* **Hard to share across projects**. For example, services might want to publicize their URLs, and API constraints (e.g. max batch size for updates, etc., like the ones you see in the AWS Service Quota console) so that other services can discover them easily without each having to hardcode in their own environment variables.

* **Cannot update an environment variable without deployment**. This is especially painful for those shared configs, which requires all dependent services to go through its own deployment.

* **Not a safe place for secrets, API keys, etc**. It's the first place an attacker would look if they ever compromise your function (maybe through a malicious/compromised dependency). There has been numerous attacks against NPM ecosystem that steals env variables.

My rule of thumb wrt environment variable is to use them for *static configuration* and *references to intra-service resources*. That is, resources that is part of this service.

**References to intra-service resources**
For example, DynamoDB tables that are owned and only used by this service. If they were to change, you will have to do an deployment anyway, and doing so will update the environment variables too. We have a lot of examples of this in our demo app - DynamoDB table names, Cognito user pool ID, etc.

**Static configurations**
For example, the default max no. of restaurants to show in the homepage, etc. You know, the kinda thing that you'll consider hardcoding into your app.

## Configurations that are not suitable for environment variables

**Dynamic configurations**
This includes any app configurations that you may wish to change on the fly, or allow a product/business owner to tweak and experiment with.

Depending on your requirements here, you can use SSM Parameter Store or external tools such as [LaunchDarkly](https://launchdarkly.com) or [Split](https://www.split.io).

For configurations that you want to change on the fly without having to redeploy the service(s), you should use SSM Parameter Store.

If you want to do A/B testing on different configurations, or implement a canary deployment for rolling out config changes, then consider using an external service such as LaunchDarkly or Split.

ps. there are some tricks to make Lambda work with LaunchDarkly, you can read more about them [here](https://lumigo.io/blog/canary-deployment-with-launchdarkly-and-aws-lambda/).

**Secrets**
For application secrets, you absolutely do not want to store them in environment variables in plain text.

Instead, you should load them from either SSM Parameter Store or Secrets Manager during a cold start, decrypt, and save the decrypted secrets in the application `context`. Again, **DON'T** put the decrypted secrets into the environment variable.

You should also cache them and invalidate the cache every X minutes so to allow rotation of these secrets where applicable.

In the following exercises, we're going to see how this can be done.

If you want to learn the difference between SSM Parameter Store and Secrets Manager, then check out [this video](https://www.youtube.com/watch?v=4I_ZrgjAdQw).

## Load dynamic configurations and app secrets

**Goal:** Load app configurations from SSM Parameter Store with cache and cache invalidation

In the `get-restaurants` and `search-restaurants` functions, we have hardcoded a default no. of restaurants to return.

```javascript
const defaultResults = process.env.defaultResults || 8
```

This is a reasonable example of something that you might wanna tweak on the fly.

Fortunately, for Node.js functions there is the [middy](https://github.com/middyjs) middleware engine. It comes with a [SSM middleware](https://github.com/middyjs/middy/tree/master/packages/ssm) that can implement the flow for us:

* load app configure at cold start
* cache it
* invalidate the cache at a specified frequency

<details>
<summary><b>Add configurations to SSM Parameter Store</b></summary><p>

1. Go to `Systems Manager` console in AWS

2. Go to `Parameter Store`

3. Click `Create Parameter`

4. Use the name `/{service-name}/dev/get-restaurants/config` where `service-name` is the `service` name in your `serverless.yml`.

For the value of the parameter, to allow us to add other configurations in the future, let's enter a JSON string:

```json
{
  "defaultResults": 8
}
```

![](/images/mod12-001.png)

5. Click `Create Parameter`

6. Repeat step 3-5 to create another `/{service-name}/dev/search-restaurants/config` parameter, also set it to

```json
{
  "defaultResults": 8
}
```

</p></details>

<details>
<summary><b>Load SSM parameters at runtime</b></summary><p>

1. First install `middy` as a dependency.

`npm install --save @middy/core`

and also Middy's SSM middleware:

`npm install --save @middy/ssm`

With v4.x of the SSM middleware, you also need to install the AWS SDK v3 SSM client separately. At the time of writing, the middleware doc says you should install this as a dev dependency, but that's incorrect. The Serverless framework automatically removes dev dependencies during packaging, so at runtime the SSM middleware would err because it can't find the AWS SDK's SSM client.

So, instead, we would need to install the SSM client as a production dependency.

`npm install --save @aws-sdk/client-ssm`

2. To load the parameters we created in the last step, we need to know the `service` and `stage` names at runtime.

These are perfect examples of static values that can be passed in via environment variables. So let's do that.

Open `serverless.yml`, under `provider`, let's add two environment variables for `serviceName` and `stage`.

**NOTE**: environment variables that are configured under `provider.environment` would be copied to all functions by defautl.

This is what we need to add:

```yml
serviceName: ${self:service}
stage: ${sls:stage}
```

After this change, your `provider` section should look like this:

```yml
provider:
  name: aws
  runtime: nodejs18.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action: dynamodb:scan
          Resource: !GetAtt RestaurantsTable.Arn
        - Effect: Allow
          Action: execute-api:Invoke
          Resource: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGatewayRestApi}/${sls:stage}/GET/restaurants
  environment:
    rest_api_url: !Sub https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${sls:stage}
    serviceName: ${self:service}
    stage: ${sls:stage}
```

3. Open `functions/get-restaurants.js`, and add these two lines to the top to require `middy` and its `ssm` middleware.

```javascript
const middy = require('@middy/core')
const ssm = require('@middy/ssm')
```

4. On line 7

```javascript
const defaultResults = process.env.defaultResults || 8
```

We no longer need this, as `defaultResults` would come from the configuration we have in SSM.

But, we need to know the `service` name and `stage` name so we can fetch the parameter we created earlier.

So, replace this line with the following.

```javascript
const { serviceName, stage } = process.env
```

5. Replace the whole `module.exports.handler = ...` block with the following:

```javascript
module.exports.handler = middy(async (event, context) => {
  const restaurants = await getRestaurants(context.config.defaultResults)
  const response = {
    statusCode: 200,
    body: JSON.stringify(restaurants)
  }

  return response
}).use(ssm({
  cache: true,
  cacheExpiry: 1 * 60 * 1000, // 1 mins
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${stage}/get-restaurants/config`
  }
}))
```

Let's take a moment to talk through what we've just done.

[Middy](https://github.com/middyjs/middy) is a middleware engine that let's you run middlewares (basically, bits of logic before and after your handler code runs). To use it you have to wrap the handler code, i.e.

```javascript
middy(async (event, context) => {
  ... // function handler logic goes here
})
```

This returns a wrapped function, which exposes a `.use` method, that lets you chain middlewares that you want to apply. You can read about how it works [here](https://middy.js.org/docs/intro/how-it-works).

So, to add the `ssm` middleware, we have:

```javascript
middy(async (event, context) => {
  ... // function handler logic goes here
}).use(ssm({
  ... // configuration of the SSM middleware goes here
}))
```

* `cache: true` tells the middleware to cache the SSM parameter value, so we don't hammer SSM Parameter Store with requests.
* `cacheExpiry: 1 * 60 * 1000` allows the cached value to be expired after 1 minute. So if we change the configuration in SSM Parameter Store, then the concurrent executions would load the new value when their cache expires, without needing a deployment.
* `fetchData: { config: ... }` fetches individual parameters and stores them in either the invocation `context` object, or the environment variables. By default, they're stored in the environment variables, but we can use the optional config `setToContext` to tell the middleware to store them in the `context` object instead.

* notice on ln22, where we call the `getRestaurants` function? Now, we're passing `context.config.defaultResults` that we set above.

```javascript
const restaurants = await getRestaurants(context.config.defaultResults)
```

6. Let's run our integration tests to make sure everything still works.

`npm run test`

```
 PASS  tests/test_cases/get-index.tests.js
 PASS  tests/test_cases/get-restaurants.tests.js
 PASS  tests/test_cases/search-restaurants.tests.js

Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        5.082 s, estimated 9 s
Ran all test suites.
```

That's great! Now, let's do the same thing for the `search-restaurants` function.

7. Open `functions/search-restaurants.js`, and add these two lines to the top.

```javascript
const middy = require('@middy/core')
const ssm = require('@middy/ssm')
```

8. Replace line 7

```javascript
const defaultResults = process.env.defaultResults || 8
```

with the following

```javascript
const { serviceName, stage } = process.env
```

9. Replace the whole `module.exports.handler = ...` block with the following.

```javascript
module.exports.handler = middy(async (event, context) => {
  const req = JSON.parse(event.body)
  const theme = req.theme
  const restaurants = await findRestaurantsByTheme(theme, context.config.defaultResults)
  const response = {
    statusCode: 200,
    body: JSON.stringify(restaurants)
  }

  return response
}).use(ssm({
  cache: true,
  cacheExpiry: 1 * 60 * 1000, // 1 mins
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${stage}/search-restaurants/config`
  }
}))
```

This is essentially the same change we made in the `get-restaurants` function, except, pointing to a different SSM parameter.

10. Rerun the integration tests.

`npm run test`

and see that all three tests are still passing.

```
 PASS  tests/test_cases/get-index.tests.js
 PASS  tests/test_cases/get-restaurants.tests.js
 PASS  tests/test_cases/search-restaurants.tests.js

Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        4.897s, estimated 9s
```

</p></details>

<details>
<summary><b>Configure IAM permissions</b></summary><p>

There's one last thing we need to do for this to work once we deploy the app - IAM permissions.

1. Open `serverless.yml`, and find the `statements` block under `provider.iam.role`, add the following permission statement.

```yml
- Effect: Allow
  Action: ssm:GetParameters*
  Resource:
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/get-restaurants/config
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/search-restaurants/config
```

After the change, the `provider.iam` block should look like this.

```yml
iam:
  role:
    statements:
      - Effect: Allow
        Action: dynamodb:scan
        Resource: !GetAtt RestaurantsTable.Arn
      - Effect: Allow
        Action: execute-api:Invoke
        Resource: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGatewayRestApi}/${sls:stage}/GET/restaurants
      - Effect: Allow
        Action: ssm:GetParameters*
        Resource:
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/get-restaurants/config
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/search-restaurants/config
```

2. Deploy the project 

`npx sls deploy`

3. Run the acceptance to make sure everything is still working

`npm run acceptance`

```
 PASS  tests/test_cases/get-restaurants.tests.js
  ● Console

    console.info tests/steps/when.js:40
      invoking via HTTP GET https://4q8sbvheq2.execute-api.us-east-1.amazonaws.com/dev/restaurants

 PASS  tests/test_cases/get-index.tests.js
  ● Console

    console.info tests/steps/when.js:40
      invoking via HTTP GET https://4q8sbvheq2.execute-api.us-east-1.amazonaws.com/dev/

 PASS  tests/test_cases/search-restaurants.tests.js
  ● Console

    console.info tests/steps/when.js:40
      invoking via HTTP POST https://4q8sbvheq2.execute-api.us-east-1.amazonaws.com/dev/restaurants/search


Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        4.933s, estimated 5s
```

</p></details>

<details>
<summary><b>Changing the config dynamically</b></summary><p>

Now let's see the config reload in action.

1. Load the index page in the browser, to make sure it's still returning 8 restaurants.

2. Go to `Systems Manager` console in AWS

3. Go to `Parameter Store`

4. Find the `get-restaurants` config, click `Edit`

5. Change the `defaultResults` value to 4, and `Save Changes`

![](/images/mod12-002.png)

6. Reload the index page, since we set the cache expiry to 1 minute, you might have to reload a few times before you see the index page return 4 restaurants instead.

![](/images/mod12-003.png)

7. Change the `defaultResults` value back to 8, otherwise, our acceptance tests would start failing. And while you're here, click the `History` tab and see the revisions we have made to this parameter.

![](/images/mod12-004.png)

Of course, in practice, I don't expect anyone to be editing application config by hand, especially when the people that will be editing these configurations are not developers. Instead, I expect you to have some sort of internal tool where you can perform validation, etc. as well on the configuration.

Services like [Retool](https://retool.com) makes building these internal admin tools very easy. They have no direct integration with SSM so you'd have to build some integration layer yourself.

</p></details>

<details>
<summary><b>Fixing the connection closing issue with Middy</b></summary><p>

After this round of changes, you might have noticed that the integration tests now give you this warning message at the end.

![](/images/mod12-013.png)

This is caused by a known issue with Middy 4.x when you use the cache expiry feature. See the GitHub issue here. This issue can block CI runners from finishing your tests, so we must address it here.

What we can do is to disable the caching behaviour in our tests, but leave them on in the real thing.

To do that, we can:

Step 1. move the configuration into a shared environment variable (as in, shared across all the functions in this project)

Step 2. create an override .env file for our tests

Ok, let's do it!

1. Open the `serverless.yml`, and under `provider.environment` add the following:

```yml
middy_cache_enabled: true
middy_cache_expiry_milliseconds: 60000 # 1 mins
```

After this change, your `provider.environment` section should look like this:

```yml
environment:
  rest_api_url: !Sub https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${sls:stage}
  serviceName: ${self:service}
  stage: ${sls:stage}
  middy_cache_enabled: true
  middy_cache_expiry_milliseconds: 60000 # 1 mins
```

2. Add a file called `.test.env` at the project root with the following content:

```
middy_cache_enabled=false
middy_cache_expiry_milliseconds=0
```

3. Open `tests/steps/init.js` and replace line 3

```js
require('dotenv').config()
```

with

```js
const dotenv = require('dotenv')
dotenv.config({ path: './.test.env' })
dotenv.config()
```

To load both the `.env` file generated by the `serverless-export-env` plugin, and the `.test.env` file we created by hand just now.

**NOTE**: the order these files are loaded is important. Because we want the `.test.env` to override whatever is in `.env`, so we have to load it first. This is how the `dotenv` module handles overlapping env variables - first one wins.

4. Open the `get-restaurants.js` module, and add these two lines somewhere around the top:

```js
const middyCacheEnabled = JSON.parse(process.env.middy_cache_enabled)
const middyCacheExpiry = parseInt(process.env.middy_cache_expiry_milliseconds)
```

We need to parse the two new environment variables because all environment variables would come in as strings.

And at the bottom of the function where we configure the `ssm` middleware:

```js
}).use(ssm({
  cache: true,
  cacheExpiry: 1 * 60 * 1000, // 1 mins
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${stage}/get-restaurants/config`
  }
}))
```

replace this block with the following:

```js
}).use(ssm({
  cache: middyCacheEnabled,
  cacheExpiry: middyCacheExpiry,
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${stage}/get-restaurants/config`
  }
}))
```

so the `cache` and `cacheExpiry` configurations are now controlled by our new environment variables.

5. Repeat step 4 for the `search-restaurants.js` module.

6. Rerun the integration tests

`npm run test`

and the warning message should be gone.

</p></details>

<details>
<summary><b>Sharing SSM parameters across temporary environments</b></summary><p>

When using serverless technologies, you should use [temporary environments](https://theburningmonk.com/2019/09/why-you-should-use-temporary-stacks-when-you-do-serverless/) and take advantage of the pay-per-use nature of the services you tend to use.

This includes:

* Create a new environment for feature work.
* Create a new environment for every developer.
* Create a new environment for every CI run, so you don't have to worry about accumulating test data in your shared environments like dev, test and staging.

These temporary environments are short-lived and can be easily torn down when you don't need them anymore. And they can all live in the same AWS account. If you follow the practices we have demonstrated in this workshop and either:

* Let CloudFormation name your resources
* Ensure resource names include the `stage` name

then you wouldn't run into problems with clashing names for Lambda functions, CloudWatch log groups, etc. etc. To create a new environment, simply run `npx sls deploy --stage feature-name` to create a new environment for a new feature. And when you're done, run `npx sls remove --stage feature-name` to dismantle the environment.

However, some nuances are required when you mix **serverful** resources with serverless resources. Because you will pay for uptime for those serverful resources (you know, ones where you have to provision a cluster of nodes and pay by the hour).

I discussed these nuances in a recent [blog post](https://theburningmonk.com/2023/02/how-to-handle-serverful-resources-when-using-ephemeral-environments/), please have a read when you have time.

But there's another important nuance to consider concerning using temporary environments with SSM parameters.

Namely, **how can you share SSM parameters across these temporary environments**?

Let me show you an easy way, by introducing a layer of indirection.

We will introduce a new `ssmStage` parameter to tell our functions which environment's SSM parameters we should use.

That way, when we create a new `dev-yan` stage, we can still use the same SSM parameters from the `dev` stage (assuming that's the one we want to use).

Luckily for us, the Serverless framework supports custom parameters, see the official documentation [here](https://www.serverless.com/framework/docs/guides/parameters) for more details.

1. Open `serverless.yml` and add the following to `provider.environment`:

```yml
ssmStage: ${param:ssmStage, sls:stage}
```

This adds a new `ssmStage` environment variable for all of our functions in this project. And it'll look for a `ssmStage` parameter from the CLI, and if not found, it'll fallback to the built-in `sls:stage` variable and use the stage name instead.

Again, check your indentations ;-)

2. Under `provider.iam.role.statement`, we also need to change the ARNs for the SSM parameters to use this new parameter.

Change this IAM statement:

```yml
- Effect: Allow
  Action: ssm:GetParameters*
  Resource:
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/get-restaurants/config
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${sls:stage}/search-restaurants/config
```

to the following:

```yml
- Effect: Allow
  Action: ssm:GetParameters*
  Resource:
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${param:ssmStage, sls:stage}/get-restaurants/config
    - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${param:ssmStage, sls:stage}/search-restaurants/config
```

3. Open the `get-restaurants.js` module.

Replace this line:

```js
const { serviceName, stage } = process.env
```

with

```js
const { serviceName, ssmStage } = process.env
```

And replace the path of the SSM parameter in this block

```js
}).use(ssm({
  cache: middyCacheEnabled,
  cacheExpiry: middyCacheExpiry,
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${stage}/get-restaurants/config`
  }
}))
```

to use the new `ssmStage` environment variable instead, ie.

```js
}).use(ssm({
  cache: middyCacheEnabled,
  cacheExpiry: middyCacheExpiry,
  setToContext: true,
  fetchData: {
    config: `/${serviceName}/${ssmStage}/get-restaurants/config`
  }
}))
```


4. Repeat step 3 for `search-restaurants.js` module.

5. Rerun the integration tests

`npm run test`

and make sure the tests are still passing.

6. [Optional] To test this out with a temporary environment, run

`npx sls deploy --stage dev-[YOUR NAME] --param="ssmStage=dev"`

(replace `[YOUR NAME]` with your name, no spaces)

This creates a new environment called, for example, `dev-yan`, but it would use the SSM parameters from the main `dev` environment that we had configured by hand earlier.

To generate a new `.env` file for this environment, we can run

`npx sls export-env --all --stage dev-[YOUR NAME] --param="ssmStage=dev"`

(again, replace `[YOUR NAME]`)

Inspect the new `.env` file, and you should see the stage name in the URL paths as well as the DynamoDB table name.

**Unfortunately**, our package.json scripts are not set up to accept this new parameter at the moment. So to keep this step brief, let's run the tests using jest directly.

To run the integration tests using the newly generated `.env` file, run:

`npx cross-env TEST_MODE=handler jest`

And the tests should pass.

Then run the e2e tests without regenerating the `.env` file:

`npx cross-env TEST_MODE=http jest`

And the tests should also pass.

Now that we're done, let's delete this temporary environment by running

`npx sls remove --stage dev-[YOUR NAME] --param="ssmStage=dev"`

(again, replace `[YOUR NAME]`)

Finally, it's worth noting that this `--param="ssmStage=dev"` flag is only needed when you work on the temporary environment.

Because of the fallback we used when referencing this parameter in the `serverless.yml` (i.e. `${param:ssmStage, sls:stage}`), you don't need to set this parameter when working with the main stages such as dev, test and staging.

</p></details>

<details>
<summary><b>SSM Parameter Store and serverless.yml</b></summary><p>

At this point, I should also mention that the Serverless has built-in support for reading parameter values from the SSM Parameter Store. You can read more about it in their docs [here](https://serverless.com/framework/docs/providers/aws/guide/variables/#reference-variables-using-the-ssm-parameter-store).

The difference is that, those parameters are read during deployment, so there's no mechanic for reloading them on the fly without redeployment, and it's also not a safe way to distribute application secrets, credentials and API keys, and so on.

We'll tackle application secrets in the next exercise, but for now, let's see how we can publicize the service URL for our demo app.

</p></details>

<details>
<summary><b>Increase SSM Parameter Store's throughput limit</b></summary><p>

By default, SSM Parameter Store doesn't charge you for usage. On the flip side, it restricts you to a measly **40 ops/second**. This is often not enough in a production environment, especially if functions need to load, and periodically refresh their configs from SSM Parameter Store.

Fortunately, you can significantly raise this throughput limit by, going to the `SSM Parameter Store` console, go to the `Settings` tab, and click `Set Limit`.

![](/images/mod12-009.png)

And accept that from now on, you'll incur cost for using SSM Parameter Store.

![](/images/mod12-010.png)

Don't worry, the cost of SSM Parameter Store is very reasonable and shouldn't be a huge burden on your AWS bill.

![](/images/mod12-011.png)

And you might noticed that you can also have "Advanced Parameters". This helps you alleviate the limit of 10,000 parameters per region, and 4KB per parameter.

If you have large configurations (up to 8KB) then you should consider using advanced parameters. However, since SSM now supports an intelligent tier, it's best to use that.

![](/images/mod12-012.png)

</p></details>

## Publicize service information to Parameter Store

**Goal:** Publicize the service's root URL and operation constraints to SSM Parameter Store for other services to consume

<details>
<summary><b>Output the service URL as an SSM parameter</b></summary><p>

1. Open `serverless.yml`.

2. In the `resources.Resources` section, add a `ServiceUrlParameter` resource after the `ServerCognitoUserPoolClient`.

```yml
ServiceUrlParameter:
  Type: AWS::SSM::Parameter
  Properties:
    Type: String
    Name: /${self:service}/${sls:stage}/serviceUrl
    Value:
      Fn::Join:
        - ""
        - - https://
          - !Ref ApiGatewayRestApi
          - .execute-api.${aws:region}.amazonaws.com/${sls:stage}
```

Oh, and while you're here, the crazy thing is that CloudFormation doesn't currently support `SecureString` parameters...

![](/images/mod12-005.png)

If this is something you need, then please let me konw and I can publish my CloudFormation custom resource for creating one.

3. Deploy the project.

`npx sls deploy`

And you should now see the parameter in SSM parameter store.

![](/images/mod12-006.png)

![](/images/mod12-007.png)

From here, other services that want to use your service can find out the service URL by referencing this SSM parameter.

</p></details>

<details>
<summary><b>Output the operation constraints as SSM parameters</b></summary><p>

In the `get-restaurants` and `search-restaurants` functions, we can potentially accept a query string parameter, say, `count`, to let the caller decide how many results we should return.

But when we do that, we're gonna want to make sure we have some validation in place so that `count` has to be within some reasonable range.

We can communicate operation constraints like this (i.e. `maxCount`) to other services by publishing them as SSM parameters. e.g.

`/{service-name}/{stage}/get-restaurants/constraints/maxCount`

`/{service-name}/{stage}/search-restaurants/constraints/maxCount`

Or maybe we can bundle everything into a single JSON file, and publish a single parameter.

`/{service-name}/{stage}/serviceQuotas`

(following AWS's naming)

We're not going to implement it here, but please feel free to take a crack at this yourself if you fancy exploring this idea further ;-)

</p></details>
