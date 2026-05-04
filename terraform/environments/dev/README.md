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

Before the bootstrap stack exists, initialize locally:

```sh
cd terraform/environments/dev
terraform init
```

After running `terraform/bootstrap`, enable the S3 backend using
`backend.tf.example` and initialize the real remote backend with:

```sh
cp backend.tf.example backend.tf
terraform init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="region=us-east-1" \
  -backend-config="key=env/dev/terraform.tfstate" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
```

Do not commit local `.tfvars` files or generated Terraform state.
