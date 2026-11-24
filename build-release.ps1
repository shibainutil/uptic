# Builds and installs the RELEASE app (com.uptic.app) from its own folder, the git worktree
# ..\uptic-release, so its android/ keeps a release-only Gradle cache and the dev android/
# here is never touched. It builds the latest COMMIT on master (uncommitted changes are not
# included). Nothing is uninstalled (that would wipe the app's data).
param([switch]$NoInstall)

$ErrorActionPreference = 'Stop'
$main = $PSScriptRoot
$rel = Join-Path (Split-Path $main -Parent) 'uptic-release'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$phone = '192.168.1.146:5555'

# One-time setup: the worktree, a link to node_modules, and the untracked local files.
if (-not (Test-Path $rel)) {
  Write-Host '=== Creating release worktree ===' -ForegroundColor Yellow
  git -C $main worktree add --detach $rel master
  if ($LASTEXITCODE -ne 0) { throw 'git worktree add failed' }
}
if (-not (Test-Path "$rel\node_modules")) {
  cmd /c mklink /J "$rel\node_modules" "$main\node_modules" | Out-Null
}
foreach ($f in '.env.local', 'debug.keystore', 'credentials.json') {
  if (Test-Path "$main\$f") { Copy-Item "$main\$f" "$rel\$f" -Force }
}

if (git -C $main status --porcelain --untracked-files=no) {
  Write-Host 'Note: uncommitted changes in the main folder are NOT part of this build.' -ForegroundColor DarkYellow
}

Write-Host '=== Updating release worktree to master ===' -ForegroundColor Yellow
git -C $rel checkout --detach master
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed' }
git -C $rel log --oneline -1

Set-Location $rel
[Environment]::CurrentDirectory = $rel

Write-Host '=== Prebuild (release) ===' -ForegroundColor Yellow
Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Prebuild failed' }
Set-Content "$rel\android\local.properties" "sdk.dir=C\:\\Users\\anton\\AppData\\Local\\Android\\Sdk"
# The project-root debug.keystore is the one registered in Firebase (Google Sign-In).
Copy-Item "$rel\debug.keystore" "$rel\android\app\debug.keystore" -Force

Write-Host '=== Gradle assembleRelease ===' -ForegroundColor Yellow
Push-Location "$rel\android"
try { .\gradlew assembleRelease "-PreactNativeArchitectures=arm64-v8a" --console=plain }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }

$apk = "$rel\android\app\build\outputs\apk\release\app-release.apk"
$aapt = "$env:LOCALAPPDATA\Android\Sdk\build-tools\35.0.0\aapt2.exe"
$pkg = & $aapt dump packagename $apk
if ($pkg -ne 'com.uptic.app') { throw "Wrong package $pkg, expected com.uptic.app" }
Copy-Item $apk "$main\app-release.apk" -Force

Set-Location $main
[Environment]::CurrentDirectory = $main

if (-not $NoInstall) {
  Write-Host '=== Install on phone ===' -ForegroundColor Yellow
  & $adb connect $phone | Out-Null
  & $adb -s $phone install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
}
Write-Host 'Done: com.uptic.app' -ForegroundColor Green
