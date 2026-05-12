# Generar APK desde PWA usando Bubblewrap
# Requiere: Node.js 16+, Java JDK 11+, Android SDK

Write-Host "Instalando Bubblewrap..." -ForegroundColor Cyan
npm install -g @bubblewrap/cli

Write-Host "Generando APK..." -ForegroundColor Green
bubblewrap build --manifest=../twa-manifest.json

Write-Host "APK generado en: ./app/build/outputs/apk/release/" -ForegroundColor Green
