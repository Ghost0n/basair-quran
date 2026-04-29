$ErrorActionPreference = "Stop"

$pathEntries = $env:Path -split ";" | Where-Object { $_ }

$codexTempPath = $pathEntries |
    Where-Object { $_ -match "\\\.codex\\tmp\\arg0\\codex-arg0" } |
    Select-Object -First 1

if (-not $codexTempPath) {
    throw "Could not find the active Codex temp PATH entry (.codex\tmp\arg0\codex-arg0...). Restart Codex and try again."
}

$sourceNode = $pathEntries |
    ForEach-Object { Join-Path $_ "node.exe" } |
    Where-Object { (Test-Path $_ -PathType Leaf) -and ($_ -notmatch "\\WindowsApps\\") } |
    Select-Object -First 1

if (-not $sourceNode) {
    $sourceNode = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\node.exe"
}

if (-not (Test-Path $sourceNode -PathType Leaf)) {
    throw "Could not find a usable Codex node.exe. Expected one at $sourceNode."
}

$destinationNode = Join-Path $codexTempPath "node.exe"
Copy-Item -LiteralPath $sourceNode -Destination $destinationNode -Force

$version = & $destinationNode --version
Write-Host "Codex browser-use Node shim installed:"
Write-Host "  Source:      $sourceNode"
Write-Host "  Destination: $destinationNode"
Write-Host "  Version:     $version"

