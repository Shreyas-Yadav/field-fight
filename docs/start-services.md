# Start Services

Use this guide to bring the dev environment online — either from scratch (first
time) or after a `stop` (resume work next day).

## Where Terraform state lives

Local file: `terraform/environments/dev/terraform.tfstate`

This file is **gitignored** but persists on your laptop between sessions. It
tracks which AWS resources Terraform owns. Do not delete it unless you have
already destroyed all resources, otherwise Terraform will lose track of what
exists in AWS.

If you ever lose the state file, run `terraform import` for each resource or do
a full destroy from the AWS Console and start over.

## Prerequisites

```bash
aws --version          # >= 2.x
terraform --version    # >= 1.5.7
kubectl version --client
helm version
python3 --version
```

Export AWS Builder Lab credentials:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
export TF_VAR_db_password='rootroot'
```

Verify access:

```bash
aws sts get-caller-identity
```

## Scenario A — First time (fresh AWS account)

Use this when the AWS account is empty and nothing has been deployed yet.

### 1. Create everything

```bash
bash scripts/recreate-dev.sh up
```

Takes ~20 minutes. At the end it prints Route53 nameservers.

### 2. Delegate DNS

In your domain registrar, replace nameservers with the 4 from the output.
Wait 5-15 minutes for propagation:

```bash
dig +short NS shri.software
```

### 3. Commit the auto-updated values

```bash
git add gitops/environments/dev/values.yaml
git commit -m "chore: update dev values for new AWS account"
git push
```

### 4. Validate ACM certificate

```bash
bash scripts/recreate-dev.sh validate
```

### 5. Install ArgoCD and Load Balancer Controller

```bash
bash scripts/recreate-dev.sh gitops
```

### 6. Configure kubectl and create Kubernetes secrets

```bash
aws eks update-kubeconfig --region us-east-1 --name field-fight-dev-eks

kubectl create namespace field-fight-dev --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic field-fight-dev-secrets \
  --namespace=field-fight-dev \
  --from-literal=DB_PASSWORD='rootroot' \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_ID='your-google-client-id' \
  --from-literal=GOOGLE_CLIENT_SECRET='your-google-client-secret' \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 7. Apply the ArgoCD root application

```bash
kubectl apply -f gitops/root.yaml
```

### 8. Wire Route53 to the ALB

```bash
bash scripts/recreate-dev.sh finish
```

### 9. Verify

```bash
bash scripts/dev-status.sh
curl -I https://field-fight-dev.shri.software
```

---

## Scenario B — Resume after `stop` (RECOMMENDED daily flow)

Use this when you previously ran `stop-services.md` to tear down EKS and NAT
but kept Route53, ACM, RDS, VPC, and ECR.

### 1. Re-export credentials

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
export TF_VAR_db_password='rootroot'
```

### 2. Re-create EKS and NAT

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

terraform -chdir=terraform/environments/dev apply \
  -var="aws_region=us-east-1" \
  -var="create_eks=true" \
  -var="install_argocd=true" \
  -var="install_aws_load_balancer_controller=true" \
  -var="enable_nat_gateway=true" \
  -var="single_nat_gateway=true" \
  -var="create_route53_zone=true" \
  -var="create_frontend_certificate=true" \
  -var="validate_frontend_certificate=true" \
  -var="eks_cluster_role_arn=arn:aws:iam::${ACCOUNT}:role/LabRole" \
  -var="eks_node_role_arn=arn:aws:iam::${ACCOUNT}:role/LabRole" \
  -auto-approve
```

Takes ~15 minutes. EKS comes back, ArgoCD reinstalls, LBC reinstalls.

### 3. Refresh kubeconfig

```bash
aws eks update-kubeconfig --region us-east-1 --name field-fight-dev-eks
```

### 4. Re-create Kubernetes secrets

Secrets do not survive cluster destroy — recreate them:

```bash
kubectl create namespace field-fight-dev --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic field-fight-dev-secrets \
  --namespace=field-fight-dev \
  --from-literal=DB_PASSWORD='rootroot' \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_ID='your-google-client-id' \
  --from-literal=GOOGLE_CLIENT_SECRET='your-google-client-secret' \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 5. Re-apply the ArgoCD root app

```bash
kubectl apply -f gitops/root.yaml
```

ArgoCD will sync the dev app and pull images from ECR.

### 6. Wait for ALB and re-wire Route53

```bash
bash scripts/recreate-dev.sh finish
```

### 7. Verify

```bash
bash scripts/dev-status.sh
curl -I https://field-fight-dev.shri.software
```
