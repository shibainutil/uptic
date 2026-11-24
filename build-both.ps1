# Builds and installs both apps, each from its own android/ folder (see build-dev.ps1 and
# build-release.ps1), so neither throws away the other's Gradle cache.
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\build-release.ps1"
& "$PSScriptRoot\build-dev.ps1"
