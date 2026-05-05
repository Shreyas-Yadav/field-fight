# Phase 9: Observability and Logging

Phase 9 adds GitOps-managed monitoring and logs for the dev EKS app.

## What Git Deploys

Argo CD creates `field-fight-observability` from the local Helm chart at
`k8s/helm/observability`.

The chart installs:

- Prometheus, Grafana, Alertmanager, kube-state-metrics, and node-exporter through
  `kube-prometheus-stack`.
- Loki for centralized log storage.
- Promtail for collecting pod logs and shipping them to Loki.
- ServiceMonitors for the Field Fight backend `/metrics` endpoints.
- Field Fight dashboards and alert rules.

The chart commits `Chart.yaml` and `Chart.lock`, but does not commit packaged
Helm dependency archives. Add the public Helm repos before local rendering:

```sh
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm dependency build k8s/helm/observability
```

## Required Secrets

Secrets are not committed to Git.

Create the Grafana admin secret:

```sh
kubectl create namespace monitoring

kubectl create secret generic grafana-admin \
  --namespace monitoring \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<choose-a-password>'
```

Create a GitHub OAuth app:

- Homepage URL: `https://grafana-dev.shri.software`
- Authorization callback URL: `https://grafana-dev.shri.software/login/github`

Then create the OAuth secret:

```sh
kubectl create secret generic grafana-oauth \
  --namespace monitoring \
  --from-literal=GF_AUTH_GITHUB_CLIENT_ID='<github-oauth-client-id>' \
  --from-literal=GF_AUTH_GITHUB_CLIENT_SECRET='<github-oauth-client-secret>' \
  --from-literal=GF_AUTH_GITHUB_ALLOWED_USERS='Shreyas-Yadav'
```

Use your exact GitHub username for `GF_AUTH_GITHUB_ALLOWED_USERS`. For this repo,
that is expected to be `Shreyas-Yadav`.

## DNS and HTTPS Flow

Create the Grafana ACM certificate first:

```sh
cd terraform/environments/dev
terraform plan \
  -var='create_route53_zone=true' \
  -var='create_grafana_certificate=true'
terraform apply \
  -var='create_route53_zone=true' \
  -var='create_grafana_certificate=true'
```

After DNS validation records exist, validate the certificate:

```sh
terraform apply \
  -var='create_route53_zone=true' \
  -var='create_grafana_certificate=true' \
  -var='validate_grafana_certificate=true'
```

Copy the `grafana_certificate_arn` output into
`gitops/environments/dev/observability-values.yaml`:

- Set `kube-prometheus-stack.grafana.ingress.enabled` to `true`.
- Set `kube-prometheus-stack.grafana.ingress.annotations.alb.ingress.kubernetes.io/certificate-arn`
  to the certificate ARN.

After Argo CD creates the Grafana Ingress, get the ALB details:

```sh
kubectl get ingress -n monitoring
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(DNSName, `elb.amazonaws.com`)].[DNSName,CanonicalHostedZoneId]' \
  --output table
```

Then create the Route53 alias:

```sh
terraform apply \
  -var='create_route53_zone=true' \
  -var='create_grafana_certificate=true' \
  -var='validate_grafana_certificate=true' \
  -var='grafana_alb_dns_name=<grafana-alb-dns-name>' \
  -var='grafana_alb_zone_id=<grafana-alb-zone-id>'
```

## Verification

Check Argo CD:

```sh
kubectl get applications -n argocd
```

Check monitoring pods:

```sh
kubectl get pods -n monitoring
```

Check the ServiceMonitors:

```sh
kubectl get servicemonitor -n monitoring
```

Open Grafana:

```text
https://grafana-dev.shri.software
```

Verify:

- GitHub OAuth login works.
- Kubernetes dashboards show node and pod data.
- Field Fight dashboard shows app metrics.
- Field Fight logs dashboard shows pod logs from Loki.
- Alert rules appear in Grafana or Alertmanager.
