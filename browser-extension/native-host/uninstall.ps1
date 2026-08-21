# Uninstall script for CreatorWeave Native Host (Windows)
# Removes everything install.ps1 created: registry keys, manifest, copied exe.

$ErrorActionPreference = "Continue"

$HostName = "com.creatorweave.nativehost"
$InstallDir = Join-Path $env:LOCALAPPDATA "CreatorWeave\NativeMessagingHosts"

# Registry keys
foreach ($Key in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)) {
    if (Test-Path $Key) {
        Remove-Item $Key -Recurse -Force
        Write-Host "Removed registry key: $Key"
    }
}

# Manifest + copied exe
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "Removed install dir: $InstallDir"
} else {
    Write-Host "Install dir not found (already removed?): $InstallDir"
}

# User data (scopes / execpolicy / process registry) is LEFT in place.
# To wipe it too, uncomment:
# Remove-Item -Recurse -Force (Join-Path $env:USERPROFILE ".creatorweave")

Write-Host ""
Write-Host "Done! Fully restart Chrome for changes to take effect." -ForegroundColor Green
