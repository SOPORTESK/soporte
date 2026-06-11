# ============================================================
#  install-autostart.ps1
#  Crea (o elimina) un acceso directo en la carpeta de Inicio
#  de Windows que arranca el servidor de Soporte Sekunet al
#  INICIAR SESION, de forma oculta. El watcher (run-server.ps1)
#  reinicia el servidor automaticamente si se cae.
#
#  USO:
#    Instalar:    powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#    Desinstalar: powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Uninstall
#
#  100% nativo de Windows. NO requiere PM2, NO requiere admin.
# ============================================================

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$projectDir   = Split-Path -Parent $PSScriptRoot
$vbsLauncher  = Join-Path $projectDir "scripts\start-hidden.vbs"
$startupDir   = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir "SoporteSekunet-Server.lnk"

if ($Uninstall) {
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force
        Write-Host "Acceso directo de inicio eliminado." -ForegroundColor Yellow
    } else {
        Write-Host "No existe el acceso directo de inicio." -ForegroundColor Yellow
    }
    return
}

if (-not (Test-Path $vbsLauncher)) {
    throw "No se encontro el lanzador: $vbsLauncher"
}

# Crear el acceso directo en la carpeta de Inicio que ejecuta el lanzador VBS
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath       = "wscript.exe"
$sc.Arguments        = "`"$vbsLauncher`""
$sc.WorkingDirectory = $projectDir
$sc.WindowStyle      = 7   # minimizado / oculto
$sc.Description       = "Mantiene el servidor de Soporte Sekunet (Next.js :3100) siempre encendido."
$sc.Save()

Write-Host "Acceso directo creado en la carpeta de Inicio:" -ForegroundColor Green
Write-Host "  $shortcutPath"
Write-Host ""
Write-Host "El servidor arrancara automaticamente cada vez que inicies sesion en Windows," -ForegroundColor Green
Write-Host "y se reiniciara solo si llega a caerse." -ForegroundColor Green
Write-Host ""
Write-Host "Para arrancarlo AHORA mismo sin reiniciar:" -ForegroundColor Cyan
Write-Host "  wscript `"$vbsLauncher`""
