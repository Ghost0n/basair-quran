# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately on GitHub: open the repository's **Security** tab and
choose **Report a vulnerability** (a private advisory only the maintainers
can see). Include what you found, how to reproduce it, and what an attacker
could do with it.

You will get an answer within a week. We will keep you informed while the fix
is prepared, publish an advisory once it is deployed, and credit you there
unless you prefer otherwise.

## Scope

- The code in this repository: the API (`src/`), the web app and the
  standalone mobile app (`apps/`), the shared packages (`packages/`), the
  deployment configuration (`deploy/`, `.github/workflows/`).
- The production service at basairquran.com, within reason: no denial of
  service, no automated scanning that degrades it for others, no access to
  other people's accounts or data beyond what proves the issue.

Problems in third-party services or data (translation and recitation sources,
the Quran data publishers listed in `NOTICE.md`) should be reported to them.

## Supported versions

Only the latest release — `main`, as deployed — receives security fixes.
