# Terraform Bootstrap

This stack creates the shared Terraform state storage:

- S3 bucket for remote Terraform state
- DynamoDB table for Terraform state locking

Run this stack with local state first. After it succeeds, use the printed
backend config to initialize environment stacks such as `terraform/environments/dev`.

```sh
cd terraform/bootstrap
terraform init
terraform plan
terraform apply
terraform output backend_config
```

Do not commit generated `terraform.tfstate` files.
