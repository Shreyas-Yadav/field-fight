#!/usr/bin/env bash
# dev-status.sh — read-only status check for the field-fight dev environment.
# Uses kubectl as the primary source of truth (works with voclabs role).
# AWS CLI is used opportunistically — gracefully skipped if access is denied.
# Run this at the start of every session.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
CLUSTER="field-fight-dev-eks"
NODEGROUP="field-fight-dev-nodes"
RDS_ID="field-fight-dev-postgres"
GITOPS_VALUES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/gitops/environments/dev/values.yaml"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()      { echo -e "  ${GREEN}✓${NC} $*"; }
fail()    { echo -e "  ${RED}✗${NC} $*"; }
warn()    { echo -e "  ${YELLOW}~${NC} $*"; }
section() { echo -e "\n${BLUE}▸${NC} $*"; }

# Run an aws command; echo output or "ACCESS_DENIED" / "NOT_FOUND"
aws_query() {
  local out err_file
  err_file=$(mktemp)
  out=$(aws "$@" 2>"$err_file" || true)
  if grep -qE "AccessDenied|not authorized|UnauthorizedOperation" "$err_file"; then
    rm -f "$err_file"; echo "ACCESS_DENIED"; return
  fi
  rm -f "$err_file"
  echo "${out:-NOT_FOUND}"
}

echo ""
echo "══════════════════════════════════════════"
echo "  Field Fight Dev — Status Check"
echo "══════════════════════════════════════════"

# ── AWS Credentials ───────────────────────────
section "AWS Credentials"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
if [[ -z "$ACCOUNT_ID" ]]; then
  fail "Credentials expired — paste fresh lab credentials first"
  exit 1
fi
ok "Account: ${ACCOUNT_ID}"
ok "Session: $(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null | awk -F'/' '{print $2"/"$3}')"

# ── Kubernetes (primary source of truth) ──────
section "Kubernetes Cluster"
if ! kubectl cluster-info &>/dev/null; then
  fail "kubectl not connected"
  warn "Run: aws eks update-kubeconfig --region ${REGION} --name ${CLUSTER}"
  KUBECTL_OK=false
else
  KUBECTL_OK=true
  SERVER=$(kubectl cluster-info 2>/dev/null | grep "control plane" | grep -oE 'https://[^ ]+' || echo "unknown")
  ok "Connected to: ${SERVER}"

  # Nodes
  TOTAL_NODES=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
  READY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready" || echo "0")
  if [[ "$TOTAL_NODES" -eq 0 ]]; then
    fail "No nodes found — cluster may be scaled to zero or not created"
  elif [[ "$READY_NODES" -eq "$TOTAL_NODES" ]]; then
    NODE_TYPES=$(kubectl get nodes --no-headers -o custom-columns='TYPE:.metadata.labels.node\.kubernetes\.io/instance-type' 2>/dev/null | sort -u | tr '\n' ',' | sed 's/,$//')
    ok "Nodes: ${READY_NODES}/${TOTAL_NODES} Ready (${NODE_TYPES})"
  else
    warn "Nodes: ${READY_NODES}/${TOTAL_NODES} Ready"
  fi

  # AMI per node — useful for Day 2a patching demo (BEFORE/AFTER comparison)
  section "Node AMI (Day 2a Patching)"
  AMI_INFO=$(aws_query ec2 describe-instances \
    --region "$REGION" \
    --filters \
      "Name=tag:eks:nodegroup-name,Values=field-fight-dev-default" \
      "Name=instance-state-name,Values=running" \
    --query "Reservations[*].Instances[*].[PrivateDnsName,ImageId]" \
    --output text)
  if [[ "$AMI_INFO" == "ACCESS_DENIED" || "$AMI_INFO" == "NOT_FOUND" || -z "$AMI_INFO" ]]; then
    warn "AMI IDs: not accessible via AWS CLI (credentials may lack EC2:DescribeInstances)"
    warn "Fallback: kubectl get nodes -o wide  (shows OS image string, not AMI ID)"
  else
    while IFS=$'\t' read -r hostname ami_id; do
      short_host=$(echo "$hostname" | cut -d. -f1)
      ok "${short_host}: ${ami_id}"
    done <<< "$AMI_INFO"
  fi
fi

# ── Per-environment pod status ─────────────────
if [[ "$KUBECTL_OK" == "true" ]]; then
  section "Application Environments"

  for ns in field-fight-dev field-fight-qa field-fight-uat field-fight-prod; do
    NS_EXISTS=$(kubectl get namespace "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$NS_EXISTS" -eq 0 ]]; then
      warn "${ns}: namespace not found"
      continue
    fi

    PODS=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
    # Exclude Completed pods — they are old rollout replicas being garbage collected
    RUNNING=$(echo "$PODS" | grep "Running" | grep -cv "Completed" || true)
    PENDING=$(echo "$PODS" | grep -c "Pending" || true)
    ERRORED=$(echo "$PODS" | grep -cE "Error|CrashLoop|CreateContainer" || true)
    TOTAL=$(echo "$PODS" | grep -v "Completed" | grep -c "." || true)

    if [[ "$TOTAL" -eq 0 ]]; then
      warn "${ns}: no pods (ArgoCD may not have synced yet)"
    elif [[ "$ERRORED" -gt 0 ]]; then
      fail "${ns}: ${RUNNING} running, ${ERRORED} errored, ${PENDING} pending"
    elif [[ "$PENDING" -gt 0 ]]; then
      warn "${ns}: ${RUNNING} running, ${PENDING} pending"
    else
      ok "${ns}: ${RUNNING} pods running"
    fi
  done

  # ── ArgoCD app sync status ─────────────────
  section "ArgoCD Applications"
  ARGOCD_APPS=$(kubectl get applications -n argocd --no-headers 2>/dev/null || true)
  if [[ -z "$ARGOCD_APPS" ]]; then
    warn "No ArgoCD applications found"
  else
    while IFS= read -r line; do
      NAME=$(echo "$line"  | awk '{print $1}')
      SYNC=$(echo "$line"  | awk '{print $2}')
      HEALTH=$(echo "$line" | awk '{print $3}')
      if [[ "$SYNC" == "Synced" && "$HEALTH" == "Healthy" ]]; then
        ok "${NAME}: ${SYNC} / ${HEALTH}"
      elif [[ "$SYNC" == "Synced" ]]; then
        warn "${NAME}: ${SYNC} / ${HEALTH}"
      else
        fail "${NAME}: ${SYNC} / ${HEALTH}"
      fi
    done <<< "$ARGOCD_APPS"
  fi

  # ── Image tags across environments ────────────
  section "Deployed Image Tags"
  for env in dev qa uat prod; do
    VALUES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/gitops/environments/${env}/values.yaml"
    if [[ -f "$VALUES" ]]; then
      TAG=$(awk -F': ' '/^imageTag:/ { gsub(/"/, "", $2); print $2; exit }' "$VALUES" | tr -d ' ')
      if [[ -z "$TAG" ]]; then
        warn "${env}: no image tag (not yet promoted)"
      else
        ok "${env}: ${TAG:0:12}..."
      fi
    fi
  done

  # ── RDS reachability via pod ───────────────────
  section "Database"
  RDS_HOST=$(awk -F': ' '/^  host:/ { print $2; exit }' "$GITOPS_VALUES" 2>/dev/null || echo "")
  if [[ -n "$RDS_HOST" ]]; then
    ok "RDS host (from values.yaml): ${RDS_HOST}"
    AUTH_READY=$(kubectl get pods -n field-fight-dev -l "app.kubernetes.io/component=auth-service" --no-headers 2>/dev/null | grep -c "1/1" || true)
    if [[ "$AUTH_READY" -gt 0 ]]; then
      ok "DB connection: OK (auth-service is healthy)"
    else
      warn "DB connection: uncertain (auth-service not ready)"
    fi
  else
    warn "RDS host not found in values.yaml"
  fi

  # ── App health via HTTP ────────────────────────
  section "Application Health (HTTP)"
  FRONTEND_URL=$(awk -F': ' '/^  frontend:/ { print $2; exit }' "$GITOPS_VALUES" 2>/dev/null | tr -d ' ' || echo "")
  if [[ -n "$FRONTEND_URL" ]]; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$FRONTEND_URL" 2>/dev/null || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
      ok "Frontend (${FRONTEND_URL}): HTTP ${HTTP_STATUS}"
    else
      fail "Frontend (${FRONTEND_URL}): HTTP ${HTTP_STATUS}"
    fi

    for svc in health; do
      for port_path in "3001/health" "3002/health" "3003/health" "3004/health"; do
        break  # skip internal service checks — not reachable from outside cluster
      done
    done

    # Check backend via the public domain (proxied through frontend/ALB)
    HEALTH_STATUS=$(curl -s --max-time 5 "${FRONTEND_URL}/health" 2>/dev/null || echo "")
    if echo "$HEALTH_STATUS" | grep -q "ok\|status"; then
      ok "Backend health endpoint: responding"
    else
      warn "Backend health: not reachable externally (normal if no public route)"
    fi
  else
    warn "Frontend URL not found in values.yaml"
  fi
fi

# ── AWS resources ──────────────────────────────
section "AWS Resources"
# ECR: verify via running pod image URI instead of AWS CLI
if [[ "$KUBECTL_OK" == "true" ]]; then
  ECR_IMAGE=$(kubectl get pods -n field-fight-dev --no-headers 2>/dev/null \
    | grep Running | head -1 \
    | awk '{print $1}' \
    | xargs -I{} kubectl get pod {} -n field-fight-dev \
      -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
  if echo "$ECR_IMAGE" | grep -q "ecr"; then
    ok "ECR: images pulling successfully (${ECR_IMAGE##*/})"
  else
    warn "ECR: could not verify from running pods"
  fi
fi

# Terraform state lives in S3 — only accessible from AWS CloudShell (not local voclabs session)
ok "Terraform state: s3://field-fight-shared-terraform-state-${ACCOUNT_ID}-us-east-1 (run terraform from CloudShell)"

echo ""
echo "══════════════════════════════════════════"
