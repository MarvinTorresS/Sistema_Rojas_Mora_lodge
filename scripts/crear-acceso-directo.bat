@echo off
REM ==========================================================================
REM  crear-acceso-directo.bat
REM  Un .bat no puede tener icono propio (Windows usa siempre el icono
REM  generico de script). La forma estandar de darle un logo es crear un
REM  ACCESO DIRECTO (.lnk) que apunte al .bat y que si admite icono (.ico).
REM  Este script crea ese acceso directo en el Escritorio. Se ejecuta una
REM  sola vez (o de nuevo si se mueve la carpeta del proyecto).
REM ==========================================================================
setlocal
set "SCRIPTS=%~dp0"
REM Raiz del repo = carpeta padre de scripts\
for %%I in ("%SCRIPTS%..") do set "ROOT=%%~fI"

REM Se usa el objeto COM WScript.Shell desde PowerShell porque cmd no tiene
REM un comando nativo para crear accesos directos. GetFolderPath('Desktop')
REM resuelve el Escritorio real aunque este redirigido a OneDrive.
powershell -NoProfile -Command ^
  "$desk=[Environment]::GetFolderPath('Desktop');" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($desk + '\Rojas Mora - Iniciar.lnk');" ^
  "$s.TargetPath='%ROOT%\iniciar-sistema.bat';" ^
  "$s.WorkingDirectory='%ROOT%';" ^
  "$s.IconLocation='%SCRIPTS%rojas-mora.ico,0';" ^
  "$s.Description='Inicia MySQL, backend y frontend de Rojas Mora Sports & Lodge';" ^
  "$s.Save()"

if errorlevel 1 (
    echo [ERROR] No se pudo crear el acceso directo.
) else (
    echo Acceso directo "Rojas Mora - Iniciar" creado en el Escritorio.
)
pause
