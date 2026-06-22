@echo off
title Chat Sekunet - Servidor Local
color 0A

echo =======================================================
echo Iniciando el Servidor del Chat Sekunet (Auto-Reinicio)
echo =======================================================

cd /d "C:\Users\Taller SK\Documents\PROYECTOS\Chat de Atención Sekunet"

:loop
echo.
echo [ %time% ] Iniciando Next.js en puerto 3100...
call npm run dev

echo.
color 0C
echo [ %time% ] ATENCION: El servidor se ha detenido o ha crasheado.
echo Reiniciando automaticamente en 5 segundos...
color 0A
timeout /t 5 >nul
goto loop
