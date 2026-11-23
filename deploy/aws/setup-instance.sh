#!/bin/bash
# One-time setup of a fresh Ubuntu 24.04 EC2 instance, passed as user-data at launch.
# Installs Docker with the Compose plugin, adds swap for npm/pip installs, and creates
# the folders the deploy uses. Progress: /var/log/cloud-init-output.log
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 curl
systemctl enable --now docker
usermod -aG docker ubuntu

# 2 GB swap: dependency installs of the repositories under test can spike memory
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Clones of the repositories under test (shared with the executor containers)
install -d -o ubuntu -g ubuntu /home/ubuntu/repos
# Releases and the .env live here
install -d -o ubuntu -g ubuntu /home/ubuntu/greenbranch /home/ubuntu/greenbranch/releases

touch /var/lib/greenbranch-setup-done
