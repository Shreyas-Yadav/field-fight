#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/terraform/environments/dev"
ECR_DIR="$ROOT/terraform/ecr"
VALUES_FILE="$ROOT/gitops/environments/dev/values.yaml"

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
  scripts/recreate-dev.sh finish

Environment:
  TF_VAR_db_password    required
  AWS_REGION            default: us-east-1
  LAB_ROLE_NAME         default: LabRole
  EKS_NODE_TYPE         default: t3.medium
  EKS_NODE_DESIRED_SIZE default: 2
  EKS_NODE_MAX_SIZE     default: 3
  AUTO_APPROVE          default: false

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
  echo "Next steps:"
  echo "  1. Update GitHub AWS secrets for the fresh lab account and push images to ECR."
  echo "  2. Delegate your domain to the Route53 nameservers above."
  echo "  3. Run: $0 validate"
  echo "  4. Commit and push the gitops values change."
  echo "  5. Recreate Kubernetes secrets for the app and Grafana."
  echo "  6. Run: $0 gitops"
  echo "  7. Run: $0 finish"
}

phase_ecr() {
  need_cmd terraform

  terraform -chdir="$ECR_DIR" init
  apply_tf "$ECR_DIR" \
    -var="aws_region=${AWS_REGION}"

  echo
  echo "ECR repositories are ready."
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
  echo "ACM certificates are validated."
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
  echo "Argo CD and AWS Load Balancer Controller are installed."
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
  echo "Frontend ALB:"
  echo "  DNS:    ${frontend_alb_dns_name}"
  echo "  ZoneID: ${frontend_alb_zone_id}"
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
