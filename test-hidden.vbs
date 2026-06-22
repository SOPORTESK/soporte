Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Taller SK\Documents\PROYECTOS\Chat de Atención Sekunet"
WshShell.Run "cmd /c """"npm run dev > dev.log 2>&1""""" , 0, False
