Set-Location "C:\Users\anton\Projects\uptic"
Write-Host "Running release prebuild (no APP_VARIANT)..." -ForegroundColor Yellow
npx expo prebuild --platform android

Set-Content "C:\Users\anton\Projects\uptic\android\local.properties" "sdk.dir=C\:\\Users\\anton\\AppData\\Local\\Android\\Sdk"
Copy-Item "C:\Users\anton\Projects\uptic\debug.keystore" "C:\Users\anton\Projects\uptic\android\app\debug.keystore" -Force
Write-Host "Restored debug.keystore (SHA-1 preserved)" -ForegroundColor Yellow

Set-Location "C:\Users\anton\Projects\uptic\android"
.\gradlew assembleRelease "-PreactNativeArchitectures=arm64-v8a"

$apk = "C:\Users\anton\Projects\uptic\android\app\build\outputs\apk\release\app-release.apk"
$aapt = "C:\Users\anton\AppData\Local\Android\Sdk\build-tools\35.0.0\aapt2.exe"
$pkg = & $aapt dump packagename $apk
Write-Host "Built package ID: $pkg" -ForegroundColor Yellow

if ($pkg -ne "com.uptic.app") {
    Write-Host "ERROR: Wrong package ID! Expected com.uptic.app but got $pkg. NOT installing." -ForegroundColor Red
    exit 1
}

Copy-Item $apk "C:\Users\anton\Projects\uptic\app-release.apk" -Force
$adb = "C:\Users\anton\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb uninstall com.uptic.app
& $adb install $apk
Write-Host "Done! Exit: $LASTEXITCODE" -ForegroundColor Green
