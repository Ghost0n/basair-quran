# Project Memory

Follow the shared project instructions imported below.

Keep the research agent Quran-only: no tafsir, no corpus, no outside source in
any prompt or answer. Do not treat generated databases as source truth unless
the user explicitly asks to version local data.

When proposing a commit that will land on `main` and touches database generation
scripts or Quran source files, proactively include the appropriate deploy tag
(`[rebuild-db]`, `[rebuild-translations]`…) in the suggested commit message so the
production CI workflow triggers the right rebuild step automatically.

@./AGENTS.md
