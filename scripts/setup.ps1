# Instalacion del Asesor de uso de IA.
# Uso:  npm run setup            (solo dependencias)
#       scripts\setup.ps1 -Statusline -Autostart -Hook   (ademas, integraciones)
param(
  [switch]$Statusline,
  [switch]$Hook,
  [switch]$Autostart
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

Write-Host '== Instalando dependencias ==' -ForegroundColor Cyan
npm install

if ($Statusline) { node src/integrations/installer.js statusline instalar }
if ($Hook)       { node src/integrations/installer.js hook instalar }
if ($Autostart)  { node src/integrations/installer.js autostart instalar }

Write-Host ''
Write-Host 'Listo. Arranca con:  npm start   y abre http://localhost:4977' -ForegroundColor Green
Write-Host 'Integraciones instalables tambien desde el dashboard (seccion Integraciones).'
