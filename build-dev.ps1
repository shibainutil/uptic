# Builds and installs the DEV app (com.uptic.app.dev) from this folder's android/.
#
# android/ here is only ever the dev variant, so Gradle keeps its cache between builds:
# no --clean, and nothing is uninstalled (that would wipe the app's data). Prebuild runs
# without --clean and only rewrites what changed. JS-only changes need no build at all:
# the dev app hot-reloads them from Metro.
param([switch]$NoInstall)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$phone = '192.168.1.146:5555'

Set-Location $root
[Environment]::CurrentDirectory = $root

Write-Host '=== Prebuild (dev) ===' -ForegroundColor Yellow
$env:APP_VARIANT = 'development'
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Prebuild failed' }
Set-Content "$root\android\local.properties" "sdk.dir=C\:\\Users\\anton\\AppData\\Local\\Android\\Sdk"
# The project-root debug.keystore is the one registered in Firebase (Google Sign-In).
Copy-Item "$root\debug.keystore" "$root\android\app\debug.keystore" -Force

Write-Host '=== Gradle assembleDebug ===' -ForegroundColor Yellow
Push-Location "$root\android"
try { .\gradlew assembleDebug "-PreactNativeArchitectures=arm64-v8a" --console=plain }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }

$apk = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
$aapt = "$env:LOCALAPPDATA\Android\Sdk\build-tools\35.0.0\aapt2.exe"
$pkg = & $aapt dump packagename $apk
if ($pkg -ne 'com.uptic.app.dev') { throw "Wrong package $pkg, expected com.uptic.app.dev" }
Copy-Item $apk "$root\app-dev.apk" -Force
$env:APP_VARIANT = ''

if (-not $NoInstall) {
  Write-Host '=== Install on phone ===' -ForegroundColor Yellow
  & $adb connect $phone | Out-Null
  & $adb -s $phone install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
}
Write-Host 'Done: com.uptic.app.dev' -ForegroundColor Green
