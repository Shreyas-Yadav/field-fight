#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/terraform/environments/dev"
ECR_DIR="$ROOT/terraform/ecr"
VALUES_FILE="$ROOT/gitops/environments/dev/values.yaml"
SECRETS_ENV_FILE="${SECRETS_ENV_FILE:-$ROOT/secrets.env}"

AWS_REGION="${AWS_REGION:-us-east-1}"
LAB_ROLE_NAME="${LAB_ROLE_NAME:-LabRole}"
EKS_NODE_TYPE="${EKS_NODE_TYPE:-t3.medium}"
EKS_NODE_DESIRED_SIZE="${EKS_NODE_DESIRED_SIZE:-2}"
EKS_NODE_MAX_SIZE="${EKS_NODE_MAX_SIZE:-3}"
INGRESS_NAMESPACE="${INGRESS_NAMESPACE:-field-fight-dev}"
INGRESS_NAME="${INGRESS_NAME:-field-fight-dev-frontend}"
INGRESS_WAIT_SECONDS="${INGRESS_WAIT_SECONDS:-900}"
AUTO_APPROVE="${AUTO_APPROVE:-false}"

usage() {
  cat <<'EOF'
Usage:
  scripts/recreate-dev.sh up
  scripts/recreate-dev.sh ecr
  scripts/recreate-dev.sh validate
  scripts/recreate-dev.sh gitops
  scripts/recreate-dev.sh secrets
  scripts/recreate-dev.sh finish

Environment:
  TF_VAR_db_password    required
  AWS_REGION            default: us-east-1
  LAB_ROLE_NAME         default: LabRole
  EKS_NODE_TYPE         default: t3.medium
  EKS_NODE_DESIRED_SIZE default: 2
  EKS_NODE_MAX_SIZE     default: 3
  AUTO_APPROVE          default: false
  SECRETS_ENV_FILE      default: <repo-root>/secrets.env

Notes:
  - "up" recreates ECR and dev core infra including RDS and EKS,
    creates Route53 and ACM objects, and updates gitops/environments/dev/values.yaml
    with the new AWS account, RDS host, and frontend cert ARN.
    Terraform state is stored locally (no S3 backend).
  - "ecr" recreates only the ECR image repositories.
  - "validate" waits for ACM DNS validation after the domain is delegated to
    the Route53 nameservers printed by "up".
  - "gitops" installs Argo CD and the AWS Load Balancer Controller after the
    updated GitOps values and Kubernetes secrets are ready.
  - "secrets" reads SECRETS_ENV_FILE and creates the field-fight-<env>-secrets
    Kubernetes Secret in the field-fight-dev namespace. See secrets.env.example
    for the required keys.
  - "finish" waits for the frontend ingress, discovers the ALB DNS/zone ID, and
    applies the Route53 alias record.
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

apply_tf() {
  local dir="$1"
  shift
  if [[ "$AUTO_APPROVE" == "true" ]]; then
    terraform -chdir="$dir" apply -auto-approve "$@"
  else
    terraform -chdir="$dir" apply "$@"
  fi
}

init_dev_backend() {
  terraform -chdir="$DEV_DIR" init -reconfigure
}

update_dev_values() {
  local account_id="$1"
  local db_host="$2"
  local frontend_cert_arn="$3"

  python3 - "$VALUES_FILE" "$account_id" "$db_host" "$frontend_cert_arn" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
account_id = sys.argv[2]
db_host = sys.argv[3]
frontend_cert_arn = sys.argv[4]
text = path.read_text()
replacements = [
    (r'^(  accountId:\s*).*$',
     r'\1"' + account_id + '"',
     'registry.accountId'),
    (r'^(  host:\s*).*$',
     r'\1' + db_host,
     'database.host'),
    (r'^(  certificateArn:\s*).*$',
     r'\1' + frontend_cert_arn,
     'ingress.certificateArn'),
]

for pattern, replacement, label in replacements:
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.M)
    if count != 1:
        raise SystemExit(f"could not update {label} in {path}")

path.write_text(text)
PY
}

wait_for_ingress_hostname() {
  local deadline=$((SECONDS + INGRESS_WAIT_SECONDS))
  local hostname=""

  while (( SECONDS < deadline )); do
    hostname="$(kubectl -n "$INGRESS_NAMESPACE" get ingress "$INGRESS_NAME" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
    if [[ -n "$hostname" ]]; then
      printf '%s\n' "$hostname"
      return 0
    fi
    sleep 15
  done

  return 1
}

ensure_env() {
  if [[ -z "${TF_VAR_db_password:-}" ]]; then
    echo "TF_VAR_db_password is required" >&2
    exit 1
  fi
}

phase_up() {
  ensure_env
  need_cmd aws
  need_cmd terraform
  need_cmd python3

  local account_id role_arn frontend_cert_arn rds_endpoint rds_host
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  role_arn="arn:aws:iam::${account_id}:role/${LAB_ROLE_NAME}"

  phase_ecr

  init_dev_backend
  apply_tf "$DEV_DIR" \
    -var="aws_region=${AWS_REGION}" \
    -var="create_eks=true" \
    -var="install_argocd=false" \
    -var="install_aws_load_balancer_controller=false" \
    -var="create_route53_zone=true" \
    -var="create_frontend_certificate=true" \
    -var="create_grafana_certificate=false" \
    -var="validate_frontend_certificate=false" \
    -var="validate_grafana_certificate=false" \
    -var="eks_cluster_role_arn=${role_arn}" \
    -var="eks_node_role_arn=${role_arn}" \
    -var="eks_node_instance_types=[\"${EKS_NODE_TYPE}\"]" \
    -var="eks_node_desired_size=${EKS_NODE_DESIRED_SIZE}" \
    -var="eks_node_max_size=${EKS_NODE_MAX_SIZE}"

  aws eks update-kubeconfig \
    --region "$AWS_REGION" \
    --name "$(terraform -chdir="$DEV_DIR" output -raw eks_cluster_name)"

  frontend_cert_arn="$(terraform -chdir="$DEV_DIR" output -raw frontend_certificate_arn)"
  rds_endpoint="$(terraform -chdir="$DEV_DIR" output -raw rds_endpoint)"
  rds_host="${rds_endpoint%%:*}"

  if [[ -n "$frontend_cert_arn" ]]; then
    update_dev_values "$account_id" "$rds_host" "$frontend_cert_arn"
  fi

  echo
  echo "Bootstrap and core dev infra are up."
  echo
  echo "Route53 nameservers to delegate:"
  terraform -chdir="$DEV_DIR" output route53_name_servers
  echo
  echo "Frontend cert ARN:"
  terraform -chdir="$DEV_DIR" output frontend_certificate_arn
  echo
  echo "Local file updated:"
  echo "  gitops/environments/dev/values.yaml"
  echo
  echo "============================================================"
  echo "  PHASE 'up' COMPLETE — what to do next:"
  echo "============================================================"
  echo "  1. Delegate your domain to the Route53 nameservers above."
  echo "     Wait for DNS propagation (5-15 min). Verify with:"
  echo "       dig +short NS shri.software"
  echo
  echo "  2. Commit the auto-updated values.yaml and push:"
  echo "       git add gitops/environments/dev/values.yaml"
  echo "       git commit -m 'chore: update dev values for fresh AWS account'"
  echo "       git push"
  echo
  echo "  3. Update GitHub AWS secrets so Actions can push to ECR."
  echo
  echo "  4. Once DNS is propagated, run:"
  echo "       $0 validate"
  echo "============================================================"
}

phase_ecr() {
  need_cmd terraform

  terraform -chdir="$ECR_DIR" init
  apply_tf "$ECR_DIR" \
    -var="aws_region=${AWS_REGION}"

  echo
  echo "============================================================"
  echo "  PHASE 'ecr' COMPLETE — what to do next:"
  echo "============================================================"
  echo "  - GitHub Actions can now push images to ECR."
  echo "  - If running the full deploy, continue with: $0 up"
  echo "============================================================"
}

phase_validate() {
  ensure_env
  need_cmd aws
  need_cmd terraform

  local account_id role_arn
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  role_arn="arn:aws:iam::${account_id}:role/${LAB_ROLE_NAME}"

  init_dev_backend
  apply_tf "$DEV_DIR" \
    -var="aws_region=${AWS_REGION}" \
    -var="create_eks=true" \
    -var="install_argocd=false" \
    -var="install_aws_load_balancer_controller=false" \
    -var="create_route53_zone=true" \
    -var="create_frontend_certificate=true" \
    -var="create_grafana_certificate=false" \
    -var="validate_frontend_certificate=true" \
    -var="validate_grafana_certificate=false" \
    -var="eks_cluster_role_arn=${role_arn}" \
    -var="eks_node_role_arn=${role_arn}" \
    -var="eks_node_instance_types=[\"${EKS_NODE_TYPE}\"]" \
    -var="eks_node_desired_size=${EKS_NODE_DESIRED_SIZE}" \
    -var="eks_node_max_size=${EKS_NODE_MAX_SIZE}"

  echo
  echo "============================================================"
  echo "  PHASE 'validate' COMPLETE — what to do next:"
  echo "============================================================"
  echo "  Install Argo CD and the AWS Load Balancer Controller:"
  echo "       $0 gitops"
  echo "============================================================"
}

phase_gitops() {
  ensure_env
  need_cmd aws
  need_cmd terraform

  local account_id role_arn
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  role_arn="arn:aws:iam::${account_id}:role/${LAB_ROLE_NAME}"

  init_dev_backend
  apply_tf "$DEV_DIR" \
    -var="aws_region=${AWS_REGION}" \
    -var="create_eks=true" \
    -var="install_argocd=true" \
    -var="install_aws_load_balancer_controller=true" \
    -var="create_route53_zone=true" \
    -var="create_frontend_certificate=true" \
    -var="create_grafana_certificate=false" \
    -var="validate_frontend_certificate=true" \
    -var="validate_grafana_certificate=false" \
    -var="eks_cluster_role_arn=${role_arn}" \
    -var="eks_node_role_arn=${role_arn}" \
    -var="eks_node_instance_types=[\"${EKS_NODE_TYPE}\"]" \
    -var="eks_node_desired_size=${EKS_NODE_DESIRED_SIZE}" \
    -var="eks_node_max_size=${EKS_NODE_MAX_SIZE}"

  aws eks update-kubeconfig \
    --region "$AWS_REGION" \
    --name "$(terraform -chdir="$DEV_DIR" output -raw eks_cluster_name)"

  echo
  echo "============================================================"
  echo "  PHASE 'gitops' COMPLETE — what to do next:"
  echo "============================================================"
  echo "  1. (One-time) Copy the secrets template and fill in real values:"
  echo "       cp secrets.env.example secrets.env"
  echo "       \$EDITOR secrets.env"
  echo
  echo "  2. Apply Kubernetes secrets and run database migration:"
  echo "       $0 secrets"
  echo
  echo "  3. (First deploy only) Bootstrap the Argo CD root app:"
  echo "       kubectl apply -f gitops/root.yaml"
  echo
  echo "  4. Once pods are Running:"
  echo "       $0 finish"
  echo "============================================================"
}

phase_finish() {
  ensure_env
  need_cmd aws
  need_cmd terraform
  need_cmd kubectl

  local account_id role_arn frontend_alb_dns_name frontend_alb_zone_id
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  role_arn="arn:aws:iam::${account_id}:role/${LAB_ROLE_NAME}"

  echo "Waiting for ingress ${INGRESS_NAMESPACE}/${INGRESS_NAME}..."
  frontend_alb_dns_name="$(wait_for_ingress_hostname)" || {
    echo "Timed out waiting for ingress hostname." >&2
    exit 1
  }

  frontend_alb_zone_id="$(aws elbv2 describe-load-balancers \
    --region "$AWS_REGION" \
    --query "LoadBalancers[?DNSName=='${frontend_alb_dns_name}'].CanonicalHostedZoneId | [0]" \
    --output text)"

  init_dev_backend
  apply_tf "$DEV_DIR" \
    -var="aws_region=${AWS_REGION}" \
    -var="create_eks=true" \
    -var="install_argocd=true" \
    -var="install_aws_load_balancer_controller=true" \
    -var="create_route53_zone=true" \
    -var="create_frontend_certificate=true" \
    -var="create_grafana_certificate=false" \
    -var="validate_frontend_certificate=true" \
    -var="validate_grafana_certificate=false" \
    -var="frontend_alb_dns_name=${frontend_alb_dns_name}" \
    -var="frontend_alb_zone_id=${frontend_alb_zone_id}" \
    -var="eks_cluster_role_arn=${role_arn}" \
    -var="eks_node_role_arn=${role_arn}" \
    -var="eks_node_instance_types=[\"${EKS_NODE_TYPE}\"]" \
    -var="eks_node_desired_size=${EKS_NODE_DESIRED_SIZE}" \
    -var="eks_node_max_size=${EKS_NODE_MAX_SIZE}"

  echo
  echo "============================================================"
  echo "  PHASE 'finish' COMPLETE — deployment is live!"
  echo "============================================================"
  echo "  Frontend ALB:"
  echo "    DNS:    ${frontend_alb_dns_name}"
  echo "    ZoneID: ${frontend_alb_zone_id}"
  echo
  echo "  Verify the app:"
  echo "       bash scripts/dev-status.sh"
  echo "       curl -I https://field-fight-dev.shri.software"
  echo
  echo "  Open in browser:"
  echo "       https://field-fight-dev.shri.software"
  echo "============================================================"
}

read_db_value_from_values() {
  # Reads a key under the top-level `database:` block in a values.yaml file.
  # Usage: read_db_value_from_values <values-file> <key>
  python3 - "$1" "$2" <<'PY'
import re, sys
path, key = sys.argv[1], sys.argv[2]
text = open(path).read()
m = re.search(rf'^database:\s*\n((?:  .*\n)+)', text, re.M)
if not m:
    sys.exit(f"could not find 'database:' block in {path}")
block = m.group(1)
m = re.search(rf'^  {key}:\s*(.+?)\s*$', block, re.M)
if not m:
    sys.exit(f"could not find database.{key} in {path}")
val = m.group(1).strip().strip('"').strip("'")
print(val)
PY
}

apply_secret_for_env() {
  # Apply the field-fight-<env>-secrets Secret to the field-fight-<env>
  # namespace, restart deployments, and re-run the migration job.
  # The secret values come from sourced SECRETS_ENV_FILE; the database
  # connection details come from the per-env values.yaml.
  local env="$1"
  local namespace="field-fight-${env}"
  local secret_name="field-fight-${env}-secrets"
  local app_name="field-fight-${env}"
  local values_file="$ROOT/gitops/environments/${env}/values.yaml"

  if [[ ! -f "$values_file" ]]; then
    echo "[${env}] skipped — values file not found: $values_file"
    return 0
  fi

  echo
  echo "------------------------------------------------------------"
  echo "  Applying secret for environment: ${env}"
  echo "------------------------------------------------------------"

  local db_host db_port db_name db_user database_url
  db_host="$(read_db_value_from_values "$values_file" host)"
  db_port="$(read_db_value_from_values "$values_file" port)"
  db_name="$(read_db_value_from_values "$values_file" name)"
  db_user="$(read_db_value_from_values "$values_file" user)"

  if [[ -z "$db_host" || -z "$db_port" || -z "$db_name" || -z "$db_user" ]]; then
    echo "[${env}] could not read all database.* fields from $values_file" >&2
    return 1
  fi

  database_url="postgres://${db_user}:${DB_PASSWORD}@${db_host}:${db_port}/${db_name}"

  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -

  kubectl create secret generic "$secret_name" \
    --namespace="$namespace" \
    --from-literal=DATABASE_URL="$database_url" \
    --from-literal=DB_PASSWORD="$DB_PASSWORD" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --from-literal=GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    --from-literal=GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
    --from-literal=GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
    --from-literal=GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" \
    --dry-run=client -o yaml | kubectl apply -f -

  echo "[${env}] secret applied (host=${db_host})"

  # Restart deployments so pods re-read the refreshed secret.
  if kubectl -n "$namespace" get deployments -o name 2>/dev/null | grep -q .; then
    echo "[${env}] restarting deployments..."
    kubectl -n "$namespace" rollout restart deployment >/dev/null
  fi

  # Delete any existing migration jobs and pods so a fresh one runs.
  local old_jobs
  old_jobs="$(kubectl -n "$namespace" get jobs -o name 2>/dev/null \
    | grep -E "/field-fight-.*-migrations(-[a-z0-9]+)?$" || true)"
  if [[ -n "$old_jobs" ]]; then
    # shellcheck disable=SC2086
    kubectl -n "$namespace" delete $old_jobs --ignore-not-found >/dev/null
  fi
  kubectl -n "$namespace" delete pods \
    -l app.kubernetes.io/component=migrations \
    --ignore-not-found >/dev/null 2>&1 || true

  # Force ArgoCD to recreate the Job immediately.
  if kubectl get application "$app_name" -n argocd >/dev/null 2>&1; then
    kubectl -n argocd patch application "$app_name" \
      --type merge \
      -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}' >/dev/null
  fi
}

wait_for_migration() {
  # Wait up to 5 minutes for the latest migrations pod in <namespace>
  # to reach Succeeded. Returns 0 on success, 1 on failure/timeout.
  local namespace="$1"
  local deadline=$((SECONDS + 300))
  local mig_pod="" phase=""

  while (( SECONDS < deadline )); do
    mig_pod="$(kubectl -n "$namespace" get pods -l app.kubernetes.io/component=migrations \
      --sort-by=.metadata.creationTimestamp \
      -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null || true)"
    if [[ -n "$mig_pod" ]]; then
      phase="$(kubectl -n "$namespace" get pod "$mig_pod" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
      case "$phase" in
        Succeeded)
          echo "[${namespace}] migration pod '$mig_pod' succeeded"
          return 0
          ;;
        Failed)
          echo "[${namespace}] migration pod '$mig_pod' failed. Last logs:" >&2
          kubectl -n "$namespace" logs "$mig_pod" 2>&1 | tail -20 >&2 || true
          return 1
          ;;
      esac
    fi
    sleep 5
  done

  echo "[${namespace}] migration did not complete within timeout" >&2
  return 1
}

phase_secrets() {
  need_cmd kubectl
  need_cmd python3

  if [[ ! -f "$SECRETS_ENV_FILE" ]]; then
    echo "secrets env file not found: $SECRETS_ENV_FILE" >&2
    echo "Copy secrets.env.example to secrets.env and fill in real values." >&2
    exit 1
  fi

  # Source the env file. Only reads KEY=VALUE lines.
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_ENV_FILE"
  set +a

  local missing=()
  for var in DB_PASSWORD JWT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    echo "missing required keys in $SECRETS_ENV_FILE: ${missing[*]}" >&2
    exit 1
  fi

  # Apply secret to every environment that has a values.yaml file.
  local envs=(dev qa uat prod)
  for env in "${envs[@]}"; do
    apply_secret_for_env "$env"
  done

  echo
  echo "------------------------------------------------------------"
  echo "  Waiting for migration jobs to complete in each namespace"
  echo "------------------------------------------------------------"

  local failed=()
  for env in "${envs[@]}"; do
    local namespace="field-fight-${env}"
    if ! kubectl get namespace "$namespace" >/dev/null 2>&1; then
      continue
    fi
    if ! wait_for_migration "$namespace"; then
      failed+=("$env")
    fi
  done

  echo
  echo "------------------------------------------------------------"
  echo "  Waiting for app deployments to finish rolling out"
  echo "------------------------------------------------------------"
  for env in "${envs[@]}"; do
    local namespace="field-fight-${env}"
    if kubectl get namespace "$namespace" >/dev/null 2>&1; then
      kubectl -n "$namespace" rollout status deployment --timeout=300s 2>&1 \
        | sed "s/^/[${env}] /" || true
    fi
  done

  if (( ${#failed[@]} > 0 )); then
    echo
    echo "Migration failed in: ${failed[*]}" >&2
    exit 1
  fi

  echo
  echo "============================================================"
  echo "  PHASE 'secrets' COMPLETE — what to do next:"
  echo "============================================================"
  echo "  1. (First deploy only) Apply the Argo CD root app:"
  echo "       kubectl apply -f gitops/root.yaml"
  echo
  echo "  2. Wait for the frontend ingress, then:"
  echo "       $0 finish"
  echo "============================================================"
}

main() {
  local mode="${1:-}"

  case "$mode" in
    up)
      phase_up
      ;;
    ecr)
      phase_ecr
      ;;
    validate)
      phase_validate
      ;;
    gitops)
      phase_gitops
      ;;
    secrets)
      phase_secrets
      ;;
    finish)
      phase_finish
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "unknown mode: $mode" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
