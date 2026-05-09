# Blue/Green Deployment (prod-only)

How prod ships new versions with zero dropped requests.

## Why blue/green and not canary

Both prevent dropped requests. We chose blue/green because:

| Reason | Detail |
|---|---|
| Demo simplicity | One label change flips traffic 100% — clear before/after |
| Fast rollback | `git revert` of the activeColor commit, ~30 sec to restore |
| Test in isolation | Standby color can be exercised internally before traffic flips |
| Less infrastructure | No traffic-splitting controller (no Istio/Linkerd needed) |

Canary would add complexity (gradual percentages, automated rollback rules) that's overkill for a small game app.

## Where it's enabled

**Only `prod`.** Dev/QA/UAT use rolling updates because:

- Lower envs iterate fast — no need for double capacity
- Saves ~$0.10/day per env on the lab
- Standard rolling updates already cover non-customer-facing risk

The toggle lives in `gitops/environments/prod/values.yaml`:

```yaml
blueGreen:
  enabled: true
  activeColor: blue            # which color receives all traffic
  standbyReplicas: 1           # 1 idle pod per service on the inactive color
  tags:
    blue: <commit-sha>
    green: <commit-sha>
```

## What gets rendered (prod only)

For each of the 5 services (frontend, auth, game-server, leaderboard, match-history):

```
Deployment ff-prod-<svc>-blue    (replicas = active ? 2 : 1)
Deployment ff-prod-<svc>-green   (replicas = active ? 2 : 1)
Service    ff-prod-<svc>         (selector: color = activeColor)
PDB        ff-prod-<svc>-blue    (minAvailable: 1)
PDB        ff-prod-<svc>-green   (minAvailable: 1)
```

## How a release flows

```
T+0:00  CI builds image abc123, pushes to ECR.
        promote-prod workflow updates prod/values.yaml:
            blueGreen.tags.green: abc123        ← new version on green
            (blueGreen.tags.blue stays on old version)
        Commits to main.

T+0:30  ArgoCD picks up the change.
        Green Deployments roll to abc123.
        Blue keeps serving traffic on the old version.

T+1:30  Green pods are Ready.
        Standby green is at 1 replica running new version.
        Demo: optional smoke test via port-forward to a green pod.

T+2:00  Operator (or pipeline) flips activeColor in values.yaml:
            blueGreen.activeColor: green
        Commits + pushes.

T+2:30  ArgoCD applies. Service selector changes from blue → green.
        Kubernetes scales:
            green: 1 → 2 replicas (active count)
            blue:  2 → 1 replicas (standby count)

T+2:31  ALB sees Service endpoints changed.
        Stops sending NEW connections to blue pods.
        New connections go to green pods.
        Existing connections on blue finish naturally
        (terminationGracePeriodSeconds: 30, plus 30s ALB deregistration delay).

T+3:00  Cutover complete. All traffic on green (new version).
        Blue still running 1 pod (old version) for instant rollback.
```

## How rollback works

If a problem is detected:

```bash
git log --oneline gitops/environments/prod/values.yaml | head -3
# Find the commit that flipped activeColor

git revert <that-commit>
git push
```

ArgoCD reverts the Service selector → traffic returns to blue. Blue is still running the old version, so the user-facing site is back to the known-good state in seconds.

## Graceful shutdown

To prevent dropped in-flight requests during cutover, every deployment has:

- `lifecycle.preStop` — sleeps 10 seconds before SIGTERM, giving the ALB time to remove the pod from the target group.
- `terminationGracePeriodSeconds: 30` — kubelet waits up to 30s before SIGKILL.
- ALB `deregistration_delay.timeout_seconds=30` — target group keeps draining requests for 30s after a pod is removed.

Combined, in-flight HTTP requests have ~30 seconds to complete on the old pod before Kubernetes kills it.

## Pod Disruption Budgets

`minAvailable: 1` per `<service>-<color>` pair. Effects:

- Node drain (Day 2 patching) cannot evict the last replica of the active color.
- During green rollout, blue keeps at least 1 running.
- During node patching of green's host, the node patcher waits for green to scale up elsewhere first.

## Demo script for the final defense

```bash
# 1. Show prod has both colors running
kubectl -n field-fight-prod get deploy
# Expect: ff-prod-<svc>-blue (2/2) and ff-prod-<svc>-green (1/1)

# 2. Show Service selector points at blue
kubectl -n field-fight-prod get svc ff-prod-frontend \
  -o jsonpath='{.spec.selector}'
# Expect: {"app.kubernetes.io/component":"frontend",...,"color":"blue"}

# 3. Pick a target image for green
NEW_TAG=$(git rev-parse HEAD)

# 4. Update prod values to bump green
sed -i.bak "s|green: .*|green: $NEW_TAG|" gitops/environments/prod/values.yaml
git diff gitops/environments/prod/values.yaml

git add gitops/environments/prod/values.yaml
git commit -m "feat(prod): roll out $NEW_TAG to green"
git push

# 5. Watch green roll out (blue still serving)
kubectl -n field-fight-prod get pods -l color=green -w
# Wait until all green pods Ready

# 6. Open Grafana dashboard "Kubernetes / Compute Resources / Namespace (Pods)"
#    field-fight-prod — see request rate, latency, 5xx panels

# 7. Flip the switch
sed -i.bak "s|activeColor: blue|activeColor: green|" gitops/environments/prod/values.yaml
git add gitops/environments/prod/values.yaml
git commit -m "release: cutover prod from blue to green"
git push

# 8. Watch traffic move
kubectl -n field-fight-prod get svc ff-prod-frontend -o jsonpath='{.spec.selector.color}' -w
# Expect color to change from blue → green within ~30 sec

# 9. Verify in Grafana — request rate panels should show green pods now serving
#    and 5xx rate stays at zero throughout

# 10. Demonstrate rollback
git revert HEAD --no-edit
git push
# Watch selector flip back to blue. Same Grafana panel — zero blip.
```

## Production hardening (out of scope for this lab)

For a real production setup, on top of what's here:

- Use Argo Rollouts for native blue/green primitives + automated analysis
- Run pre-cutover smoke tests against the standby color via Job
- Set up an Argo CD AppProject sync window so deploys are gated
- Use `keepPVC` and rolling Postgres connection pools to avoid connection thrashing

For this assignment, the values-toggle approach is enough to demonstrate the pattern.
