# Magnet Vis AWS/EKS Requirement Roadmap

Use this checklist as the working order for satisfying `output.pdf`. Keep the
baseline app stable first, then add the remaining graded capabilities in small
steps.

## Requirement Summary

- Application must have a frontend, AWS RDS database, and at least 3 backend
  microservices.
- Frontend must be reachable through a custom DNS name with HTTPS.
- AWS resources such as EKS, RDS, and VPC must be managed through Terraform.
- Day 1 setup and Day 2 updates must be automated.
- Promotion flow must be Git-driven: `dev -> nightly QA -> UAT -> prod`.
- Dev/QA to UAT promotion must be triggered by pull request merges or
  conventional commit/RC signals.
- UAT to prod must be triggered by release labels or tags such as `v1.0.1`.
- Manual click-to-deploy in the AWS Console is prohibited.
- Choose and justify either blue/green or canary on EKS.
- Promotions and Day 2 updates must avoid dropped requests.
- Day 2 demos must include worker node OS/security patching and an RDS schema
  change.
- Observability must be self-hosted in EKS: Prometheus, Grafana, OAuth2 access,
  dashboards, alerts, and centralized backend log queries.

## Phase 1: Stable Application Baseline

- [x] Keep the app working locally with Docker Compose and local Postgres.
- [x] Keep the frontend plus backend services stable: `frontend`,
  `game-server`, `leaderboard-api`, `auth-service`, and
  `match-history-service`.
- [x] Replace JSON storage with Postgres for auth, leaderboard, and match
  history.
- [x] Add migration tooling for the initial Postgres schema.
- [x] Expose `/health` and `/metrics` on backend services.
- [x] Verify frontend build and backend tests.
- [x] Keep local development separate from AWS deployment concerns.

## Phase 2: AWS Infrastructure and Runtime

- [x] Create ECR repositories with Terraform.
- [x] Build and push immutable Docker images tagged by commit SHA.
- [x] Create Terraform bootstrap resources: S3 state bucket and lock table.
- [x] Create VPC, public/private/database subnets, NAT, security groups, and RDS
  Postgres through Terraform.
- [x] Create EKS and managed node groups through Terraform using the lab
  `LabRole` ARNs.
- [x] Use `t3.medium` worker nodes for dev to avoid pod-capacity issues.
- [x] Create Route53 hosted zone and ACM certificates through Terraform.
- [x] Deploy AWS Load Balancer Controller through Terraform.
- [x] Verify nodes are Ready and the RDS-backed app starts successfully.

## Phase 3: Dev GitOps and HTTPS

- [x] Create the Helm chart for the app services.
- [x] Add Kubernetes Deployments, Services, ConfigMaps, Secrets, probes, and
  resource requests/limits.
- [x] Deploy migration Job through Kubernetes/Argo CD.
- [x] Install Argo CD through Terraform.
- [x] Add app-of-apps root application.
- [x] Add the `dev` Argo CD application.
- [x] Configure `dev` auto-sync and self-heal.
- [x] Expose the frontend through ALB Ingress.
- [x] Serve the frontend at `https://field-fight-dev.shri.software`.
- [x] Verify `field-fight-dev` is `Synced` and `Healthy`.
- [x] Remove observability from active GitOps until Phase 7 so the app baseline
  remains clean.

## Phase 4: Git-Driven Promotion Environments

- [x] Add GitOps values/apps for `qa`, `uat`, and `prod`.
- [x] Keep environment differences in values files, not hand-edited manifests.
- [x] Add nightly GitHub Actions promotion from `dev` image tag to `qa`.
- [x] Add UAT promotion triggered by pull request merge or RC-style conventional
  commit signal.
- [x] Add prod promotion triggered only by release tag or release label, such as
  `v1.0.1`.
- [x] Ensure GitHub Actions only updates Git-tracked desired state; Argo CD does
  the cluster deployment.
- [ ] Add Terraform format/validate/plan checks for environment changes.
- [ ] Document the promotion chain for the final demo.

## Phase 5: Zero-Downtime Release Strategy

- [ ] Use **blue/green** for the EKS release strategy.
- [ ] Justify blue/green: simple demo, fast rollback, clear before/after
  traffic switch, and less operational complexity than canary.
- [ ] Add blue and green variants for production workloads.
- [ ] Route traffic only to the active color through Git-managed Kubernetes
  desired state.
- [ ] Keep the inactive color running until the new color passes readiness
  checks.
- [ ] Configure graceful shutdown and ALB deregistration delay.
- [ ] Add PodDisruptionBudgets for services that should stay available.
- [ ] Demonstrate rollback by reverting Git desired state.
- [ ] Verify promotion causes zero dropped requests during the demo.

## Phase 6: Mandatory Day 2 Scenarios

- [ ] OS/security patching: update EKS managed node group version or launch
  template through Terraform.
- [ ] Show Kubernetes drains or replaces worker nodes while workloads reschedule.
- [ ] Verify app remains reachable during node replacement.
- [ ] Schema change: add a small backward-compatible RDS migration.
- [ ] Use `duration_seconds` on match history as the recommended schema-change
  field.
- [ ] Deploy schema migration through an Argo CD migration Job.
- [ ] Deploy backend code that can read both old and new rows.
- [ ] Verify old rows still load and new writes include the new field.
- [ ] Document the stability reasoning for both Day 2 demos.

## Phase 7: Self-Hosted Observability and Logging

- [ ] Reintroduce observability as a separate Argo CD application after the app
  and promotion path are stable.
- [ ] Deploy Prometheus and Grafana inside EKS; do not use AWS managed
  observability services.
- [ ] Start minimal: Prometheus, Grafana, kube-state-metrics, node-exporter, and
  ServiceMonitors.
- [ ] Add dashboards for node CPU, node memory, disk space, pods, request rate,
  latency, and 5xx responses.
- [ ] Expose Grafana externally through HTTPS.
- [ ] Protect Grafana with GitHub OAuth2; username/password login is prohibited.
- [ ] Add Alertmanager Slack notifications for critical CPU, memory, disk, pod,
  and app-health thresholds.
- [ ] Add Loki and Promtail for centralized logs across all backend
  microservices.
- [ ] Use ephemeral Loki storage in the AWS lab for reliability; document that
  production should use S3 or EBS-backed durable storage.
- [ ] Verify dashboards, alerts, and centralized log queries before final demo.

## Phase 8: Final Demo Preparation

- [ ] Prepare a demo script mapped directly to `output.pdf`.
- [ ] Show the app architecture: frontend, RDS, and at least 3 backend
  microservices.
- [ ] Show Terraform-managed ECR, VPC, RDS, EKS, Route53, and ACM.
- [ ] Show GitHub Actions building images and updating GitOps desired state.
- [ ] Show Argo CD syncing the app from Git.
- [ ] Show custom HTTPS frontend access.
- [ ] Show blue/green or rollback behavior with zero dropped requests.
- [ ] Show OS/security patching through Terraform.
- [ ] Show RDS schema migration through Argo CD.
- [ ] Show Grafana OAuth login, dashboards, Slack alert path, and centralized log
  queries.

## Defaults and Constraints

- AWS region: `us-east-1`.
- Database: AWS RDS Postgres only.
- Infrastructure source of truth: Terraform.
- Kubernetes source of truth: GitOps through Argo CD.
- Image tags: immutable commit SHAs.
- Dev node size: `t3.medium`.
- Deployment strategy: blue/green.
- Alert channel: Slack.
- Dev Loki storage: ephemeral, because AWS Lab EBS CSI permissions are
  unreliable.
- Production Loki storage recommendation: S3 or EBS once IAM/storage
  prerequisites are available.
