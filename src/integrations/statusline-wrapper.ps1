# Asesor de uso de IA - wrapper del statusline de Claude Code.
# 1) Vuelca el JSON de stdin (ctx %, rate limits, session_id) para el daemon.
# 2) Delega en el statusline original del usuario.
# 3) Anade la recomendacion vigente leida de current.json (degrada limpio).
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$stdin = [Console]::In.ReadToEnd()
$dataDir = Join-Path $env:LOCALAPPDATA 'ai-usage-advisor'
$sid = $null

try {
  $obj = $stdin | ConvertFrom-Json
  $sid = $obj.session_id
  if ($sid) {
    $snapDir = Join-Path $dataDir 'statusline'
    if (-not (Test-Path $snapDir)) { New-Item -ItemType Directory -Force -Path $snapDir | Out-Null }
    [System.IO.File]::WriteAllText((Join-Path $snapDir ($sid + '.json')), $stdin)
  }
} catch { }

$linea = ''
$orig = Join-Path $env:USERPROFILE '.claude\statusline-command.ps1'
if (Test-Path $orig) {
  try { $linea = ($stdin | powershell -NoProfile -ExecutionPolicy Bypass -File $orig | Out-String).TrimEnd() } catch { }
}

$sufijo = ''
try {
  $curPath = Join-Path $dataDir 'current.json'
  if ($sid -and (Test-Path $curPath)) {
    $cur = Get-Content $curPath -Raw | ConvertFrom-Json
    $edad = ([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($cur.updatedAt, [System.Globalization.CultureInfo]::InvariantCulture)).TotalSeconds
    if ($edad -ge 0 -and $edad -lt 120) {
      $s = $cur.sessions.$sid
      if ($s) {
        if ($s.difiere) {
          $conf = [math]::Round($s.confianza * 100)
          $esf = ''
          if ($s.recEsfuerzo) { $esf = '/' + $s.recEsfuerzo }
          $bombilla = [char]::ConvertFromUtf32(0x1F4A1)
          $sufijo = ' ' + $bombilla + $s.recModelo + $esf + ' ' + $conf + '%'
        } else {
          $sufijo = ' ' + [char]0x2713 + 'IA'
        }
      }
    }
  }
} catch { }

Write-Output ($linea + $sufijo)
