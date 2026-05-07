# Stop Services

Use this guide to tear down the **expensive** resources at end of day while
keeping the **cheap** resources alive. This avoids redoing DNS delegation and
re-pushing images on every resume.

## What gets destroyed

| Resource | Cost/day | Action |
|---|---|---|
| EKS control plane | ~$2.40 | Destroyed |
| EKS worker nodes | ~$2.00 | Destroyed |
| NAT Gateway | ~$1.10 | Destroyed |
| ALB (via ingress) | ~$0.55 | Destroyed (auto with EKS) |

## What stays alive

| Resource | Cost/day | Why keep |
|---|---|---|
| RDS db.t4g.micro | ~$0.40 | Preserve game data |
| Route53 hosted zone | ~$0.02 | Avoid redoing DNS delegation |
| ACM certificate | $0 | Avoid revalidation wait |
| ECR repositories | <$0.05 | Avoid re-pushing images |
| VPC, subnets, SGs | $0 | Free, needed for resume |

**Daily cost while stopped: ~$0.45** (vs. ~$6.50 if all up)
**Savings: ~93%**

## Where Terraform state lives

Local file: `terraform/environments/dev/terraform.tfstate`

The stop process is a `terraform apply` with EKS and NAT flags flipped to
`false`. State stays consistent — Terraform tracks that EKS and NAT no longer
exist while still owning the kept resources.

**Do not delete the state file.** If you lose it, Terraform forgets it owns
the kept resources, and `start-services.md` will fail with "resource already
exists" errors.

## Stop procedure

### 1. Save any in-progress work

```bash
git add -A && git commit -m "wip: pause work" && git push
```

### 2. Export Builder Lab credentials

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
export TF_VAR_db_password='rootroot'
```

### 3. Apply with EKS and NAT disabled

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

terraform -chdir=terraform/environments/dev apply \
  -var="aws_region=us-east-1" \
  -var="create_eks=false" \
  -var="install_argocd=false" \
  -var="install_aws_load_balancer_controller=false" \
  -var="enable_nat_gateway=false" \
  -var="single_nat_gateway=false" \
  -var="create_route53_zone=true" \
  -var="create_frontend_certificate=true" \
  -var="validate_frontend_certificate=true" \
  -var="eks_cluster_role_arn=arn:aws:iam::${ACCOUNT}:role/LabRole" \
  -var="eks_node_role_arn=arn:aws:iam::${ACCOUNT}:role/LabRole" \
  -auto-approve
```

Takes ~10 minutes. Terraform destroys:
- EKS node group
- EKS cluster
- NAT Gateway
- Helm releases (ArgoCD, AWS Load Balancer Controller)
- ALB (cleaned up automatically when ingress controller goes away)

### 4. Verify what remains

```bash
aws ec2 describe-vpcs --query 'Vpcs[?Tags[?Value==`field-fight-dev`]].VpcId' --output text
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`field-fight-dev-postgres`].DBInstanceStatus' --output text
aws route53 list-hosted-zones --query 'HostedZones[?Name==`shri.software.`].Id' --output text
aws ecr describe-repositories --query 'repositories[].repositoryName' --output text
```

VPC, RDS, Route53, ECR should all still be present.

### 5. (Optional) Stop the AWS Builder Lab session

In the lab UI, click **Stop Lab** (not End Lab). This keeps your account state
intact for the next session. **End Lab** wipes everything including the kept
resources, forcing you to start from Scenario A in `start-services.md`.

---

## When to use full destroy instead

Use the full destroy from `start-services.md` (Scenario A flow) only when:

- You are switching to a different AWS account.
- The lab session expires fully and you cannot avoid restarting.
- You want a completely clean slate.

Otherwise, this selective stop is the right move.

## Resuming

See `docs/start-services.md` Scenario B.
