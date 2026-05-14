# Script para agregar GEMINI_API_KEY a .env.local
# Ejecutar: powershell -ExecutionPolicy Bypass -File scripts/add-gemini-key.ps1

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$geminiKey = "AIzaSyAHamKcfT-MrJfwiLFQF9z0r_efTW76-2k"

# Verificar si el archivo existe
if (-not (Test-Path $envFile)) {
    Write-Host "Creando archivo .env.local..." -ForegroundColor Yellow
    @"
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://kzcyxeracvfxynddyjld.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MzI3NzUsImV4cCI6MjA2MjIwODc3NX0.l4yhwNFARdJi97y2A09Y2RsaYLd6oLz3a2Z_aX-jfq0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYzMjc3NSwiZXhwIjoyMDYyMjA4Nzc1fQ.-s6WmB3Zyq69yNr-O1SrEkR_ryptl3-yPj3jBfPXZso

# URL del sitio
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# IA - Google Gemini
GEMINI_API_KEY=$geminiKey

"@ | Out-File -FilePath $envFile -Encoding UTF8
    Write-Host "Archivo .env.local creado con GEMINI_API_KEY configurada!" -ForegroundColor Green
} else {
    # Verificar si ya existe GEMINI_API_KEY
    $content = Get-Content $envFile -Raw
    if ($content -match "GEMINI_API_KEY") {
        # Reemplazar la línea existente
        $newContent = $content -replace "GEMINI_API_KEY=.*", "GEMINI_API_KEY=$geminiKey"
        $newContent | Out-File -FilePath $envFile -Encoding UTF8
        Write-Host "GEMINI_API_KEY actualizada en .env.local" -ForegroundColor Green
    } else {
        # Agregar al final
        Add-Content -Path $envFile -Value "`n# IA - Google Gemini`nGEMINI_API_KEY=$geminiKey"
        Write-Host "GEMINI_API_KEY agregada a .env.local" -ForegroundColor Green
    }
}

Write-Host "`nReinicia el servidor con: npm run dev" -ForegroundColor Cyan
