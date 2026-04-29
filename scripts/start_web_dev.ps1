$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime\node-v22.22.0-win-x64"
$nodePath = Join-Path $runtimeDir "node.exe"
$nextEntrypoint = Join-Path $projectRoot "apps\web\node_modules\next\dist\bin\next"
$workdir = Join-Path $projectRoot "apps\web"

if (-not (Test-Path $nodePath)) {
    throw "Local Node runtime not found at $nodePath. Run the frontend runtime setup first."
}

if (-not (Test-Path $nextEntrypoint)) {
    throw "Next.js entrypoint not found at $nextEntrypoint. Install frontend dependencies first."
}

Push-Location $workdir
try {
    & $nodePath $nextEntrypoint dev --hostname 127.0.0.1 --port 3000
}
finally {
    Pop-Location
}
