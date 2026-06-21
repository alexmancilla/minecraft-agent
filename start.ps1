# Lanzador de un solo comando: abre servidor MC + bot + cliente de voz,
# cada uno en su propia ventana de PowerShell.
#
# Uso:
#   .\start.ps1            -> lanza las tres piezas
#   .\start.ps1 -NoServer  -> si el servidor de Minecraft ya está corriendo
#
# (El cliente de voz reintenta la conexión solo, así que el orden no importa.)
param(
  [switch]$NoServer
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$server = Join-Path $root "mc-server"
$bot    = Join-Path $root "bot"
$voice  = Join-Path $root "voice"
$serverJar = Join-Path $server "versions\1.20.1\server-1.20.1.jar"
$venvPy = Join-Path $voice ".venv\Scripts\python.exe"

function Start-Win($title, $workdir, $command) {
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle='$title'; Set-Location '$workdir'; $command"
  )
}

if (-not $NoServer) {
  Write-Host "Lanzando servidor de Minecraft..." -ForegroundColor Cyan
  Start-Win "MC Server" $server "java -jar '$serverJar' nogui"
  Write-Host "Esperando 12s a que el servidor levante..." -ForegroundColor DarkGray
  Start-Sleep -Seconds 12
}

Write-Host "Lanzando el bot..." -ForegroundColor Cyan
Start-Win "Bot" $bot "node index.js"
Start-Sleep -Seconds 3

Write-Host "Lanzando el cliente de voz..." -ForegroundColor Cyan
Start-Win "Voz" $voice "& '$venvPy' voice_client.py"

Write-Host ""
Write-Host "Listo. Se abrieron 3 ventanas (Server / Bot / Voz)." -ForegroundColor Green
Write-Host "Entra a Minecraft como YeshuGrace -> localhost y habla cuando la ventana 'Voz' diga 'Escuchando'." -ForegroundColor Green
