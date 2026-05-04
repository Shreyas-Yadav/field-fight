# Field Fight Helm Chart

This chart deploys the Phase 5 Kubernetes app stack:

- `frontend`
- `game-server`
- `leaderboard-api`
- `auth-service`
- `match-history-service`
- `migrations` job

## Install

Use a local values file for secrets and dev overrides:

```sh
cp k8s/helm/field-fight/values.dev.example.yaml k8s/helm/field-fight/values.dev.yaml
helm upgrade --install field-fight-dev k8s/helm/field-fight \
  --namespace field-fight-dev \
  --create-namespace \
  -f k8s/helm/field-fight/values.dev.yaml
```

## Validate

```sh
kubectl get pods -n field-fight-dev
kubectl get svc -n field-fight-dev
kubectl logs job/field-fight-dev-migrations -n field-fight-dev
kubectl port-forward svc/field-fight-dev-frontend 8080:80 -n field-fight-dev
```

Then open `http://localhost:8080` and confirm the frontend can reach the in-cluster backend services.

## Notes

- The app stack uses cluster-local service DNS names for nginx proxying.
- The OAuth login flow is not fully public until the DNS and HTTPS phase adds an external domain.
- `values.dev.yaml` needs the RDS password and OAuth client credentials filled in before install.
- Keep `values.dev.yaml` out of git; the root `.gitignore` already ignores it.
