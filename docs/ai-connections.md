# AI connections

Status: in place (Q-Basair-72). Settings → «الذكاء الاصطناعي» (it left the study page).

## What the reader chooses

- **Basair's model** (default): the server's own (`QBASAIR_LLM_*`); nothing to enter.
- **Their own account** with a major provider: OpenRouter, OpenAI, Anthropic (Claude),
  Google Gemini, Mistral, DeepSeek, Groq, xAI (Grok), Ollama Cloud.

A provider needs only:

- **a sign-in** — OpenRouter (OAuth with PKCE: «الدخول بحساب OpenRouter»; the web for now), or
- **a key** — pasted once, with a link to the provider's key page;

then a **model**, chosen among the **recommended** ones (`prefer` in `llm_providers.py`) that
the provider itself returns, plus the one already chosen — the whole list only when none of
them is there (`recommendedModels`; the key is tested by that list; the first recommended model
is preselected). **No address is ever asked**: each provider's address
is known on the server (`src/app/services/llm_providers.py`).

Where the key and the choice are kept (`apps/web/lib/ai-connection.ts`):

- **A guest**: on this device only (local storage).
- **A signed-in reader**: on their **account** too, so a key entered on one device is there on
  every other after sign-in (`features/shell/ai-connection-account-sync.tsx`). At sign-in the
  account's connection replaces the browser's, except when a change made here hasn't reached
  the account yet, or the account has none and the device has the guest's own: that one is carried
  into the account. Each change is saved to the account (`PUT /api/user/ai-connection`). At
  sign-out the connection **leaves the browser** (`lib/forget-account.ts`); a browser a session
  ended on forgets it at the next visit. `qb.ai.connection.owner` records whose connection the
  browser holds and whether a change is still on its way to the account.
- On the server (`src/app/services/ai_key_service.py`): one row per account in the app database
  (`ai_connections`), encrypted with Fernet (AES-128-CBC + HMAC-SHA256) under a key derived
  (HKDF-SHA256) from `QBASAIR_AI_KEYS_SECRET`, or from `QBASAIR_SESSION_SECRET` when that is unset.
  A row the current secret can't open reads as no connection (the reader enters the key again).
  Only providers the server knows are accepted; keys go back to their own account only, never
  cached (`Cache-Control: no-store`), and are deleted with the account.

«نسيان المفتاح» removes a key (on the account too). The study page's former Ollama key is carried
over once.

## In the chat

- Beside the send button (`apps/web/features/studio/ai-picker.tsx`): the connected provider's
  **model**, among the recommended ones it returns for the reader's key, saved per provider with
  the connection. There is no thinking choice: each model thinks as it does by default (a level
  saved by an earlier version is no longer sent). With Basair's model there is nothing to pick:
  «نموذج بصائر» opens Settings.
- One notice at most above the thread (`studio-notices.tsx`): a guest is asked to sign in or
  create an account (the usual sign-in page; set aside for the tab); a
  provider chosen without its key asks for it (it can't be set aside: the study fails without);
  Basair's model offers to connect a provider (set aside on this device).

The server still accepts `X-QBasair-LLM-Thinking` from older clients; how each provider is then
asked to think (`thinking_payload` in `llm_providers.py`):

| Provider | Levels | Sent as |
|---|---|---|
| OpenRouter | off · low · medium · high | `reasoning: {effort}` / `{enabled: false}` |
| OpenAI, Groq | low · medium · high | `reasoning_effort` |
| xAI | low · high | `reasoning_effort` |
| Gemini | off · low · medium · high | `reasoning_effort` (`none` for off) |
| Anthropic | off · low · medium · high | `thinking` budget 2k / 8k / 16k tokens (+ `max_tokens`) |
| Ollama Cloud | off · low · medium · high | `think`: the level for gpt-oss, `true`/`false` otherwise |
| Mistral, DeepSeek | — | the model decides (reasoning models by name) |

A model that refuses these fields (or a temperature while it thinks) is asked again without them.
Basair's own model ignores the level.

## Signing in instead of pasting a key

OpenRouter is the only provider wired for sign-in (`apps/web/lib/openrouter-signin.ts`). On the
web it opens in a small window over Settings, which stays put: the window hands the code back to
Settings and closes (if the browser cut the link between them, the window exchanges the code
itself and Settings picks the key up from local storage). The PKCE verifier is kept in local
storage, taken once. Popups blocked, or the standalone app: the page itself goes to OpenRouter
and comes back to Settings.

Others that could be wired:

- **Hugging Face** (Inference Providers, an OpenAI-compatible router): OAuth with the
  `inference-api` scope; needs a Hugging Face OAuth app registered for Basair.
- **GitHub Models**: a GitHub App user token with the `models:read` permission; needs a GitHub
  App registered for Basair.

OpenAI, Anthropic, Mistral, DeepSeek, Groq and xAI offer no sign-in that hands a third-party app
an API key; Google's would need a verified OAuth app for a sensitive scope.

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

- `GET /api/ai/providers` → `AiProviderItem[]` `{id, name, key_url, signin, prefer, thinking}` — no addresses.
- `POST /api/ai/openrouter/key` `{code, code_verifier}` → `{key}` — OpenRouter's sign-in: the
  code it sent back to `/connect/openrouter`, exchanged at OpenRouter's fixed address; the key
  goes back to the reader's device, the server keeps nothing (a signed-in reader's device then
  saves it to their account, below).
- `GET /api/user/ai-connection` → `AiConnectionState` `{provider, keys, models, updated_at}`
  (`updated_at` `0`: nothing saved) · `PUT` `AiConnectionUpdate` `{provider, keys, models}` →
  the saved state (`422`: unknown provider, key over 4096 or model over 200 characters) ·
  `DELETE` → `{deleted}`. Signed-in accounts only (`401` otherwise), `Cache-Control: no-store`.

## Next

- Write-only keys: the server would make the provider calls itself, so a key never comes back
  to the browser once saved (`docs/production-platform-plan.md`, AI connectors), and a demo
  allowance.
- OpenRouter's sign-in in the standalone app (its return needs the app's link).
- Illustrated per-provider guides in every interface language.
