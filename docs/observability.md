# Observability Stack

Self-hosted Prometheus + Grafana + Loki + Alertmanager running entirely
inside EKS. No AWS managed observability services.

## What runs in the cluster

```
┌──────────────────────────────────────────────────────────────────────┐
│                       observability namespace                         │
│                                                                      │
│  ┌────────────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │   Prometheus   │◄───┤ ServiceMons  │    │ node-exporter│        │
│  │ (1 StatefulSet)│    │ (4 envs ×    │    │ (DaemonSet,  │        │
│  └───────┬────────┘    │  4 services) │    │  per node)   │        │
│          │             └──────────────┘    └──────────────┘        │
│          │                                                          │
│          ▼                                  ┌──────────────┐        │
│  ┌────────────────┐                         │   Promtail   │        │
│  │  Alertmanager  │                         │ (DaemonSet,  │        │
│  │   (slack +     │                         │  per node)   │        │
│  │   null recvrs) │                         └───────┬──────┘        │
│  └───────┬────────┘                                 │               │
│          │                                          ▼               │
│          ▼                                  ┌──────────────┐        │
│       Slack #alerts                         │     Loki     │        │
│                                              │ (single binary│        │
│                                              │  + emptyDir)  │        │
│  ┌────────────────┐                         └───────┬──────┘        │
│  │    Grafana     │◄────────────────────────────────┘               │
│  │  HTTPS + OAuth │                                                 │
│  │  ALB ingress   │                                                 │
│  └────────────────┘                                                 │
│          │                                                          │
└──────────┼──────────────────────────────────────────────────────────┘
           │
           ▼
   https://grafana-dev.shri.software
           │
           ▼
       GitHub OAuth
```

## How it's deployed

Three Argo CD `Application`s, all in `gitops/apps/`:

| App | Source | Purpose |
|---|---|---|
| `field-fight-observability-dev` | Multi-source — `kube-prometheus-stack 65.5.0` from upstream + values from this repo | Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics |
| `field-fight-observability-loki-dev` | Multi-source — `loki 6.16.0` from Grafana Helm repo + values | Single-binary Loki with ephemeral storage |
| `field-fight-observability-promtail-dev` | Multi-source — `promtail 6.16.6` + values | Log shipper DaemonSet |

Plus one directory app for plain manifests:

| App | Source | Contents |
|---|---|---|
| `field-fight-observability-monitors-dev` | `gitops/observability/dev/` directory | 4 ServiceMonitors + alerting rules |

## Values files

Per environment, in `gitops/environments/dev/`:

- `observability-values.yaml` — kube-prometheus-stack config
- `loki-values.yaml` — Loki config
- `promtail-values.yaml` — Promtail config

## Secrets

Created by `bash scripts/recreate-dev.sh secrets` from the local
`secrets.env` file (gitignored). Two Secrets in the `observability`
namespace:

- `grafana-oauth` — `GF_AUTH_GITHUB_CLIENT_ID`, `GF_AUTH_GITHUB_CLIENT_SECRET`
- `alertmanager-slack` — `slack_webhook_url`

## Accessing Grafana

Production access (from anywhere):

```
https://grafana-dev.shri.software
```

Sign in with GitHub. First-time users are auto-assigned **Admin** role
(`auto_assign_org_role: Admin` in the values file).

Local-only access for emergency admin password use:

```bash
kubectl -n observability port-forward svc/field-fight-monitoring-grafana 3000:80
# admin / <secret password>
```

## Useful Loki queries

In Grafana Explore (data source: Loki):

```
{namespace="field-fight-dev"}                          # All dev logs
{environment="prod"}                                   # All prod logs
{environment="dev", component="auth-service"}          # Just dev auth
{environment="dev"} |= "error"                         # Dev errors
{environment="dev", component="auth-service"} != "/health"  # Exclude health probes
```

## Useful Prometheus queries

In Grafana Explore (data source: Prometheus):

```
up{namespace=~"field-fight-.*"}                                      # All app targets
sum by (namespace) (rate(http_requests_total[5m]))                   # Request rate per env
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) # p95 latency
sum by (namespace) (rate(http_requests_total{status=~"5.."}[5m]))    # 5xx rate per env
```

## Alert rules

Defined in `gitops/observability/dev/alerting-rules.yaml` as a
`PrometheusRule` resource. Six rules:

| Alert | Severity | Trigger |
|---|---|---|
| `NodeHighCPU` | warning | CPU > 80% for 5m |
| `NodeHighMemory` | warning | Memory > 85% for 5m |
| `NodeDiskNearFull` | warning | Disk > 85% for 10m |
| `PodCrashLooping` | critical | Container restart rate > 0 for 5m |
| `PodNotReady` | warning | Pod not-ready for 10m |
| `AppHigh5xx` | critical | > 1 5xx/sec for 5m |

All route to the `slack` receiver → posts to `#alerts`. The chart's default
`Watchdog` heartbeat alert routes to a `null` receiver (silenced).

## Storage

- **Loki**: ephemeral `emptyDir` mounted at `/var/loki` (lab-only). Logs
  vanish if Loki is rescheduled or evicted. Production should use S3 or
  EBS-backed durable storage.
- **Prometheus**: ephemeral with 24h retention. Metrics vanish on pod
  restart.
- **Grafana**: ephemeral. Dashboards from `kube-prometheus-stack` are
  re-provisioned on every restart, so no data is actually lost.

## Resource footprint

| Component | Pods | CPU req | RAM req |
|---|---|---|---|
| Prometheus | 1 | 100m | 400 MiB |
| Grafana | 1 | 50m | 150 MiB |
| Alertmanager | 1 | 20m | 50 MiB |
| Operator | 1 | — | — |
| kube-state-metrics | 1 | 20m | 50 MiB |
| node-exporter | 4 (DaemonSet) | 80m | 120 MiB |
| Loki | 1 | 100m | 250 MiB |
| Promtail | 4 (DaemonSet) | 80m | 200 MiB |
| **Total** | **14** | **~450m** | **~1.3 GiB** |

Fits comfortably on the 4-node t3.medium cluster.

## Stop / Start

When you run `scripts/recreate-dev.sh stop`, the entire observability
stack goes away with EKS. The Grafana ACM cert and Route53 zone survive,
so resume restores HTTPS access without revalidation.

`scripts/recreate-dev.sh start` rebuilds EKS, ArgoCD re-syncs all four
observability apps, and the multi-source pattern means the Helm charts
are re-pulled from upstream rather than from anything stale in our repo.
