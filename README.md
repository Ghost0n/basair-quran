# CLA signatures

This branch holds the signatures of the Contributor License Agreement
([`CLA.md`](https://github.com/Ghost0n/basair-quran/blob/develop/CLA.md)).
The CLA workflow (`.github/workflows/cla.yml`) writes them to
`signatures/version1/cla.json` when a contributor signs by commenting on their
pull request. It is not code: never merge it, and keep it unprotected so the
workflow can write to it.
