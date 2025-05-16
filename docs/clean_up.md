# Clean up


Implement the following steps in your local development environment (linux or macOS).

1. Go to the root directory of your repository.

2. Export the AWS credentials for the same AWS IAM role, that created the AWS CDK stack.

3. Change to ```datazone``` directory for data solution built on Amazon DataZone domain, or ```unified-studio``` directory for data solution built on Amazon SageMaker Unified Studio domain. 

4. Destroy the cloud resources.

```bash
cdk destroy --all
```

5. From AWS Management Console, empty and delete the S3 buckets that were created as part of this deployment.