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

      extraObjects = [
        {
          apiVersion = "argoproj.io/v1alpha1"
          kind       = "Application"
          metadata = {
            name      = "field-fight-root"
            namespace = "argocd"
            finalizers = [
              "resources-finalizer.argocd.argoproj.io",
            ]
          }
          spec = {
            project = "default"
            source = {
              repoURL        = var.gitops_repo_url
              targetRevision = var.gitops_target_revision
              path           = "gitops/apps"
            }
            destination = {
              server    = "https://kubernetes.default.svc"
              namespace = "argocd"
            }
            syncPolicy = {
              automated = {
                prune    = true
                selfHeal = true
              }
              syncOptions = [
                "CreateNamespace=true",
              ]
            }
          }
        },
      ]
    }),
  ]

  depends_on = [kubernetes_namespace.argocd]
}
