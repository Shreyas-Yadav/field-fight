resource "kubernetes_namespace" "argocd" {
  count = var.create_eks && var.install_argocd ? 1 : 0

  metadata {
    name = "argocd"

    labels = {
      "app.kubernetes.io/name"       = "argocd"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  depends_on = [aws_eks_node_group.default]
}

resource "helm_release" "argocd" {
  count = var.create_eks && var.install_argocd ? 1 : 0

  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = var.argocd_chart_version
  namespace  = kubernetes_namespace.argocd[0].metadata[0].name

  values = [
    yamlencode({
      global = {
        domain = "argocd.local"
      }

      server = {
        service = {
          type = "ClusterIP"
        }
      }
    }),
  ]

  depends_on = [kubernetes_namespace.argocd]
}

resource "terraform_data" "argocd_root_app" {
  count = var.create_eks && var.install_argocd ? 1 : 0

  triggers_replace = [
    var.gitops_repo_url,
    var.gitops_target_revision,
  ]

  provisioner "local-exec" {
    # Refresh kubeconfig first so this works even after a stop/start cycle
    # where the cluster was recreated with a new endpoint hostname.
    command = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this[0].name} && kubectl apply -f ../../../gitops/root.yaml"
  }

  depends_on = [helm_release.argocd]
}
