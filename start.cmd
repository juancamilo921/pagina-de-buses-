@echo off
setlocal
cd /d "%~dp0"
echo.
echo Iniciando Transporte Conexion en http://localhost:3000
echo Presiona Ctrl+C para detener el servidor.
echo.
node src\server.js
endlocal
