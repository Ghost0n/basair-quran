#!/usr/bin/env bash
#
# One-time preparation of a fresh Contabo VPS (Ubuntu 24.04) for Q-Basair
# (docs/deployment.md → "1. Prepare the server"). Run as root, from a checkout:
#
#   scp deploy/server/setup.sh root@<server>:
#   ssh root@<server> "bash setup.sh --ssh-key 'ssh-ed25519 AAAA... github-deploy' \
#       --admin-key 'ssh-ed25519 AAAA... you'"
#
# The whole remote command is one quoted string: ssh joins its arguments with
# spaces, so an unquoted key would reach the server cut at its first space.
# The deploy key must have no passphrase (the release workflow can't type one).
#
# It is safe to run again (every step checks before it changes anything).
#
# What it does:
#   - updates the system, enables unattended security upgrades and fail2ban;
#   - installs Docker Engine + the Compose plugin (Docker's own apt repository);
#   - creates the `deploy` user (docker group, SSH key login only) that the
#     release workflow uses, and /srv/q-basair owned by it;
#   - hardens SSH (no password login, no root login), opens 22/80/443 with ufw;
#   - adds a swap file (Contabo VPSs have none) and caps the journal and
#     Docker's logs;
#   - installs the cron jobs: certificate renewal and the nightly backup.

set -euo pipefail

APP_DIR="/srv/q-basair"
DEPLOY_USER="deploy"
SWAP_SIZE="4G"
DEPLOY_KEY=""
ADMIN_KEY=""

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options:
  --ssh-key KEY      public key the release workflow logs in with (required)
  --admin-key KEY    your own public key, added to the deploy user too
  --swap SIZE        swap file size (default 4G; "0" for none)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-key) DEPLOY_KEY="${2:-}"; shift 2 ;;
    --admin-key) ADMIN_KEY="${2:-}"; shift 2 ;;
    --swap) SWAP_SIZE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo bash $0 ...)." >&2
  exit 1
fi
if [[ -z "${DEPLOY_KEY}" ]]; then
  echo "--ssh-key is required: the public half of the key stored in the DEPLOY_SSH_KEY secret." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

step "System packages and automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades sqlite3 rsync jq
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Docker Engine and the Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Bounded container logs by default (the compose file sets them per service too).
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
  systemctl restart docker
fi
systemctl enable --now docker

step "The deploy user"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "Q-Basair deploy" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "${KEYS}"
for key in "${DEPLOY_KEY}" "${ADMIN_KEY}"; do
  if [[ -n "${key}" ]] && ! grep -qxF "${key}" "${KEYS}"; then
    echo "${key}" >> "${KEYS}"
  fi
done
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${KEYS}"
chmod 600 "${KEYS}"

step "The application directory"
install -d -m 755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" \
  "${APP_DIR}" "${APP_DIR}/data" "${APP_DIR}/backups" "${APP_DIR}/letsencrypt" "${APP_DIR}/certbot-webroot"

step "SSH: keys only, no root login"
cat > /etc/ssh/sshd_config.d/10-qbasair.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

step "Firewall: SSH, HTTP, HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# Docker publishes 80/443 through its own iptables chain, before ufw's rules:
# the compose file publishes nothing else, so nothing else is reachable.

step "fail2ban for SSH"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

if [[ "${SWAP_SIZE}" != "0" ]] && ! swapon --show | grep -q /swapfile; then
  step "Swap file (${SWAP_SIZE})"
  fallocate -l "${SWAP_SIZE}" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-qbasair-swap.conf
fi

step "Journal size"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/90-qbasair.conf
systemctl restart systemd-journald

step "Cron: certificate renewal and nightly backup (as ${DEPLOY_USER})"
cat > /etc/cron.d/qbasair <<EOF
# Q-Basair (deploy/server/setup.sh). Logs in /var/log/qbasair-*.log.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * ${DEPLOY_USER} cd ${APP_DIR} && ./deploy/server/tls.sh renew >> /var/log/qbasair-tls.log 2>&1
42 2 * * * ${DEPLOY_USER} cd ${APP_DIR} && ./deploy/server/backup.sh >> /var/log/qbasair-backup.log 2>&1
EOF
for log in /var/log/qbasair-tls.log /var/log/qbasair-backup.log; do
  touch "${log}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${log}"
done

cat <<EOF

Done. Next (docs/deployment.md):
  1. Put the production settings in ${APP_DIR}/.env.production (owned by ${DEPLOY_USER}, chmod 600).
  2. Point the domain's DNS at this server.
  3. Run the "Release" workflow (or merge to main): it copies the deploy files here and starts the stack.
  4. As ${DEPLOY_USER}: cd ${APP_DIR} && ./deploy/server/tls.sh issue
EOF
