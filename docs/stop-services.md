# Stop Services

Tear down the **expensive** resources at end of day while keeping the **cheap**
resources alive. This avoids redoing DNS delegation, ACM validation, and image
re-pushes when you resume.

## What gets destroyed

| Resource | Cost/day |
|---|---|
| EKS control plane | ~$2.40 |
| EKS worker nodes | ~$2.00 |
| NAT Gateway | ~$1.10 |
| ALB (via ingress) | ~$0.55 |

## What stays alive

| Resource | Cost/day | Why keep |
|---|---|---|
| RDS db.t4g.micro | ~$0.40 | Preserve game data |
| Route53 hosted zone | ~$0.02 | Avoid redoing DNS delegation |
| ACM certificates (5 — dev/qa/uat/prod + grafana) | $0 | Avoid revalidation wait |
| ECR repositories | <$0.05 | Avoid re-pushing images |
| VPC, subnets, SGs | $0 | Free, needed for resume |

**Daily cost while stopped: ~$0.45** (vs ~$6.50 if all up). **93% savings.**

## Stop procedure

### 1. Save in-progress work

```bash
git add -A && git commit -m "wip: pause work" && git push
```

### 2. Export AWS Builder Lab credentials

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
export TF_VAR_db_password='rootroot'
```

### 3. Run the stop phase

```bash
bash scripts/recreate-dev.sh stop
```

This:
- Removes K8s/Helm-managed resources from Terraform state (so they don't try
  to talk to a cluster that's about to be destroyed)
- Runs `terraform apply` with `create_eks=false`, `enable_nat_gateway=false`,
  `install_argocd=false`, `install_aws_load_balancer_controller=false`
- Keeps RDS, Route53, ACM, ECR, VPC

Takes ~10 minutes.

### 4. Verify what remains

```bash
aws ec2 describe-vpcs --query 'Vpcs[?Tags[?Value==`field-fight-dev`]].VpcId' --output text
aws rds describe-db-instances --query 'DBInstances[].DBInstanceStatus' --output text
aws route53 list-hosted-zones --query 'HostedZones[].Name' --output text
aws ecr describe-repositories --query 'repositories[].repositoryName' --output text
```

VPC, RDS, Route53, ECR should all still be present.

### 5. (Optional) "Stop Lab" in AWS Builder Lab UI

Click **Stop Lab** (NOT End Lab). End Lab wipes the account.

## Resuming

See `docs/start-services.md`. Quick version:

```bash
export TF_VAR_db_password='rootroot'
bash scripts/recreate-dev.sh start
```
