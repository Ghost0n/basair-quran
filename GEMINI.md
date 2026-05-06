# Project Memory

Follow the shared project instructions imported below.

Keep strict research mode Quran-only, keep Tafssir mode explicitly experimental,
and do not treat generated databases or local corpus files as source truth unless
the user explicitly asks to version local data.

When proposing a commit that will land on `main` and touches database generation
scripts or research source files, proactively include the appropriate deploy tag
(`[rebuild-db]` or `[rebuild-index]`) in the suggested commit message so the
production CI workflow triggers the right rebuild step automatically.

@./AGENTS.md
