$env:APP_VARIANT = "development"
Write-Host "APP_VARIANT is: $env:APP_VARIANT" -ForegroundColor Yellow

Set-Location "C:\Users\anton\Projects\uptic"
npx expo prebuild --platform android

Set-Content "C:\Users\anton\Projects\uptic\android\local.properties" "sdk.dir=C\:\\Users\\anton\\AppData\\Local\\Android\\Sdk"
Copy-Item "C:\Users\anton\Projects\uptic\debug.keystore" "C:\Users\anton\Projects\uptic\android\app\debug.keystore" -Force
Write-Host "Restored debug.keystore (SHA-1 preserved)" -ForegroundColor Yellow

Set-Location "C:\Users\anton\Projects\uptic\android"
.\gradlew assembleDebug "-PreactNativeArchitectures=arm64-v8a"

$apk = "C:\Users\anton\Projects\uptic\android\app\build\outputs\apk\debug\app-debug.apk"
$aapt = "C:\Users\anton\AppData\Local\Android\Sdk\build-tools\35.0.0\aapt2.exe"
$pkg = & $aapt dump packagename $apk
Write-Host "Built package ID: $pkg" -ForegroundColor Yellow

if ($pkg -ne "com.uptic.app.dev") {
    Write-Host "ERROR: Wrong package ID! Expected com.uptic.app.dev but got $pkg. NOT installing." -ForegroundColor Red
    exit 1
}

Copy-Item $apk "C:\Users\anton\Projects\uptic\app-dev.apk" -Force

$adb = "C:\Users\anton\AppData\Local\Android\Sdk\platform-tools\adb.exe"
Write-Host "Installing dev APK..." -ForegroundColor Cyan
& $adb uninstall com.uptic.app.dev
& $adb install "C:\Users\anton\Projects\uptic\app-dev.apk"
Write-Host "Install exit code: $LASTEXITCODE" -ForegroundColor Green
