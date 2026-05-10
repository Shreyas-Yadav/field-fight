#!/bin/bash
# When a launch template supplies a custom AMI, EKS no longer injects
# bootstrap user data automatically. This script must call it explicitly.
/etc/eks/bootstrap.sh ${cluster_name}
