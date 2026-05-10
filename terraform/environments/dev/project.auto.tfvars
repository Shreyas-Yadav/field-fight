# Project-specific configuration — not secrets, safe to commit.
# These values are project/team specific and must be set explicitly
# rather than relying on Terraform variable defaults.

gitops_repo_url   = "https://github.com/Shreyas-Yadav/field-fight.git"
domain_name       = "shri.software"
frontend_hostname = "field-fight-dev.shri.software"
grafana_hostname  = "grafana-dev.shri.software"

# Dev only — skip final RDS snapshot on destroy to allow clean teardown.
# Production environments must NOT override this (default is false).
db_skip_final_snapshot = true
