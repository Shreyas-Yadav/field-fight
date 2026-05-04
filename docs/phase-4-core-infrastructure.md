# Phase 4: Terraform Bootstrap and Core Infrastructure

Phase 4 creates the AWS foundation that the ECR images will later run on.

## What This Phase Adds

- Terraform bootstrap stack for remote state storage.
- S3 bucket for Terraform state.
- DynamoDB table for Terraform state locking.
- Dev VPC with public, private, and database subnets.
- RDS Postgres for persistent app data.
- Optional EKS cluster and managed node group.

## Why This Exists

Phase 3 produced container images and pushed them to ECR. Those images still
need an AWS runtime. Phase 4 creates the networking, database, and Kubernetes
foundation that later phases will deploy into.

## Lab Account Constraint

The AWS Builder/Lab account cannot create IAM roles. Because of that, EKS is
disabled by default. The Terraform uses modules where possible. The EKS portion
uses minimal native AWS resources because the standard EKS module reads IAM
session context with `iam:GetRole`, which this lab account explicitly denies.
Enable EKS only after confirming that the existing `LabRole` ARN can be passed
to both the EKS control plane and worker nodes.

## Current Dev Resources

The `dev` environment has been applied in `us-east-1`:

- VPC: `vpc-0e57a02b64121ed05`
- RDS database: `fieldfight`
- RDS endpoint: `field-fight-dev-postgres.cjzrv40mvlrb.us-east-1.rds.amazonaws.com:5432`
- EKS cluster: `field-fight-dev-eks`
- EKS node group: `field-fight-dev-default`
- Kubernetes nodes: 2 Ready nodes on EKS `v1.35.4`

## Command Order

Bootstrap remote state first:

```sh
cd terraform/bootstrap
terraform init
terraform plan
terraform apply
terraform output backend_config
```

Then initialize the dev stack with the bootstrap output:

```sh
cd terraform/environments/dev
cp backend.tf.example backend.tf
terraform init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="region=us-east-1" \
  -backend-config="key=env/dev/terraform.tfstate" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
terraform plan
```

Pass the RDS password through an environment variable or a local `.tfvars` file:

```sh
export TF_VAR_db_password="<strong-password>"
```

Local `.tfvars` files are ignored by git.
