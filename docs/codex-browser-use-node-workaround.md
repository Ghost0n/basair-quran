# Codex browser-use Node workaround

This project has hit a Windows-specific Codex issue where the in-app browser
plugin cannot start its Node REPL.

## Symptom

`@browser-use` fails before it can control the in-app browser, and a direct
Node REPL probe returns:

```text
failed to execute Node: Access is denied. (os error 5)
```

In this state, `Get-Command node` may still show the usable Codex Node binary:

```text
C:\Users\<user>\AppData\Local\OpenAI\Codex\bin\node.exe
```

but the lower-level Windows resolver can still pick the packaged binary under
`C:\Program Files\WindowsApps\OpenAI.Codex_...\app\resources\node.exe`, which
is blocked with `Access is denied`.

## Temporary session fix

Run this once after opening a new Codex session if `@browser-use` or
`node_repl` fails with `Access is denied`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fix_codex_browser_node.ps1
```

The script copies the usable Codex `node.exe` into the active Codex temp PATH
folder:

```text
C:\Users\<user>\.codex\tmp\arg0\codex-arg0...\node.exe
```

That temp folder is first in the PATH for the current Codex session, so the
Node REPL can start without resolving to the blocked WindowsApps copy.

## Verification

After running the script, ask Codex to retry `@browser-use`, or run a Node REPL
probe from Codex:

```js
nodeRepl.write("ok")
```

Expected result:

```text
ok
```

If `@browser-use` then reports `net::ERR_CONNECTION_REFUSED` for
`http://localhost:3000`, the browser tooling is working and the app server is
not running. Start the web app separately:

```powershell
pnpm web:dev
```

## Notes

This is intentionally a temporary workaround. The `.codex\tmp\arg0\codex-arg0...`
folder changes between Codex sessions, so the script may need to be rerun after
restarting Codex.

Moving `C:\Users\<user>\AppData\Local\OpenAI\Codex\bin` above
`C:\Users\<user>\AppData\Local\Microsoft\WindowsApps` in the User PATH is still
useful, but on this machine it did not fully fix the lower-level resolver used
by the Node REPL. The temp shim is the reliable session-level fix.

