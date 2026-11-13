# AI connections

Status: in place (Q-Basair-72). Settings → «الذكاء الاصطناعي» (it left the study page).

## What the reader chooses

- **Basair's model** (default): the server's own (`QBASAIR_LLM_*`); nothing to enter.
- **Their own account** with a major provider: OpenRouter, OpenAI, Anthropic (Claude),
  Google Gemini, Mistral, DeepSeek, Groq, xAI (Grok), Ollama Cloud.

A provider needs only:

- **a sign-in** — OpenRouter (OAuth with PKCE: «الدخول بحساب OpenRouter»; the web for now), or
- **a key** — pasted once, with a link to the provider's key page;

then a **model**, chosen from the list the provider itself returns (the key is tested by that
list; a preferred model is preselected). **No address is ever asked**: each provider's address
is known on the server (`src/app/services/llm_providers.py`).

The key and the choice stay **on this device** (`apps/web/lib/ai-connection.ts`, local
storage); «نسيان المفتاح» removes a key. The study page's former Ollama key is carried over once.

## How a request goes

The study sends `X-QBasair-LLM-Provider`, `X-QBasair-LLM-Key`, `X-QBasair-LLM-Model`
(`POST /api/research-agent`, `GET /api/research-agent/settings`). The server:

- accepts only a provider of the registry (else `503`), with the reader's key only (never the
  server's key on a reader's provider) — a client can't point the server elsewhere;
- talks to that provider's fixed address: the OpenAI chat-completions dialect for all but
  Ollama Cloud (its own API); one client covers them and reuses every step of the research
  agent; a model that refuses a custom temperature is asked again without it;
- is used for chat only;
- answers from the Quran alone, whatever the provider: only the question, Quranic vocabulary
  and ayahs reach the model.

Without the provider header, the earlier behaviour holds (the server's model, or the older
`X-QBasair-Ollama-*` override headers).

## Routes

- `GET /api/ai/providers` → `AiProviderItem[]` `{id, name, key_url, signin, prefer}` — no addresses.
- `POST /api/ai/openrouter/key` `{code, code_verifier}` → `{key}` — OpenRouter's sign-in: the
  code it sent back to `/connect/openrouter`, exchanged at OpenRouter's fixed address; the key
  goes back to the reader's device, the server keeps nothing.

## Next

- Accounts on the platform: keys kept server-side, encrypted (AES-256-GCM), write-only
  (`docs/production-platform-plan.md`, AI connectors), and a demo allowance.
- OpenRouter's sign-in in the standalone app (its return needs the app's link).
- Illustrated per-provider guides in every interface language.
