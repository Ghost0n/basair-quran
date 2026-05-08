#!/bin/sh

set -eu

export QBASAIR_SERVER_NAME="${QBASAIR_PUBLIC_DOMAIN:-_}"
CONFIG_TEMPLATE="/opt/qbasair/http.conf.template"

if [ "${QBASAIR_ENABLE_TLS:-0}" = "1" ] && [ -n "${QBASAIR_PUBLIC_DOMAIN:-}" ]; then
    CERT_DIR="/etc/letsencrypt/live/${QBASAIR_PUBLIC_DOMAIN}"
    if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
        CONFIG_TEMPLATE="/opt/qbasair/tls.conf.template"
        echo "Q-Basair nginx: TLS certificate found, starting HTTPS config."
    else
        echo "Q-Basair nginx: TLS requested but certificate not found yet, starting temporary HTTP config."
    fi
else
    echo "Q-Basair nginx: starting HTTP config."
fi

envsubst '${QBASAIR_SERVER_NAME} ${QBASAIR_PUBLIC_DOMAIN}' < "${CONFIG_TEMPLATE}" > /etc/nginx/conf.d/default.conf

# Ensure the drop-in vhosts directory exists so the nginx.conf include does not error.
mkdir -p /srv/nginx-vhosts.d

exec nginx -g 'daemon off;'
