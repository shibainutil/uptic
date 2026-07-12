$adb = 'C:\Users\anton\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$localProps = "sdk.dir=C\:\\Users\\anton\\AppData\\Local\\Android\\Sdk`n"
$projectDir = 'C:\Users\anton\Projects\uptic'
Set-Location $projectDir

# --- RELEASE build (com.uptic.app, no launcher icon, normal icon) ---
Write-Host '=== [1/4] Prebuild for RELEASE ===' -ForegroundColor Yellow
$env:APP_VARIANT = ''
npx expo prebuild --platform android --clean
if ($LASTEXITCODE -ne 0) { Write-Host 'Prebuild failed!' -ForegroundColor Red; Read-Host; exit 1 }
Set-Content 'android\local.properties' $localProps
# expo prebuild ships its own android/app/debug.keystore (SHA-1 5e8f1606...) which is
# registered NOWHERE in Firebase, causing Google Sign-In DEVELOPER_ERROR. Overwrite it
# with the global ~/.android/debug.keystore (SHA-1 90141c82...) which IS registered for
# com.uptic.app.dev. signingConfigs.debug/release both point at this file.
Copy-Item "$env:USERPROFILE\.android\debug.keystore" 'android\app\debug.keystore' -Force

Write-Host '=== [2/4] Build RELEASE APK ===' -ForegroundColor Yellow
Set-Location android; .\gradlew assembleRelease; Set-Location $projectDir
if ($LASTEXITCODE -ne 0) { Write-Host 'Release build failed!' -ForegroundColor Red; Read-Host; exit 1 }
Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' 'app-release.apk' -Force

# --- DEV build (com.uptic.app.dev, dev launcher + dev icon, expo-dev-client) ---
Write-Host '=== [3/4] Prebuild for DEV ===' -ForegroundColor Yellow
$env:APP_VARIANT = 'development'
npx expo prebuild --platform android --clean
if ($LASTEXITCODE -ne 0) { Write-Host 'Dev prebuild failed!' -ForegroundColor Red; Read-Host; exit 1 }
Set-Content 'android\local.properties' $localProps
# expo prebuild ships its own android/app/debug.keystore (SHA-1 5e8f1606...) which is
# registered NOWHERE in Firebase, causing Google Sign-In DEVELOPER_ERROR. Overwrite it
# with the global ~/.android/debug.keystore (SHA-1 90141c82...) which IS registered for
# com.uptic.app.dev. signingConfigs.debug/release both point at this file.
Copy-Item "$env:USERPROFILE\.android\debug.keystore" 'android\app\debug.keystore' -Force

Write-Host '=== [4/4] Build DEV APK ===' -ForegroundColor Yellow
Set-Location android; .\gradlew assembleDebug; Set-Location $projectDir
if ($LASTEXITCODE -ne 0) { Write-Host 'Dev build failed!' -ForegroundColor Red; Read-Host; exit 1 }
Copy-Item 'android\app\build\outputs\apk\debug\app-debug.apk' 'app-dev.apk' -Force

# Clear APP_VARIANT so any subsequent commands in this shell aren't affected
$env:APP_VARIANT = ''

# --- Install both (different package names = co-exist, never overwrite each other) ---
Write-Host '=== Installing both on phone ===' -ForegroundColor Yellow

& $adb shell am force-stop com.uptic.app 2>$null
& $adb install -r 'app-release.apk'
if ($LASTEXITCODE -ne 0) { Write-Host 'Release install failed!' -ForegroundColor Red; Read-Host; exit 1 }

& $adb shell am force-stop com.uptic.app.dev 2>$null
& $adb install -r 'app-dev.apk'
if ($LASTEXITCODE -ne 0) { Write-Host 'Dev install failed!' -ForegroundColor Red; Read-Host; exit 1 }

Write-Host ''
Write-Host '=== DONE ===' -ForegroundColor Green
Write-Host '  Release: com.uptic.app  (no launcher icon — launch via adb or deep link)' -ForegroundColor Cyan
Write-Host '  Dev:     com.uptic.app.dev  (launcher icon with dev icon, expo-dev-client)' -ForegroundColor Cyan
Read-Host 'Press Enter to close'
