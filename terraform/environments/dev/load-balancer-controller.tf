resource "helm_release" "aws_load_balancer_controller" {
  count = var.create_eks && var.install_aws_load_balancer_controller ? 1 : 0

  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.aws_load_balancer_controller_chart_version
  namespace  = "kube-system"

  values = [
    yamlencode({
      clusterName = aws_eks_cluster.this[0].name
      region      = var.aws_region
      vpcId       = module.vpc.vpc_id
      hostNetwork = true
      dnsPolicy   = "ClusterFirstWithHostNet"

      serviceAccount = {
        create = true
        name   = "aws-load-balancer-controller"
      }
    }),
  ]

  depends_on = [aws_eks_node_group.default]
}
