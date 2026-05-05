# Magnet Vis AWS/EKS Requirement Roadmap

Use this checklist as the working order for satisfying the requirements in `output.pdf`.

## Phase 1: Local App Foundation

- [x] Confirm the current app works locally.
- [x] Keep the 5-service Docker setup stable: `frontend`, `game-server`, `leaderboard-api`, `auth-service`, and `match-history`.
- [x] Add local Postgres to `docker-compose.yml`.
- [x] Update `make docker-up` so the local app and Postgres start together.
- [x] Verify the frontend production build passes.
- [x] Verify backend tests pass.
- [x] Verify all backend services expose `/health`.
- [x] Verify all backend services expose `/metrics`.

## Phase 2: Replace JSON Storage With Postgres

- [x] Add shared database connection handling for backend services.
- [x] Convert `leaderboard-api` from JSON file storage to Postgres.
- [x] Convert `match-history-service` from JSON file storage to Postgres.
- [x] Convert `auth-service` user storage from JSON file storage to Postgres.
- [x] Add migration tooling for initial Postgres schema setup.
- [x] Design migrations so they can later run through Argo CD `PreSync` Kubernetes Jobs in production.
- [x] Use expand-first migrations so old and new app versions can run safely during rollout.
- [x] Create the initial users table migration.
- [x] Create the initial leaderboard scores table migration.
- [x] Create the initial match history table migration.
- [x] Update tests to run against Postgres.
- [x] Verify existing APIs still behave the same from the frontend's perspective.

## Phase 3: Container Registry and Image Build Flow

- [x] Add Terraform definitions for ECR repositories.
- [x] Add GitHub Actions workflow to run tests.
- [x] Add GitHub Actions workflow step to build the frontend.
- [x] Add GitHub Actions workflow steps to build all service Docker images.
- [x] Add ECR publish job for non-PR workflow runs.
- [x] Use immutable image tags, preferably commit SHA tags.
- [x] Keep image build separate from Kubernetes deployment.
- [x] Apply Terraform to create ECR repositories in AWS.
- [x] Configure GitHub repository variables/secrets for LabRole ECR publishing.
- [x] Push images to ECR.

## Phase 4: Terraform Bootstrap and Core Infrastructure

- [x] Create a one-time Terraform bootstrap stack using local state.
- [x] Add Terraform for the S3 backend bucket and DynamoDB lock table.
- [x] Add Terraform backend configuration for environment state.
- [x] Add Terraform for VPC, public/private subnets, and NAT.
- [x] Add Terraform for security groups.
- [x] Add Terraform for RDS Postgres.
- [x] Add optional Terraform for EKS and EKS node groups using existing role ARNs.
- [x] Keep ECR Terraform in the existing Phase 3 stack.
- [x] Apply the bootstrap stack to create the S3 backend bucket and DynamoDB lock table.
- [x] Move dev Terraform to S3 remote state with S3 lockfile locking.
- [x] Confirm `LabRole` can be used by EKS control plane and worker nodes.
- [x] Apply the dev VPC and RDS stack.
- [x] Apply the dev EKS stack using existing `LabRole` ARNs.
- [x] Verify EKS worker nodes are Ready with `kubectl get nodes`.
- [x] Use existing `LabRole` instead of creating IAM roles because the lab account blocks IAM role creation.
- [x] Run Terraform format, validation, plan, and apply for bootstrap and `dev`.
- [x] Defer Route53 and ACM Terraform to Phase 7 with DNS and HTTPS.
- [x] Defer `qa`, `uat`, and `prod` environment expansion until after the `dev` Kubernetes deployment is proven.

## Phase 5: Kubernetes App Deployment

- [x] Create a Helm chart or Kubernetes manifests for the 5 app services.
- [x] Add Deployments for all app services.
- [x] Add Services for all app services.
- [x] Add ConfigMaps and Secret references.
- [x] Add readiness and liveness probes.
- [x] Add resource requests and limits.
- [x] Add environment-specific values for image tags, domains, DB settings, replicas, and resources.
- [x] Deploy once to `dev` as a validation step.
- [x] Verify pods, services, health checks, and frontend routing.

## Phase 6: Argo CD GitOps

- [x] Install Argo CD into EKS through Terraform.
- [x] Add app-of-apps structure.
- [x] Add a root Argo CD application.
- [x] Add a `dev` Argo CD application.
- [ ] Add `uat` and `prod` Argo CD applications.
- [ ] Add a `qa` Argo CD application for nightly builds.
- [ ] Add an observability Argo CD application.
- [x] Store desired Kubernetes state in this repo.
- [x] Configure Argo CD auto-sync for `dev`.
- [ ] Configure Argo CD auto-sync for `qa`.
- [ ] Configure Argo CD auto-sync for `uat`.
- [ ] Configure production sync to be release-tag driven through Git, not Argo CD UI clicks.
- [x] Verify Argo CD detects drift and restores desired state.

## Phase 7: DNS and HTTPS

- [x] Configure AWS Load Balancer Controller.
- [x] Add Terraform for Route53 and ACM.
- [x] Add frontend ingress.
- [x] Use Route53 and ACM for the custom HTTPS frontend domain.
- [x] Redirect HTTP to HTTPS.
- [x] Update auth callback URLs to use the HTTPS domain.
- [x] Verify the frontend is reachable through the custom domain.

## Phase 8: Git-Driven Promotion

- [ ] Create separate environment configs for `qa`, `uat`, and `prod`.
- [ ] Run Terraform format, validation, and plan per environment.
- [ ] Update GitHub Actions so merge to main promotes to `dev`.
- [ ] Add nightly build flow that promotes a scheduled build to `qa`.
- [ ] Add RC promotion flow for `uat`.
- [ ] Add release-tag promotion flow for `prod`, such as `v1.0.1`.
- [ ] Make GitHub Actions update Git-tracked Helm values or manifests.
- [ ] Let Argo CD perform the actual EKS deployment.
- [ ] Ensure production release tags update prod desired state in Git.
- [ ] Confirm no manual AWS Console deployment is needed.

## Phase 9: Observability and Logging

- [ ] Deploy Prometheus inside EKS through Argo CD.
- [ ] Deploy Grafana inside EKS through Argo CD.
- [ ] Protect Grafana with OAuth2.
- [ ] Add dashboards for node CPU, node memory, disk, pods, service latency, request rate, and 5xx responses.
- [ ] Add alerts for critical thresholds.
- [ ] Deploy Loki/Promtail or ELK/OpenSearch inside EKS.
- [ ] Verify centralized log queries across all backend microservices.
- [ ] Verify dashboards and logs are ready before Day 2 demonstrations.

## Phase 10: Blue/Green Deployment

- [ ] Implement blue/green production deployment.
- [ ] Keep the old version alive while the new version becomes healthy.
- [ ] Switch traffic only after readiness checks pass.
- [ ] Configure graceful shutdown for all backend services.
- [ ] Configure ALB deregistration delay and connection draining.
- [ ] Add PodDisruptionBudgets for services that need continuous availability.
- [ ] Verify Socket.IO game sessions drain cleanly during production switchovers.
- [ ] Add rollback procedure by reverting Git desired state.
- [ ] Demonstrate zero dropped requests during promotion.

## Phase 11: Production OS/Security Patching

- [ ] Confirm the initial production app is live on EKS and serving traffic through the custom HTTPS domain.
- [ ] Confirm Prometheus, Grafana, alerts, and centralized logs are working.
- [ ] Plan an EKS managed node group AMI or Kubernetes patch update.
- [ ] Apply the node group update through Terraform.
- [ ] Verify Kubernetes drains old nodes safely.
- [ ] Verify replacement nodes join the cluster and workloads reschedule.
- [ ] Use dashboards and logs to prove service continuity during patching.
- [ ] Demonstrate zero dropped requests during the node patching scenario.
- [ ] Document this as the OS/security patching Day 2 scenario.

## Phase 12: Production Day 2 Schema Change

- [ ] Confirm the initial production app is live on EKS and serving traffic through the custom HTTPS domain.
- [ ] Confirm Prometheus, Grafana, alerts, and centralized logs are working.
- [ ] Confirm production services are using AWS RDS Postgres.
- [ ] Add one realistic schema migration after production is live.
- [ ] Use `duration_seconds` on match history as the recommended Day 2 change.
- [ ] Update backend write logic to support the new field.
- [ ] Update backend read logic to support old rows and new rows.
- [ ] Deploy the migration as an Argo CD `PreSync` Kubernetes Job.
- [ ] Deploy the backend through GitHub Actions image promotion and Argo CD sync.
- [ ] Verify existing production rows still load correctly.
- [ ] Verify new production writes include the new field.
- [ ] Demonstrate that the schema change required no manual AWS Console edits.
- [ ] Demonstrate zero dropped requests during the schema-change rollout.
- [ ] Document this as the Day 2 schema change scenario.

## Phase 13: Final Demo Preparation

- [ ] Prepare a demo script mapped directly to `output.pdf`.
- [ ] Show Terraform-managed infrastructure.
- [ ] Show the app running on EKS.
- [ ] Show RDS-backed persistence.
- [ ] Show the custom HTTPS frontend.
- [ ] Show GitHub Actions build and promotion.
- [ ] Show Argo CD sync and drift correction.
- [ ] Show the Day 2 schema change.
- [ ] Show node patching or node group replacement.
- [ ] Show Grafana dashboards, alerts, OAuth access, and centralized logs.

## Assumptions

- Postgres will be used locally and AWS RDS Postgres will be used in AWS.
- Terraform will manage all AWS infrastructure.
- GitHub Actions will handle build and promotion automation.
- Argo CD will handle Kubernetes deployment sync.
- App code, Terraform, and GitOps desired state will live in this repo.
- Argo CD will use an app-of-apps structure.
- `dev`, `qa`, and `uat` will auto-sync; `prod` will be release-controlled through Git.
- Production deployment will use blue/green.
- Production migrations will run as Argo CD `PreSync` Kubernetes Jobs.
