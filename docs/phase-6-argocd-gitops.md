# Phase 6: Argo CD GitOps

Phase 6 installs Argo CD into the dev EKS cluster and moves the app deployment
source of truth into Git.

## What This Phase Adds

- Argo CD installed through Terraform.
- A root Argo CD application.
- A dev application managed by the root app.
- Git-safe dev Helm values under `gitops/environments/dev`.
- Placeholder environment directories for `qa`, `uat`, and `prod`.

## Dev Deployment Shape

- Repo URL: `https://github.com/Shreyas-Yadav/field-fight.git`
- Target revision: `main`
- Root app path: `gitops/apps`
- Dev app chart path: `k8s/helm/field-fight`
- Dev app values path: `gitops/environments/dev/values.yaml`
- Dev namespace: `field-fight-dev`
- Argo CD namespace: `argocd`

## Secret Handling

The GitOps values do not contain secret data. The dev app expects this Secret to
already exist:

```text
field-fight-dev/field-fight-dev-secrets
```

It must provide:

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

The Phase 5 manual Helm deployment already created this Secret in dev. If the
namespace is recreated later, create the Secret again before allowing Argo CD to
sync the app.

## Apply Order

1. Push the GitOps files to the watched branch.
2. Apply Terraform with Argo CD enabled:

```sh
terraform apply \
  -var='create_eks=true' \
  -var='install_argocd=true' \
  -var='eks_cluster_role_arn=arn:aws:iam::272772901676:role/LabRole' \
  -var='eks_node_role_arn=arn:aws:iam::272772901676:role/LabRole'
```

3. Verify Argo CD:

```sh
kubectl get pods -n argocd
kubectl get applications -n argocd
```

4. Access the UI locally:

```sh
kubectl port-forward svc/argocd-server -n argocd 8081:443
```

Then open:

```text
https://localhost:8081
```

## Validation

- The root app should be `Synced` and `Healthy`.
- The dev app should be `Synced` and `Healthy`.
- App pods should remain `1/1 Running`.
- The migration job should complete.
- Backend `/health` endpoints and frontend HTTP 200 checks should pass.
- A temporary manual deployment change should be restored by Argo CD self-heal.
