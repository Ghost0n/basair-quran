"""deploy/server/deploy.sh, wait_ready: the release is live once /api/ready, asked
through nginx as a visitor would, reports its commit.

The third production release fell into this: TLS was on, but the check picked
HTTPS only if it could see letsencrypt/live/<domain>/fullchain.pem, which certbot
keeps root-only. The deploy user asked over plain HTTP, got nginx's 301, and the
release was rolled back although it was healthy.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy" / "server" / "deploy.sh"
TAG = "a0e001a81893476e943dedc3ed0ae4cfd86cb2f1"
READY = '{"status":"ready","db":true,"commit":"%s"}' % TAG
REDIRECT = "<html><head><title>301 Moved Permanently</title></head></html>"

pytestmark = pytest.mark.skipif(
    os.name == "nt" or shutil.which("bash") is None,
    reason="a server script: bash, as on the VPS and in CI",
)


def function(name: str) -> str:
    """One function of deploy.sh, as written there (the script itself runs a deploy)."""
    lines = DEPLOY.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(f"{name}() {{"))
    if lines[start].rstrip().endswith("}"):
        return lines[start] + "\n"
    end = next(i for i in range(start, len(lines)) if lines[i] == "}")
    return "\n".join(lines[start:end + 1]) + "\n"


def wait_ready(tmp_path, *, https: str | None, http: str, domain="basair.example") -> subprocess.CompletedProcess:
    """Run wait_ready with a stand-in curl: `https` is nginx's HTTPS answer (None: refused)."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    curl = bin_dir / "curl"
    https_branch = f"printf '%s' '{https}'; exit 0" if https is not None else "exit 7"
    curl.write_text(
        "#!/bin/bash\n"
        'echo "$*" >> "$CURL_LOG"\n'
        'case "$*" in\n'
        f"  *https://*) {https_branch} ;;\n"
        f"  *) printf '%s' '{http}' ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    curl.chmod(0o755)
    env_file = tmp_path / ".env.production"
    env_file.write_text(f"QBASAIR_PUBLIC_DOMAIN={domain}\n", encoding="utf-8")
    script = (
        f"ENV_FILE='{env_file}'\nREADY_TIMEOUT=1\n"
        "log() { echo \"$*\"; }\nsleep() { :; }\n"
        + function("env_value") + function("env_bare") + function("wait_ready")
        + f"wait_ready {TAG}\n"
    )
    env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "CURL_LOG": str(tmp_path / "curl.log")}
    return subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True, cwd=tmp_path)


def test_with_tls_on_it_asks_over_https_without_reading_the_certificate(tmp_path):
    # No letsencrypt/ in sight (root-only on the server), and plain HTTP only redirects.
    done = wait_ready(tmp_path, https=READY, http=REDIRECT)
    assert done.returncode == 0, done.stdout + done.stderr
    calls = (tmp_path / "curl.log").read_text()
    assert "--resolve basair.example:443:127.0.0.1 https://basair.example/api/ready" in calls


def test_before_tls_it_asks_over_plain_http(tmp_path):
    done = wait_ready(tmp_path, https=None, http=READY)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "Host: basair.example http://127.0.0.1/api/ready" in (tmp_path / "curl.log").read_text()


def test_another_commit_or_a_redirect_is_not_ready(tmp_path):
    older = READY.replace(TAG, "b1cf1b1aebea18e7dc5e49bbb489288e28f47a44")
    done = wait_ready(tmp_path, https=older, http=REDIRECT)
    assert done.returncode == 1 and "last /api/ready answer" in done.stdout
    other = tmp_path / "other"
    other.mkdir()
    redirected = wait_ready(other, https=None, http=REDIRECT)
    assert redirected.returncode == 1 and "301 Moved Permanently" in redirected.stdout
