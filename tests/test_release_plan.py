""".github/workflows/release.yml, step "What to deploy": the commit to deploy and the
data jobs its deploy tags ask for (AGENTS.md → Deploy tags).

The second production release had no deploy tag and stopped there: the job-list
check piped an empty string into grep, which then had no line to match.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "release.yml"
SHA = "3d889b74424c0673a2356e3a82013d25e4929ccc"

pytestmark = pytest.mark.skipif(
    os.name == "nt" or shutil.which("bash") is None,
    reason="a workflow step: bash, as on GitHub's runners",
)


def plan_script() -> str:
    """The step's `run: |` block, read as text (no YAML parser needed)."""
    lines = WORKFLOW.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == "- name: What to deploy")
    run = next(i for i in range(start, len(lines)) if lines[i].strip() == "run: |")
    body = []
    indent = None
    for line in lines[run + 1:]:
        if line.strip() and indent is None:
            indent = len(line) - len(line.lstrip())
        if line.strip() and len(line) - len(line.lstrip()) < indent:
            break
        body.append(line[indent:] if line.strip() else "")
    return "\n".join(body) + "\n"


def run_plan(tmp_path, *, message="", tag="", jobs=""):
    output = tmp_path / "output"
    summary = tmp_path / "summary"
    env = {
        "PATH": os.environ["PATH"],
        "GITHUB_SHA": SHA,
        "GITHUB_OUTPUT": str(output),
        "GITHUB_STEP_SUMMARY": str(summary),
        "INPUT_TAG": tag,
        "INPUT_JOBS": jobs,
        "COMMIT_MESSAGE": message,
    }
    done = subprocess.run(["bash", "-e", "-c", plan_script()], env=env, capture_output=True, text=True)
    values = dict(line.split("=", 1) for line in output.read_text().splitlines()) if output.exists() else {}
    return done, values


def test_a_commit_without_deploy_tags_deploys_the_images_only(tmp_path):
    done, values = run_plan(tmp_path, message="Merge pull request #37\n\n[develop-2] Relance la connexion")
    assert done.returncode == 0, done.stderr
    assert values == {"tag": SHA, "jobs": ""}


def test_deploy_tags_become_the_job_list(tmp_path):
    done, values = run_plan(tmp_path, message="[develop-1] Mise en production [rebuild-db] [prepare-recitations]")
    assert done.returncode == 0, done.stderr
    assert values == {"tag": SHA, "jobs": "rebuild-db,prepare-recitations"}


def test_a_manual_run_takes_its_inputs_and_refuses_bad_ones(tmp_path):
    done, values = run_plan(tmp_path, tag="b1cf1b1", jobs="rebuild-translations")
    assert done.returncode == 0 and values == {"tag": "b1cf1b1", "jobs": "rebuild-translations"}

    refused, _ = run_plan(tmp_path, tag="latest")
    assert refused.returncode != 0 and "Not a commit SHA" in refused.stderr
    injected, _ = run_plan(tmp_path, jobs="rebuild-db; rm -rf /")
    assert injected.returncode != 0 and "Bad job list" in injected.stderr
