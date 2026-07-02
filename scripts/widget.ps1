# Widget flotante del Asesor de uso de IA.
# Ventana WPF siempre visible que muestra la recomendacion vigente leyendo
# %LOCALAPPDATA%\ai-usage-advisor\current.json (lo escribe el daemon).
# Arrastrable; doble clic abre el dashboard; X cierra. Sin dependencias.

$ErrorActionPreference = 'SilentlyContinue'

# Instancia unica
$creado = $false
$mutex = New-Object System.Threading.Mutex($true, 'AiUsageAdvisorWidget', [ref]$creado)
if (-not $creado) {
  $adquirido = $false
  try { $adquirido = $mutex.WaitOne(300) } catch { $adquirido = $true } # AbandonedMutex = instancia anterior muerta
  if (-not $adquirido) { exit }
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$dataDir = Join-Path $env:LOCALAPPDATA 'ai-usage-advisor'
$curPath = Join-Path $dataDir 'current.json'
$posPath = Join-Path $dataDir 'widget-pos.json'
$puerto = 4977
try {
  $cfg = Get-Content (Join-Path $dataDir 'config.json') -Raw | ConvertFrom-Json
  if ($cfg.puerto) { $puerto = [int]$cfg.puerto }
} catch { }

$coloresModelo = @{
  haiku  = '#34D399'; sonnet = '#60A5FA'; opus = '#A78BFA'; fable = '#FBBF24'
}
$nombresModelo = @{
  haiku = 'Haiku 4.5'; sonnet = 'Sonnet 5'; opus = 'Opus 4.8'; fable = 'Fable 5'
}

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Asesor IA" Width="320" SizeToContent="Height"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize">
  <Border CornerRadius="14" Background="#F0171A23" BorderBrush="#30FFFFFF" BorderThickness="1" Padding="16,12,16,12">
    <Border.Effect>
      <DropShadowEffect BlurRadius="18" ShadowDepth="2" Opacity="0.55"/>
    </Border.Effect>
    <StackPanel>
      <DockPanel Margin="0,0,0,8">
        <TextBlock Text="ASESOR IA" FontFamily="Segoe UI" FontSize="10" FontWeight="Bold"
                   Foreground="#8B93A7" VerticalAlignment="Center">
          <TextBlock.Style><Style TargetType="TextBlock"/></TextBlock.Style>
        </TextBlock>
        <TextBlock x:Name="Punto" Text="  " FontSize="10" VerticalAlignment="Center" Foreground="#34D399"/>
        <Button x:Name="Cerrar" DockPanel.Dock="Right" HorizontalAlignment="Right" Content="✕"
                FontSize="11" Width="22" Height="22" Foreground="#8B93A7"
                Background="Transparent" BorderThickness="0" Cursor="Hand"/>
      </DockPanel>
      <StackPanel Orientation="Horizontal">
        <Border x:Name="Badge" CornerRadius="7" Background="#60A5FA" Padding="10,3,10,4" VerticalAlignment="Center">
          <TextBlock x:Name="Modelo" Text="—" FontFamily="Segoe UI" FontSize="17" FontWeight="Bold" Foreground="#10121A"/>
        </Border>
        <TextBlock x:Name="Esfuerzo" Text="" FontFamily="Segoe UI" FontSize="13" FontWeight="SemiBold"
                   Foreground="#E6E9F0" VerticalAlignment="Center" Margin="9,0,0,0"/>
        <TextBlock x:Name="Conf" Text="" FontFamily="Segoe UI" FontSize="12"
                   Foreground="#8B93A7" VerticalAlignment="Center" Margin="9,0,0,0"/>
      </StackPanel>
      <TextBlock x:Name="Tarea" Text="Esperando al daemon…" FontFamily="Segoe UI" FontSize="12"
                 Foreground="#8B93A7" Margin="0,7,0,0" TextWrapping="Wrap"/>
      <TextBlock x:Name="Aviso" Text="" FontFamily="Segoe UI" FontSize="12" FontWeight="SemiBold"
                 Foreground="#F87171" Margin="0,4,0,0" TextWrapping="Wrap" Visibility="Collapsed"/>
      <TextBlock x:Name="Consejo" Text="" FontFamily="Segoe UI" FontSize="11"
                 Foreground="#FBBF24" Margin="0,4,0,0" TextWrapping="Wrap" Visibility="Collapsed"/>
      <DockPanel Margin="0,9,0,0">
        <Button x:Name="Probar" DockPanel.Dock="Right" Content="Probar" FontSize="11" Padding="9,3"
                Margin="6,0,0,0" Background="#7C6CF0" Foreground="White" BorderThickness="0" Cursor="Hand"/>
        <TextBox x:Name="Entrada" FontFamily="Segoe UI" FontSize="11" Padding="5,4"
                 Background="#10121A" Foreground="#E6E9F0" BorderBrush="#30FFFFFF" BorderThickness="1"
                 CaretBrush="#E6E9F0" ToolTip="Escribe un prompt y pruébalo ANTES de enviarlo a Claude"/>
      </DockPanel>
      <TextBlock x:Name="Resultado" Text="" FontFamily="Segoe UI" FontSize="12" FontWeight="SemiBold"
                 Margin="0,5,0,0" TextWrapping="Wrap" Visibility="Collapsed"/>
      <TextBlock x:Name="Pie" Text="" FontFamily="Segoe UI" FontSize="10"
                 Foreground="#5C6478" Margin="0,8,0,0"/>
    </StackPanel>
  </Border>
</Window>
'@

$win = [Windows.Markup.XamlReader]::Parse($xaml)
$ui = @{}
foreach ($n in 'Punto','Cerrar','Badge','Modelo','Esfuerzo','Conf','Tarea','Aviso','Consejo','Pie','Probar','Entrada','Resultado') {
  $ui[$n] = $win.FindName($n)
}

function ColorDe([string]$hex) {
  (New-Object Windows.Media.BrushConverter).ConvertFromString($hex)
}

function Set-Estado([bool]$vivo, [string]$textoPie) {
  $ui.Punto.Foreground = ColorDe $(if ($vivo) { '#34D399' } else { '#F87171' })
  $ui.Punto.Text = [char]0x25CF
  $ui.Pie.Text = $textoPie
}

function Actualizar {
  $cur = $null
  try { $cur = Get-Content $curPath -Raw | ConvertFrom-Json } catch { }
  if (-not $cur) {
    Set-Estado $false 'daemon apagado — arranca con: npm start'
    $ui.Tarea.Text = 'Sin datos. El asesor no está en marcha.'
    return
  }
  $vivo = $false
  try { if ($cur.daemon.pid) { $vivo = [bool](Get-Process -Id $cur.daemon.pid -ErrorAction Stop) } } catch { }
  $ses = $cur.sessions.PSObject.Properties | ForEach-Object { $_.Value } |
    Sort-Object -Property updatedAt -Descending | Select-Object -First 1
  $hora = ''
  try { $hora = ([DateTimeOffset]::Parse($cur.updatedAt, [System.Globalization.CultureInfo]::InvariantCulture)).ToLocalTime().ToString('HH:mm:ss') } catch { }
  Set-Estado $vivo $(if ($vivo) { "en vivo - $hora - doble clic: dashboard" } else { 'daemon apagado' })

  if (-not $ses) {
    $ui.Tarea.Text = 'Esperando el primer prompt en Claude Code…'
    $ui.Aviso.Visibility = 'Collapsed'
    $ui.Consejo.Visibility = 'Collapsed'
    return
  }
  $m = [string]$ses.recModelo
  $ui.Modelo.Text = if ($nombresModelo[$m]) { $nombresModelo[$m] } else { $m }
  $ui.Badge.Background = ColorDe $(if ($coloresModelo[$m]) { $coloresModelo[$m] } else { '#8B93A7' })
  $ui.Esfuerzo.Text = if ($ses.recEsfuerzo) { '/' + $ses.recEsfuerzo } else { '' }
  $ui.Conf.Text = [string][math]::Round($ses.confianza * 100) + '%'
  $nombre = if ($ses.nombre) { ' - ' + $ses.nombre } else { '' }
  $ui.Tarea.Text = [string]$ses.razonCorta + $nombre
  if ($ses.difiere -and $ses.modeloActual) {
    $actual = if ($nombresModelo[[string]$ses.modeloActual]) { $nombresModelo[[string]$ses.modeloActual] } else { $ses.modeloActual }
    $ui.Aviso.Text = [char]0x26A0 + " Estás usando $actual"
    $ui.Aviso.Visibility = 'Visible'
  } else {
    $ui.Aviso.Visibility = 'Collapsed'
  }
  $cons = @($ses.consejos) -join ' · '
  if ($cons) {
    $ui.Consejo.Text = [char]::ConvertFromUtf32(0x1F4A1) + ' ' + $cons
    $ui.Consejo.Visibility = 'Visible'
  } else {
    $ui.Consejo.Visibility = 'Collapsed'
  }
}

function ProbarPrompt {
  $t = $ui.Entrada.Text.Trim()
  if (-not $t) { return }
  try {
    $body = [System.Text.Encoding]::UTF8.GetBytes((@{ prompt = $t } | ConvertTo-Json -Compress))
    $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$puerto/api/hook/prompt" `
      -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 4
    $m = [string]$r.rec.modelo
    $nom = if ($nombresModelo[$m]) { $nombresModelo[$m] } else { $m }
    $esf = if ($r.rec.esfuerzo) { '/' + $r.rec.esfuerzo } else { '' }
    $pct = [math]::Round($r.rec.confianza * 100)
    $ui.Resultado.Text = [char]0x2192 + " $nom$esf " + [char]0x00B7 + " $pct% " + [char]0x00B7 + " $($r.rec.tipoTarea)   (/model $m)"
    $ui.Resultado.Foreground = ColorDe $(if ($coloresModelo[$m]) { $coloresModelo[$m] } else { '#E6E9F0' })
  } catch {
    $ui.Resultado.Text = 'El daemon no responde'
    $ui.Resultado.Foreground = ColorDe '#F87171'
  }
  $ui.Resultado.Visibility = 'Visible'
}

# Posicion: recordada, o esquina inferior derecha
$colocado = $false
try {
  $pos = Get-Content $posPath -Raw | ConvertFrom-Json
  if ($pos.left -ne $null) { $win.Left = [double]$pos.left; $win.Top = [double]$pos.top; $colocado = $true }
} catch { }
$win.Add_Loaded({
  if (-not $script:colocado) {
    $area = [System.Windows.SystemParameters]::WorkArea
    $win.Left = $area.Right - $win.ActualWidth - 24
    $win.Top = $area.Bottom - $win.ActualHeight - 24
  }
  Actualizar
})

$win.Add_MouseLeftButtonDown({ try { $win.DragMove() } catch { } })
$win.Add_MouseDoubleClick({ Start-Process "http://localhost:$puerto" })
$ui.Cerrar.Add_Click({ $win.Close() })
$ui.Probar.Add_Click({ ProbarPrompt })
$ui.Entrada.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { ProbarPrompt } })
$win.Add_Closing({
  try { @{ left = $win.Left; top = $win.Top } | ConvertTo-Json | Set-Content $posPath } catch { }
})

$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(1500)
$timer.Add_Tick({ Actualizar })
$timer.Start()

$null = $win.ShowDialog()
$mutex.ReleaseMutex()
