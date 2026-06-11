# ============================================================
#  run-server.ps1
#  Mantiene el servidor de Next.js (Soporte Sekunet) SIEMPRE
#  encendido en el puerto 3100. Si el proceso se cae por
#  cualquier motivo, lo reinicia automaticamente.
#
#  Este script esta pensado para ejecutarse desde la Tarea
#  Programada de Windows (ver install-autostart.ps1).
# ============================================================

$ErrorActionPreference = "Continue"

# Carpeta del proyecto = carpeta padre de /scripts
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

# Carpeta y archivo de logs
$logDir = Join-Path $projectDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "server.log"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

# Ruta directa al binario de Next (evita depender de npm en PATH)
$nextBin = Join-Path $projectDir "node_modules\next\dist\bin\next"

Write-Log "==================================================="
Write-Log "Watcher iniciado. Manteniendo el servidor en :3100"
Write-Log "Proyecto: $projectDir"

while ($true) {
    # Rotacion simple de logs (> 15 MB -> respaldar)
    try {
        if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 15MB)) {
            Move-Item -Path $logFile -Destination (Join-Path $logDir ("server-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")) -Force
        }
    } catch {}

    Write-Log "Iniciando servidor de produccion (next start -p 3100)..."

    try {
        if (Test-Path $nextBin) {
            & node $nextBin start -p 3100 *>> $logFile
        } else {
            # Fallback a npm si no se encuentra el binario de next
            & npm.cmd run start *>> $logFile
        }
    } catch {
        Write-Log ("Excepcion ejecutando el servidor: " + $_.Exception.Message)
    }

    Write-Log "El servidor se detuvo (exit). Reintentando en 5 segundos..."
    Start-Sleep -Seconds 5
}
