"""deploy/server/check-env.sh: the settings check deploy.sh and tls.sh run first.

Each case is a trap the first production release fell into: an editor's BOM,
Windows line ends, a copy of a local settings file (localhost, TLS off), and a
stray line. The check prints names and line numbers, never values.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "deploy" / "server" / "check-env.sh"

pytestmark = pytest.mark.skipif(
    os.name == "nt" or shutil.which("bash") is None,
    reason="a server script: bash and GNU tools, as on the VPS and in CI",
)

GOOD = """\
# Q-Basair production settings (docs/deployment.md).
COMPOSE_PROJECT_NAME=qbasair
QBASAIR_PUBLIC_DOMAIN=basair.example
QBASAIR_PUBLIC_URL=https://basair.example
QBASAIR_ENABLE_TLS=1
QBASAIR_CORS_ORIGINS=https://basair.example
QBASAIR_SESSION_SECRET=session-secret-value
QBASAIR_MAIL_FROM="بصائر <no-reply@basair.example>"

COMPOSE_PROFILES=keycloak
QBASAIR_AUTH_PROVIDER=keycloak
QBASAIR_AUTH_DOMAIN=auth.basair.example
QBASAIR_OIDC_ISSUER=https://auth.basair.example/realms/qbasair
QBASAIR_OIDC_CLIENT_SECRET=client-secret-value
KC_DB_PASSWORD=db-password-value
KC_BOOTSTRAP_ADMIN_PASSWORD=admin-password-value
KC_SMTP_FROM=noreply@basair.example
"""
SECRETS = ("session-secret-value", "client-secret-value", "db-password-value", "admin-password-value")


def check(tmp_path: Path, content: bytes | str) -> subprocess.CompletedProcess[str]:
    env_file = tmp_path / ".env.production"
    env_file.write_bytes(content.encode() if isinstance(content, str) else content)
    result = subprocess.run(["bash", str(SCRIPT), str(env_file)], capture_output=True, text=True, timeout=30)
    assert not any(secret in result.stdout + result.stderr for secret in SECRETS), "a value was printed"
    return result


def replace(text: str, **values: str) -> str:
    lines = text.splitlines()
    for key, value in values.items():
        lines = [f"{key}={value}" if line.startswith(f"{key}=") else line for line in lines]
    return "\n".join(lines) + "\n"


def test_a_production_file_passes(tmp_path):
    result = check(tmp_path, GOOD)
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""


def test_a_byte_order_mark_and_windows_line_ends_are_refused(tmp_path):
    bom = check(tmp_path, b"\xef\xbb\xbf" + GOOD.encode())
    assert bom.returncode == 1 and "byte order mark" in bom.stderr
    assert "not «NAME=value»" not in bom.stderr  # the BOM is the one problem named
    crlf = check(tmp_path, GOOD.replace("\n", "\r\n"))
    assert crlf.returncode == 1 and "CRLF" in crlf.stderr


def test_a_stray_line_is_named_by_its_number(tmp_path):
    result = check(tmp_path, "*" + GOOD)
    assert result.returncode == 1 and "line(s) 1 are not" in result.stderr


def test_a_local_copy_is_refused_before_anything_changes(tmp_path):
    local = replace(
        GOOD,
        QBASAIR_PUBLIC_DOMAIN="localhost",
        QBASAIR_PUBLIC_URL="http://127.0.0.2",
        QBASAIR_ENABLE_TLS="0",
        QBASAIR_CORS_ORIGINS="http://localhost",
        KC_SMTP_FROM="noreply@localhost",
    )
    result = check(tmp_path, local)
    assert result.returncode == 1
    for name in ("QBASAIR_PUBLIC_DOMAIN", "QBASAIR_PUBLIC_URL"):
        assert f"ERROR: {name}" in result.stderr
    for name in ("QBASAIR_ENABLE_TLS", "QBASAIR_CORS_ORIGINS", "KC_SMTP_FROM"):
        assert f"WARNING: {name}" in result.stderr


def test_tls_off_alone_only_warns(tmp_path):
    result = check(tmp_path, replace(GOOD, QBASAIR_ENABLE_TLS="0"))
    assert result.returncode == 0 and "WARNING: QBASAIR_ENABLE_TLS" in result.stderr


def test_keycloak_settings_are_checked_with_its_profile(tmp_path):
    result = check(tmp_path, replace(GOOD, KC_DB_PASSWORD="", QBASAIR_OIDC_ISSUER="https://auth.localhost/realms/qbasair"))
    assert result.returncode == 1
    assert "KC_DB_PASSWORD is empty" in result.stderr and "QBASAIR_OIDC_ISSUER must be" in result.stderr
    without_profile = replace(GOOD, COMPOSE_PROFILES="", KC_DB_PASSWORD="")
    assert check(tmp_path, without_profile).returncode == 0


def test_a_missing_file_is_refused(tmp_path):
    result = subprocess.run(["bash", str(SCRIPT), str(tmp_path / "absent")], capture_output=True, text=True, timeout=30)
    assert result.returncode == 1 and "is missing" in result.stderr
