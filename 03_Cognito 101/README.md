# Module 3: Cognito 101

## Create a new Cognito User Pool

**Goal:** Set up a new Cognito User Pool by hand

Don't worry, we'll do this properly using Infrastrcture-as-Code (Iac) in a minute. But I'd like to give you a chance to see all the different configuration options and get a sense of what Cognito can do for you.

<details>
<summary><b>Add a new Cognito User Pool</b></summary><p>

1. Go to the Cognito console

2. Click `Create user pool`

3. Under the question `Cognito user pool sign-in options`, tick `Email`

![](/images/mod05-001.png)

4. Click `Next`

5. Leave `Password policy mode` on the default `Cognito default`

![](/images/mod05-002.png)

6. Under `Multi-factor authentication`, choose `No MFA`. You should configure MFA for production, but it'll make our life more difficult at this point, so for the purpose of this workshop, let's skip it.

![](/images/mod05-003.png)

7. Accept the default settings for `User account recovery`.

8. Click `Next`

9. Accept all the default settings in the next screen

![](/images/mod05-004.png)

10. Click `Next`

11. Change `Email provider` to `Send email with Cognito`. In practice, you should use SES instead. But for that to work, you should set up an SES domain first. For the purpose of this workshop, we'll ask Cognito to send emails and live with the 50 emails per day limitation.

![](/images/mod05-005.png)

12. Click `Next`

13. Under `User pool name`, enter something, e.g. `prsls-test`

</p></details>

<details>
<summary><b>Add client for web</b></summary><p>

To interact with the Cognito User Pool, we also need to create an app client. You can create separate app clients for the frontend and the backend.

For now, we will only create an app client for the web client.

1. Under the `Initial app client`, name the app client `web`.

![](/images/mod05-006.png)

2. Leave everything else as they are, but take a moment to look at the options under `Advanced app client settings` to understand what defaults Cognito has selected for us.

![](/images/mod05-007.png)

3. Click `Next`

</p></details>

<details>
<summary><b>Complete the creation process</b></summary><p>

1. Review the settings

![](/images/mod05-008.png)

2. Click `Create user pool`

3. Note the `User pool ID`, you would need to know where to find this when you need to configure a frontend application to talk to Cognito.

![](/images/mod05-009.png)

4. You would also need to know where to find the app client ID. Under the `App integration` tab

![](/images/mod05-010.png)

it's all the way down at the bottom

![](/images/mod05-011.png)

</p></details>

**Goal:** Set up a new Cognito User Pool with CloudFormation

Ok, now that you've seen how to do it by hand and have glimpsed the things that Cognito can do for you, let's translate what we've done to CloudFormation.

<details>
<summary><b>Add a new Cognito User Pool resource</b></summary><p>

1. In the `serverless.yml`, under `resources` and `Resources`, add another CloudFormation resource after the `RestaurantTable`.

```yml
CognitoUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    AliasAttributes:
      - email
    UsernameConfiguration:
      CaseSensitive: false
    AutoVerifiedAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireLowercase: true
        RequireNumbers: true
        RequireUppercase: true
        RequireSymbols: true
    Schema:
      - AttributeDataType: String
        Mutable: true
        Name: given_name
        Required: true
        StringAttributeConstraints:
          MinLength: "1"
      - AttributeDataType: String
        Mutable: true
        Name: family_name
        Required: true
        StringAttributeConstraints:
          MinLength: "1"
      - AttributeDataType: String
        Mutable: true
        Name: email
        Required: true
        StringAttributeConstraints:
          MinLength: "1"
```

**IMPORTANT**: this should be aligned with the `RestaurantTable`, i.e.

```yml
resources:
  Resources:
    RestaurantsTable:
      ...

    CognitoUserPool:
      ...
```

</p></details>

<details>
<summary><b>Add the web and server clients</b></summary><p>

1. In the `serverless.yml`, under `resources` and `Resources`, add another CloudFormation resource after the `CognitoUserPool`.

```yml
WebCognitoUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: web
    UserPoolId: !Ref CognitoUserPool
    ExplicitAuthFlows:
      - ALLOW_USER_SRP_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
    PreventUserExistenceErrors: ENABLED
```

**IMPORTANT**: this should be aligned with the `RestaurantTable` and `CognitoUserPool`, i.e.

```yml
resources:
  Resources:
    RestaurantsTable:
      ...

    CognitoUserPool:
      ...

    WebCognitoUserPoolClient:
      ...
```

2. Add the server client after the `WebCognitoUserPoolClient`:

```yml
ServerCognitoUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: server
    UserPoolId: !Ref CognitoUserPool
    ExplicitAuthFlows:
      - ALLOW_ADMIN_USER_PASSWORD_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
    PreventUserExistenceErrors: ENABLED
```

Again, mind the YML indentation:

```yml
resources:
  Resources:
    RestaurantsTable:
      ...

    CognitoUserPool:
      ...

    WebCognitoUserPoolClient:
      ...

    ServerCognitoUserPoolClient:
      ...
```

</p></details>

<details>
<summary><b>Add Cognito resources to stack Output</b></summary><p>

We have added a couple of CloudFormation resources to our stack, let's add the relevant information to our stack output.

* Cognito User Pool ID
* Cognito User Pool ARN
* Web client ID
* Server client ID

1. In the `serverless.yml`, add the following to the `Outputs` section (after `RestaurantsTableName`)

```yml
CognitoUserPoolId:
  Value: !Ref CognitoUserPool

CognitoUserPoolArn:
  Value: !GetAtt CognitoUserPool.Arn

CognitoUserPoolWebClientId:
  Value: !Ref WebCognitoUserPoolClient

CognitoUserPoolServerClientId:
  Value: !Ref ServerCognitoUserPoolClient
```

Afterwards, your `Outputs` section should look like this:

```yml
Outputs:
  RestaurantsTableName:
    Value: !Ref RestaurantsTable

  CognitoUserPoolId:
    Value: !Ref CognitoUserPool

  CognitoUserPoolArn:
    Value: !GetAtt CognitoUserPool.Arn

  CognitoUserPoolWebClientId:
    Value: !Ref WebCognitoUserPoolClient

  CognitoUserPoolServerClientId:
    Value: !Ref ServerCognitoUserPoolClient
```

</p></details>

<details>
<summary><b>Deploy the project</b></summary><p>

1. Run `npx sls deploy` to deploy the new resources. After the deployment finishes, you should see the new Cognito User Pool that you added via CloudFormation.

2. Now that we don't need it anymore, delete the Cognito User Pool that you created by hand. Feel free to compare the two side-by-side before you do, functionally they are equivalent for the purpose of this demo.

</p></details>
