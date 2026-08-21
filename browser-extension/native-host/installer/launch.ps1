# EO2Weave Native Host - Windows installer payload script.
# Runs inside a self-extracting package (IExpress SED) elevated-free.
# STATUS.md 8.2 (9): HKCU-only registration, per-user install.
#
# Layout expectations (files extracted next to this script):
#   cw-native-host.exe    - the native host binary
#   install-core.ps1      - the actual installer logic (parameterized)

$ErrorActionPreference = "Stop"

# Run the core installer from the same directory as this script.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$core = Join-Path $ScriptDir "install-core.ps1"
if (-not (Test-Path $core)) {
    # IExpress extracts to %TEMP%\IXP###.tmp - locate by script path.
    Write-Host "Error: install-core.ps1 not found next to the launcher." -ForegroundColor Red
    exit 1
}

# -ExecutionPolicy Bypass is applied by the launcher command line in the SED.
& powershell -NoProfile -ExecutionPolicy Bypass -File $core -SourceDir $ScriptDir
exit $LASTEXITCODE
