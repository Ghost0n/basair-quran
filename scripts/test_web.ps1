$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime\node-v22.22.0-win-x64"
$nodePath = Join-Path $runtimeDir "node.exe"
$vitestEntrypoint = Join-Path $projectRoot "apps\web\node_modules\vitest\vitest.mjs"
$workdir = Join-Path $projectRoot "apps\web"

if (-not (Test-Path $nodePath)) {
    throw "Local Node runtime not found at $nodePath. Run the frontend runtime setup first."
}

if (-not (Test-Path $vitestEntrypoint)) {
    throw "Vitest not found at $vitestEntrypoint. Install frontend dependencies first (pnpm install)."
}

Push-Location $workdir
try {
    & $nodePath $vitestEntrypoint run
}
finally {
    Pop-Location
}
