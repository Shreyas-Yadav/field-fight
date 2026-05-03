# Phase 3: Container Registry and Image Build Flow

Phase 3 creates versioned container artifacts, but it does not deploy them.

## What This Adds

- ECR repository Terraform in `terraform/ecr`.
- A PR checks workflow in `.github/workflows/pr-checks.yml`.
- A main/manual publish workflow in `.github/workflows/publish-images.yml`.
- API tests backed by a Postgres service container in CI.
- Frontend production build verification in CI.
- Docker builds for all deployable images.
- ECR publishing for non-PR workflow runs.
- Immutable commit SHA image tags.

This version is set up for AWS lab/builder accounts that provide temporary `LabRole` credentials instead of letting you create a GitHub OIDC IAM role.

## Required GitHub Variables and Secrets

Configure this repository variable:

| Name | Example | Purpose |
| --- | --- | --- |
| `AWS_REGION` | `us-east-1` | AWS region for ECR. |
| `ECR_REPOSITORY_PREFIX` | `field-fight` | Prefix matching Terraform-created ECR repositories. |

Configure these repository secrets from the lab credentials page each time the lab session credentials rotate:

| Name | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Temporary lab access key. |
| `AWS_SECRET_ACCESS_KEY` | Temporary lab secret key. |
| `AWS_SESSION_TOKEN` | Temporary lab session token for `LabRole`. |

## Image Names

With the default prefix, the workflow publishes:

- `field-fight-frontend:<commit-sha>`
- `field-fight-game-server:<commit-sha>`
- `field-fight-leaderboard-api:<commit-sha>`
- `field-fight-auth-service:<commit-sha>`
- `field-fight-match-history-service:<commit-sha>`
- `field-fight-migrations:<commit-sha>`

## Promotion Boundary

This phase intentionally stops after publishing images. Later phases should update Git-tracked Kubernetes or Helm desired state, and Argo CD should perform the actual cluster sync.
