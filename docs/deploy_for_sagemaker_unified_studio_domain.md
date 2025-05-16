# Deploy Resources for Data Solutions Built on an Amazon SageMaker Unified Studio Domain

1. Export AWS credentials and the primary Region information to your development environment for the AWS IAM role with administrative permissions, use the following format:
```bash
         export AWS_REGION=
         export AWS_ACCESS_KEY_ID=
         export AWS_SECRET_ACCESS_KEY=
         export AWS_SESSION_TOKEN=
```

2. Bootstrap the AWS account in the primary and secondary Regions by using AWS CDK and running the following command:
```bash
      cdk bootstrap aws://<AWS_ACCOUNT_ID>/<AWS_REGION>
      cdk bootstrap aws://<AWS_ACCOUNT_ID>/<AWS_SECONDARY_REGION>
```
3. Change to ```unified-studio``` directory. In the ```config/Config.ts``` file, modify the following parameters.

```bash
cd unified-studio

SMUS_APPLICATION_NAME - Name of the application.
SMUS_SECONDARY_REGION – Secondary AWS region for backup.
SMUS_BACKUP_INTERVAL_MINUTES – Minutes before each backup interval. 
SMUS_STAGE_NAME - Name of the stage. 
SMUS_DOMAIN_ID – Domain identifier of the Amazon SageMaker Unified Studio. 
SMUS_PROJECT_ID – Project identifier of the Amazon SageMaker Unified Studio. 
SMUS_ASSETS_REGISTRAR_ROLE_ARN- ARN of the AWS Lambda role. 
```

4.	Install the dependencies by running the following command. 
```bash
npm install
```


5. Synthesise to create the AWS CloudFormation template.

```bash
cdk synth
```

6. Deploy the solution.

```bash
cdk deploy --all
```
