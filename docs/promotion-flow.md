# Git-Driven Promotion Flow

How code moves from development to production through four environments via
GitHub Actions and Argo CD. **No `kubectl apply`, no AWS Console clicks.**

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                       SINGLE GIT BRANCH (main)                     │
└────────────────────────────────────────────────────────────────────┘

   gitops/environments/dev/values.yaml    →  imageTag: <commit SHA>
   gitops/environments/qa/values.yaml     →  imageTag: <commit SHA>
   gitops/environments/uat/values.yaml    →  imageTag: <commit SHA>
   gitops/environments/prod/values.yaml   →  imageTag: <commit SHA>

   ┌──────┐   commit   ┌──────────┐  watches    ┌─────────────┐
   │  Dev │ ─────────► │   Git    │ ◄────────── │   Argo CD   │
   │ Push │            │  (main)  │             │ (in cluster)│
   └──────┘            └──────────┘             └──────┬──────┘
                                                       │
                                                       ▼
                                          ┌──────────────────────┐
                                          │     EKS Cluster      │
                                          │  ┌─┐ ┌─┐ ┌─┐ ┌─┐    │
                                          │  │d│ │q│ │u│ │p│    │ namespaces
                                          │  │e│ │a│ │a│ │r│    │
                                          │  │v│ │ │ │t│ │o│    │
                                          │  └─┘ └─┘ └─┘ └─┘    │
                                          └──────────────────────┘
```

All four environments live in the **same EKS cluster**, isolated by namespace.
Each Argo CD `Application` watches a single `values.yaml` file in Git and
deploys the same Helm chart with that env's values.

## Promotion Stages

```
    push to main          nightly 02:00 UTC          PR merge / rc commit       git tag v*
─────────────────────► ──────────────────────────► ──────────────────────────► ─────────────►
        │                       │                            │                        │
        ▼                       ▼                            ▼                        ▼
   ┌─────────┐            ┌──────────┐                 ┌──────────┐             ┌──────────┐
   │ Publish │            │ Promote  │                 │ Promote  │             │ Promote  │
   │ Images  │            │ Dev → QA │                 │ QA → UAT │             │ UAT→Prod │
   └────┬────┘            └────┬─────┘                 └────┬─────┘             └────┬─────┘
        │                      │                            │                        │
        ▼                      ▼                            ▼                        ▼
   builds image            copies dev              copies qa imageTag           copies uat
   pushes to ECR           imageTag into           into uat/values.yaml         imageTag into
   updates dev             qa/values.yaml          commits to main              prod/values.yaml
   values.yaml             commits to main                                      commits to main
   commits to main
        │                      │                            │                        │
        └──────────────────────┴────────────────────────────┴────────────────────────┘
                                              │
                                              ▼
                                   Argo CD detects values.yaml
                                   change, syncs target namespace
```

## Trigger Rules

| Stage | Workflow file | Trigger | Why |
|---|---|---|---|
| Build & deploy to dev | `publish-images.yml` | `push` to `main` | Every commit deploys to dev for fast feedback |
| dev → qa | `promote-qa.yml` | nightly cron `0 2 * * *` (also manual `workflow_dispatch`) | Sleep test: yesterday's dev gets a stable QA run overnight |
| qa → uat | `promote-uat.yml` | `pull_request` closed (merged) **or** push commit starting with `rc:` / containing `(rc)` | UAT needs a deliberate human signal — PR review or RC tag |
| uat → prod | `promote-prod.yml` | `push` of git tag matching `v*` (e.g. `v1.0.0`) | Production releases are tagged events |

## Anatomy of a promotion commit

Every promotion is a single Git commit that touches only the target env's
`values.yaml`. Examples:

```
chore(gitops): promote dev to a1b2c3d [skip ci]
chore(gitops): promote qa to e4f5g6h [skip ci]
chore(gitops): promote uat to i7j8k9l [skip ci]
```

`[skip ci]` prevents the promotion commit from re-triggering CI workflows.

## How to Roll Back

Roll back is the same shape as roll forward — a Git commit. Two options:

### Option 1 — Revert the promotion commit (safest)

Find the bad commit:

```bash
git log --oneline gitops/environments/<env>/values.yaml | head -5
```

Revert it:

```bash
git revert <commit-sha>
git push
```

Argo CD detects the change and rolls the namespace back to the previous image
tag. No manual cluster intervention.

### Option 2 — Promote the previous tag manually

Edit the env's `values.yaml`, change `imageTag` to the previous SHA, commit,
push. Same end result, but doesn't preserve audit trail of "what we rolled
back from."

## Manually Triggering a Promotion

Each promotion workflow has `workflow_dispatch`. From GitHub Actions UI:

1. Repo → **Actions** tab
2. Pick the workflow on the left (e.g., "Nightly Promote Dev to QA")
3. **Run workflow** dropdown → pick `main` → **Run**

Or via `gh` CLI:

```bash
gh workflow run promote-qa.yml
gh workflow run promote-uat.yml
gh workflow run promote-prod.yml
```

## Demo Script (for the final defense)

Run these in order to demonstrate the full chain in ~5 minutes:

### 1. Show the four live environments

```bash
for h in field-fight-dev field-fight-qa field-fight-uat field-fight; do
  echo "=== $h.shri.software ==="
  curl -I -s "https://$h.shri.software" | head -1
done
```

All four return `HTTP/2 200`.

```bash
kubectl get applications -n argocd
```

All four `Synced / Healthy`.

### 2. Show different image tags per env (before promotion)

```bash
grep imageTag gitops/environments/{dev,qa,uat,prod}/values.yaml
```

### 3. Push a code change → see it land in dev only

```bash
echo "// demo $(date)" >> frontend/src/App.tsx
git commit -am "demo: trigger promotion chain"
git push
```

Watch GitHub Actions tab. `Publish Images` runs, builds, updates
`gitops/environments/dev/values.yaml`. ~5 min.

### 4. Show dev pods rolling to the new image

```bash
kubectl get pods -n field-fight-dev -w
```

### 5. Manually promote dev → qa (instead of waiting for nightly)

```bash
gh workflow run promote-qa.yml
```

After ~30 seconds, qa's `values.yaml` is updated and pushed. Argo CD picks it
up. ~2 min later qa is on the new image.

### 6. Promote qa → uat with an RC commit

```bash
git commit --allow-empty -m "rc: ready for UAT"
git push
```

`promote-uat.yml` detects the `rc:` prefix and runs.

### 7. Cut a release tag → prod gets the change

```bash
git tag v1.0.0-demo
git push origin v1.0.0-demo
```

`promote-prod.yml` triggers only on tags. ~30 sec to commit, ~2 min for Argo
CD to roll prod.

### 8. Demonstrate rollback

```bash
git log --oneline gitops/environments/prod/values.yaml | head -3
git revert <last-promotion-sha>
git push
```

Prod pods roll back to the previous image. Argo CD shows the rollback in its
sync history.

## Constraints This Satisfies (from `output.pdf`)

- ✅ Promotion is Git-driven — every cluster change is a commit on `main`
- ✅ Manual click-to-deploy in AWS Console is prohibited — never used
- ✅ Dev/QA → UAT triggers on PR merge or RC commit signal
- ✅ UAT → prod triggers only on release tag
- ✅ Rollback is `git revert`, exercises the same code path

## Related Files

- `gitops/environments/{dev,qa,uat,prod}/values.yaml` — environment desired
  state
- `gitops/apps/{dev,qa,uat,prod}.yaml` — Argo CD `Application` manifests
- `gitops/root.yaml` — app-of-apps entry point
- `.github/workflows/promote-{qa,uat,prod}.yml` — promotion workflows
- `.github/workflows/publish-images.yml` — image build + dev tag update
- `k8s/helm/field-fight/` — the single Helm chart used by all four envs
