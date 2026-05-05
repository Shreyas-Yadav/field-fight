# GitOps Layout

This directory contains the desired Kubernetes state that Argo CD watches.

- `apps/` contains Argo CD `Application` resources managed by the root app.
- `environments/dev/` contains committed, non-secret Helm values for dev.
- `environments/qa`, `environments/uat`, and `environments/prod` are placeholders
  for later promotion phases.

Secrets are intentionally not stored here. The dev app expects a Kubernetes
Secret named `field-fight-dev-secrets` in the `field-fight-dev` namespace.
The observability app expects `grafana-admin` and `grafana-oauth` Secrets in the
`monitoring` namespace.
