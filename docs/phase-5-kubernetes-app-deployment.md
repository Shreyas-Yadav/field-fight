# Phase 5: Kubernetes App Deployment

Phase 5 turns the EKS cluster into a running application platform.

## What This Phase Adds

- A Helm chart for the full app stack.
- Deployments for the frontend and four backend services.
- Services for in-cluster service discovery.
- ConfigMaps for shared runtime settings and frontend nginx routing.
- Secrets for database and auth credentials.
- Readiness and liveness probes.
- Resource requests and limits.
- A migrations Job that runs before install and upgrade.

## How It Fits

Phase 3 built images and published them to ECR. Phase 4 built the cluster, network, and database. Phase 5 is the bridge between the two: Kubernetes now knows how to pull the images and run the app against RDS.

## Current Dev Shape

- EKS cluster: `field-fight-dev-eks`
- RDS endpoint: `field-fight-dev-postgres.cjzrv40mvlrb.us-east-1.rds.amazonaws.com:5432`
- Image tag scaffolded in the chart: `ff7a7e8dac9dafb9aaed7677497f38f2b6ee7f08`

## Validation Order

1. Fill `k8s/helm/field-fight/values.dev.yaml` from the example file.
2. Install the chart into the `field-fight-dev` namespace.
3. Check the migrations Job.
4. Check pods and services.
5. Port-forward the frontend service and verify the UI can reach the backend services.

## What Still Waits for Later Phases

- Public DNS.
- HTTPS.
- Argo CD sync.
- Git-driven promotion.
