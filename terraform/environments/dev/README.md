# Dev Infrastructure

This stack creates the core AWS infrastructure for the `dev` environment:

- VPC with public, private, and database subnets
- Security group for Postgres access from inside the VPC
- RDS Postgres
- Optional EKS cluster and managed node group

EKS is disabled by default because AWS Builder/Lab accounts usually cannot
create IAM roles. Enable it only after confirming the existing LabRole ARNs can
be used by EKS and the worker nodes. The EKS resources are intentionally minimal
native AWS resources because the standard EKS module calls IAM role inspection
APIs that this lab account blocks.

Terraform state is stored locally — there is no S3 backend.

```sh
cd terraform/environments/dev
terraform init
export TF_VAR_db_password="<strong-password>"
terraform plan
```

Do not commit local `.tfvars` files or generated Terraform state.
