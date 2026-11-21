"""The deploy's background data jobs run on the files the release copies to the
server (release.yml → "Copy the deploy files"), inside the API image.

The release doesn't copy src/, yet the offline pack build imports the app's code
(the reciters, the parity check). With PYTHONPATH=/repo alone it died on
`No module named 'src'` at every deploy, so /api/offline/manifest.json never
existed and the app found no translations to download.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / ".github" / "workflows" / "release.yml"
DEPLOY = ROOT / "deploy" / "server" / "deploy.sh"


def copied_paths() -> list[str]:
    """The pathspecs release.yml hands `git ls-files` before rsync."""
    text = RELEASE.read_text(encoding="utf-8")
    block = re.search(r"git ls-files -z -- (.*?)\|\s*rsync", text, re.S)
    assert block, "release.yml no longer copies the deploy files with git ls-files"
    return block.group(1).replace("\\", " ").split()


def job_pythonpath() -> list[str]:
    """PYTHONPATH of run_detached_on_files in deploy.sh (container paths)."""
    match = re.search(r"run_detached_on_files\(\) \{\n(.*?)\n\}", DEPLOY.read_text(encoding="utf-8"), re.S)
    assert match, "deploy.sh no longer defines run_detached_on_files"
    env = re.search(r"-e PYTHONPATH=(\S+)", match.group(1))
    assert env, "run_detached_on_files no longer sets PYTHONPATH"
    return env.group(1).split(":")


def test_the_release_does_not_copy_the_app_code():
    # If this changes, the image's /app is no longer needed on PYTHONPATH.
    assert "src" not in copied_paths()


def test_the_pack_build_finds_the_app_code_on_the_server(tmp_path):
    # The server's /srv/q-basair: only what the release copies (scripts/ is enough
    # for this import; data/ holds the generated databases).
    server = tmp_path / "srv"
    shutil.copytree(ROOT / "scripts", server / "scripts")
    assert not (server / "src").exists()
    # /repo is the copied files, /app is the image (src/ from the same commit).
    mapping = {"/repo": str(server), "/app": str(ROOT)}
    pythonpath = os.pathsep.join(mapping.get(entry, entry) for entry in job_pythonpath())
    probe = (
        "import sys; sys.path.insert(0, sys.argv[1]);"
        "from scripts.build_offline_packs import _reciters;"
        "packs = _reciters(); assert packs and all(p['kind'] == 'reciter' for p in packs); print(len(packs))"
    )
    done = subprocess.run(
        [sys.executable, "-c", probe, str(server)],
        cwd=server,
        env={**os.environ, "PYTHONPATH": pythonpath},
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0, done.stderr
    assert int(done.stdout.strip()) > 0
