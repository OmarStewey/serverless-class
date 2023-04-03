# Module 16: Per function IAM roles

## Give each function a dedicated IAM role

**Goal:** Each function has a dedicated IAM role to minimise attack surface

<details>
<summary><b>Install serverless-iam-roles-per-function plugin</b></summary><p>

1. Install `serverless-iam-roles-per-function` as dev dependency

`npm install --save-dev serverless-iam-roles-per-function`

2. Modify `serverless.yml` and add it as a plugin

```yml
plugins:
  - serverless-export-env
  - serverless-export-outputs
  - serverless-plugin-extrinsic-functions
  - serverless-iam-roles-per-function
```

</p></details>

<details>
<summary><b>Issue individual permissions</b></summary><p>

1. Open `serverless.yml` and delete the entire `iam` block

2. Give the `get-index` function its own IAM role statements by adding the following to its definition

```yml
iamRoleStatements:
  - Effect: Allow
    Action: execute-api:Invoke
    Resource: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGatewayRestApi}/${sls:stage}/GET/restaurants
```

**IMPORTANT** this new block should be aligned with `environment` and `events`, e.g.

```yml
get-index:
  handler: functions/get-index.handler
  events: ...
  environment:
    restaurants_api: ...
    orders_api: ...
    cognito_user_pool_id: ...
    cognito_client_id: ...
  iamRoleStatements:
    - Effect: Allow
      Action: execute-api:Invoke
      Resource: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGatewayRestApi}/${sls:stage}/GET/restaurants
```

3. Similarly, give the `get-restaurants` function its own IAM role statements

```yml
iamRoleStatements:
  - Effect: Allow
    Action: dynamodb:scan
    Resource: !GetAtt RestaurantsTable.Arn
  - Effect: Allow
    Action: ssm:GetParameters*
    Resource:
      - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${param:ssmStage, sls:stage}/get-restaurants/config
```

4. Give the `search-restaurants` function its own IAM role statements

```yml
iamRoleStatements:
  - Effect: Allow
    Action: dynamodb:scan
    Resource: !GetAtt RestaurantsTable.Arn
  - Effect: Allow
    Action: ssm:GetParameters*
    Resource:
      - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${param:ssmStage, sls:stage}/search-restaurants/config
      - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:service}/${param:ssmStage, sls:stage}/search-restaurants/secretString
  - Effect: Allow
    Action: kms:Decrypt
    Resource: ${ssm:/${self:service}/${param:ssmStage, sls:stage}/kmsArn}
```

5. Give the `place-order` function its own IAM role statements

```yml
iamRoleStatements:
  - Effect: Allow
    Action: events:PutEvents
    Resource: !GetAtt EventBus.Arn
```

6. Finally, give the `notify-restaurant` function its own IAM role statements

```yml
iamRoleStatements:
  - Effect: Allow
    Action: events:PutEvents
    Resource: !GetAtt EventBus.Arn
  - Effect: Allow
    Action: sns:Publish
    Resource: !Ref RestaurantNotificationTopic
```

7. Deploy the project

`npx sls deploy`

8. Run the acceptance tests to make sure they're still working

`npm run acceptance`

</p></details>
