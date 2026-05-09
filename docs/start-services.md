# Start Services

Two scenarios:

- **Scenario A** — first time on a fresh AWS account (full bootstrap)
- **Scenario B** — resume after `stop` (recommended daily flow)

## Where Terraform state lives

Local file: `terraform/environments/dev/terraform.tfstate`

Gitignored, persists on your laptop. Tracks which AWS resources Terraform
owns. **Do not delete it** — Terraform will lose track of resources and
report "already exists" errors.

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

(One-time) copy the secrets template and fill in real values:

```bash
cp secrets.env.example secrets.env
$EDITOR secrets.env
```

---

## Scenario A — First time (fresh AWS account)

### 1. Bootstrap infrastructure

```bash
bash scripts/recreate-dev.sh up
```

Takes ~20 minutes. Outputs Route53 nameservers and the dev cert ARN.

### 2. Delegate DNS

In your domain registrar, replace nameservers with the 4 from the output. Wait
5-15 minutes for propagation:

```bash
dig +short NS shri.software
```

### 3. Commit the auto-updated dev values.yaml

```bash
git add gitops/environments/dev/values.yaml
git commit -m "chore: update dev values for new AWS account"
git push
```

### 4. Validate ACM certificates (also creates qa/uat/prod certs)

```bash
bash scripts/recreate-dev.sh validate
```

Auto-patches `gitops/environments/{qa,uat,prod}/values.yaml` with their cert
ARNs and `ingress.enabled: true`.

### 5. Commit the multi-env updates

```bash
git diff gitops/environments
git add gitops/environments
git commit -m "feat: enable HTTPS for qa/uat/prod"
git push
```

### 6. Install Argo CD + AWS Load Balancer Controller

```bash
bash scripts/recreate-dev.sh gitops
```

### 7. Apply the Argo CD root app (first time only)

```bash
aws eks update-kubeconfig --region us-east-1 --name field-fight-dev-eks
kubectl apply -f gitops/root.yaml
```

### 8. Apply secrets to all 4 namespaces and run migrations

```bash
bash scripts/recreate-dev.sh secrets
```

### 9. Wire Route53 aliases to the ALB

```bash
bash scripts/recreate-dev.sh finish
```

### 10. Verify

```bash
bash scripts/dev-status.sh

# All 4 envs should return 200/301
for h in field-fight-dev field-fight-qa field-fight-uat field-fight; do
  curl -I -s "https://$h.shri.software" | head -1
done

# Grafana login page should redirect to GitHub OAuth (302)
curl -I -s https://grafana-dev.shri.software | head -3
```

### 11. Sign in to Grafana and verify the observability stack

Open `https://grafana-dev.shri.software` in a browser. You'll be redirected
to GitHub for OAuth — first-time users come back as Admin (configured via
`auto_assign_org_role: Admin`).

Once logged in:

- **Dashboards** → built-in `Kubernetes / Compute Resources / *` panels
  show CPU/memory/pods for all 4 environments
- **Explore** → switch data source to **Loki** and run
  `{environment="dev"}` to see live logs
- **Alerting → Alert rules** → 200+ rules including our `field-fight.rules`
  group (CPU/memory/disk/pod/5xx alerts)
- Slack `#alerts` channel receives Alertmanager notifications

---

## Scenario B — Resume after `stop` (RECOMMENDED daily flow)

You previously ran `scripts/recreate-dev.sh stop`. RDS, Route53, ACM, ECR, and
the VPC are all still alive. Only EKS and NAT need rebuilding.

### One command

```bash
bash scripts/recreate-dev.sh start
```

This runs `gitops` → `kubectl apply -f gitops/root.yaml` → `secrets` → `finish`
in sequence. Takes ~15 minutes.

### Verify

```bash
bash scripts/dev-status.sh

# App envs
for h in field-fight-dev field-fight-qa field-fight-uat field-fight; do
  curl -I -s "https://$h.shri.software" | head -1
done

# Grafana
curl -I -s https://grafana-dev.shri.software | head -1
```

That's it — DNS, ACM, ECR images, RDS data, and ACM certs (including
Grafana's) all survived. The observability stack reinstalls automatically
because ArgoCD redeploys the multi-source apps from the upstream Helm repo.

---

## Troubleshooting

### "no configuration has been provided" / K8s connection error

You ran a phase before `aws eks update-kubeconfig` resolved. Run:

```bash
aws eks update-kubeconfig --region us-east-1 --name field-fight-dev-eks
```

Then re-run the phase.

### Pods stuck in `CreateContainerConfigError`

The Kubernetes Secret is missing or has stale keys. Re-run:

```bash
bash scripts/recreate-dev.sh secrets
```

This recreates the secret AND restarts deployments so pods re-read it.

### Pods stuck in `ImagePullBackOff`

The `imageTag` in `values.yaml` references an image that's not in ECR. Either:
- Push code to main (CI builds + updates dev values.yaml)
- Manually trigger the relevant promote workflow on GitHub
