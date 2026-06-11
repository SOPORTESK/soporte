' ============================================================
'  start-hidden.vbs
'  Lanza el watcher del servidor (run-server.ps1) de forma
'  totalmente oculta (sin ventana de consola).
'  Lo usa el acceso directo de la carpeta de Inicio de Windows.
' ============================================================

Dim fso, scriptDir, projectDir, wrapper, sh

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)
wrapper = scriptDir & "\run-server.ps1"

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projectDir

' 0 = ventana oculta, False = no esperar a que termine
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & wrapper & """", 0, False
