# Field Fight AWS/EKS Requirement Roadmap

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

## Phase 4: Git-Driven Promotion Environments

- [x] Add GitOps values for `qa`, `uat`, and `prod` under
  `gitops/environments/`.
- [x] Add Argo CD `Application` manifests for `qa`, `uat`, and `prod` under
  `gitops/apps/`.
- [x] Keep environment differences in values files, not hand-edited manifests.
- [x] Add nightly GitHub Actions promotion from the `dev` image tag to `qa`.
- [x] Add UAT promotion triggered by pull request merge or RC-style
  conventional commit signal.
- [x] Add prod promotion triggered only by release tag or release label, such
  as `v1.0.1`.
- [x] Ensure GitHub Actions only updates Git-tracked desired state; Argo CD
  does the cluster deployment.
- [x] HTTPS for all 4 environments via shared ALB ingress group (one ALB
  serves dev/qa/uat/prod with separate ACM certs).
- [x] Document a rollback path: revert the values commit on the target
  environment branch (see `docs/promotion-flow.md`).
- [x] Add Terraform format/validate checks for environment changes (PR check
  added to `.github/workflows/pr-checks.yml`).
- [x] Document the promotion chain for the final demo (see
  `docs/promotion-flow.md`).

## Phase 5: Self-Hosted Observability and Logging

Built before Day 2 because Day 2 demos require Grafana dashboards and Loki
queries to *prove* zero dropped requests and successful schema migration.

### Phase 5a: Metrics

- [x] Add observability as a separate Argo CD application
  (`field-fight-observability-dev` — multi-source app pulling
  `kube-prometheus-stack 65.5.0` directly from the upstream Helm repo).
- [x] Deploy Prometheus and Grafana inside EKS via `kube-prometheus-stack`.
- [x] Add `kube-state-metrics`, `node-exporter`, and ServiceMonitors for
  every backend service across all 4 environments
  (`gitops/observability/dev/servicemonitors.yaml`).
- [x] Add dashboards for node CPU, node memory, disk space, pod restarts,
  request rate, latency, and 5xx responses (default dashboards from
  `kube-prometheus-stack`).

### Phase 5b: Logs

- [x] Add Loki (single-binary) and Promtail (DaemonSet) for centralized
  logs across all backend microservices via two more multi-source Argo CD
  apps.
- [x] Use ephemeral Loki storage (`emptyDir` mounted at `/var/loki`) in the
  AWS lab; documented that production should use S3 or EBS-backed durable
  storage.
- [x] Verify centralized log queries from Grafana Explore using Loki
  data source. Promtail tags every log with an `environment` label
  (`dev`/`qa`/`uat`/`prod`) and a `component` label for fast filtering.

### Phase 5c: External Access and Alerts

- [x] Create ACM cert for `grafana-dev.shri.software` through Terraform.
- [x] Expose Grafana through ALB Ingress (joined to the shared
  `field-fight` ingress group — no extra ALB cost).
- [x] Protect Grafana with GitHub OAuth2; password login disabled
  (`auth.basic.enabled: true` for API only, UI form hidden).
- [x] Add Alertmanager Slack receiver wired to a Slack incoming webhook
  via the `alertmanager-slack` Kubernetes Secret. Sample
  `PrometheusRule`s for high CPU / memory / disk / pod-crash /
  pod-not-ready / app-5xx are deployed via
  `gitops/observability/dev/alerting-rules.yaml`.

## Phase 6: Blue/Green Zero-Downtime Releases (Prod-only)

Scope this to the `prod` environment only. Dev/QA/UAT use rolling updates to
keep iteration fast and avoid duplicating workloads in cheaper environments.

- [ ] Pick **blue/green** as the EKS release strategy for prod.
- [ ] Justify blue/green: simple demo, fast rollback, clear before/after
  traffic switch, less operational complexity than canary.
- [ ] Add blue and green Deployment variants in the helm chart, gated by a
  values toggle so only prod uses them.
- [ ] Route traffic only to the active color through a Service `selector`
  managed in Git.
- [ ] Keep the inactive color running until the new color passes readiness
  checks.
- [ ] Configure graceful shutdown (`preStop` + `terminationGracePeriodSeconds`)
  and ALB deregistration delay.
- [ ] Add PodDisruptionBudgets for services that should stay available.
- [ ] Demonstrate rollback by reverting the Git commit that flipped colors.
- [ ] Verify promotion causes zero dropped requests using Phase 5 dashboards.

## Phase 7: Mandatory Day 2 Scenarios

### Day 2a: OS/Security Patching

- [ ] Bump EKS managed node group AMI version through Terraform.
- [ ] Run `terraform apply`; show Kubernetes drains and replaces worker nodes
  while workloads reschedule.
- [ ] Verify app remains reachable using the frontend dashboard and the 5xx
  panel from Phase 5.
- [ ] Verify in Loki that no error logs appeared during node replacement.

### Day 2b: RDS Schema Change (zero-downtime sequence)

The order matters. A backwards-compatible schema change requires the read path
to handle the new column being null *before* writes start using it.

- [ ] **Step 1.** Deploy backend code that can *read* both old and new rows
  (treats the new field as optional with a default).
- [ ] **Step 2.** Deploy schema migration through an Argo CD migration `Job`
  that adds `duration_seconds` to `match_history` with a default value.
- [ ] **Step 3.** Deploy backend code that *writes* the new field on inserts.
- [ ] Verify old rows still load and new writes include the new field.
- [ ] Document the stability reasoning for both Day 2 demos.

## Phase 8: Final Demo Preparation

- [ ] Prepare a demo script mapped directly to `output.pdf`.
- [ ] Show the app architecture: frontend, RDS, and at least 3 backend
  microservices.
- [ ] Show Terraform-managed ECR, VPC, RDS, EKS, Route53, and ACM.
- [ ] Show GitHub Actions building images and updating GitOps desired state.
- [ ] Show Argo CD syncing the app from Git.
- [ ] Show custom HTTPS frontend access.
- [ ] Show blue/green cutover and rollback in prod with zero dropped requests.
- [ ] Show OS/security patching through Terraform with live dashboard proof.
- [ ] Show RDS schema migration sequence (read-compatible code → migration →
  writer code) through Argo CD.
- [ ] Show Grafana OAuth login, dashboards, Slack alert path, and centralized
  log queries.

## Defaults and Constraints

- AWS region: `us-east-1`.
- Database: AWS RDS Postgres only.
- Infrastructure source of truth: Terraform.
- Kubernetes source of truth: GitOps through Argo CD.
- Image tags: immutable commit SHAs.
- Dev node size: `t3.medium`.
- Deployment strategy: blue/green in prod, rolling in lower environments.
- Alert channel: Slack.
- Dev Loki storage: ephemeral, because AWS Lab EBS CSI permissions are
  unreliable.
- Production Loki storage recommendation: S3 or EBS once IAM/storage
  prerequisites are available.
