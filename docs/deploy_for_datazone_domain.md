# Deploy Resources for Data Solutions Built on an Amazon DataZone Domain

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

3. Change to ```datazone``` directory. In the ```config/Config.ts``` file, modify the following parameters.

```bash
cd datazone

DZ_APPLICATION_NAME - Name of the application.
DZ_SECONDARY_REGION – Secondary AWS region for backup.
DZ_BACKUP_INTERVAL_MINUTES – Minutes before each backup interval. 
DZ_STAGE_NAME - Name of the stage (dev/qa/prod). 
DZ_DOMAIN_NAME - Name of the Amazon DataZone domain
DZ_DOMAIN_DESCRIPTION - Description of the Amazon DataZone domain
DZ_DOMAIN_TAG - Tag of the Amazon DataZone domain
DZ_PROJECT_NAME - Name of the Amazon DataZone project 
DZ_PROJECT_DESCRIPTION - Description of the Amazon DataZone project 
CDK_EXEC_ROLE_ARN - ARN of the cdk execution role
DZ_ADMIN_ROLE_ARN - ARN of the administrator role
```

4.	Install the dependencies by running the following command:
```bash
npm install
```


5. Synthesize the AWS CloudFormation template by running the following command:

```bash
cdk synth
```

6. Deploy the solution by running the following command:

```bash
cdk deploy --all
```
