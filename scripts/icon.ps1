# Baut build\icon.ico aus docs\bilder\logo.png – mehrere Größen, als PNG
# eingebettet (geht seit Windows Vista). So muss electron-builder das Symbol
# nicht selbst umwandeln.
#   powershell -ExecutionPolicy Bypass -File scripts\icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$wurzel = Split-Path -Parent $PSScriptRoot
$quelle = Join-Path $wurzel 'docs\bilder\logo.png'
$ziel = Join-Path $wurzel 'build\icon.ico'
$groessen = @(256, 128, 64, 48, 32, 24, 16)

$original = [System.Drawing.Image]::FromFile($quelle)
$bilder = @()
foreach ($g in $groessen) {
  $bmp = New-Object System.Drawing.Bitmap $g, $g, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gr = [System.Drawing.Graphics]::FromImage($bmp)
  $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gr.DrawImage($original, 0, 0, $g, $g)
  $gr.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $bilder += , @($g, $ms.ToArray())
}
$original.Dispose()

$fs = [System.IO.File]::Create($ziel)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$bilder.Count)
$versatz = 6 + 16 * $bilder.Count
foreach ($b in $bilder) {
  $g = $b[0]; $daten = $b[1]
  $seite = if ($g -ge 256) { 0 } else { $g }
  $w.Write([byte]$seite); $w.Write([byte]$seite); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$daten.Length); $w.Write([uint32]$versatz)
  $versatz += $daten.Length
}
foreach ($b in $bilder) { $w.Write([byte[]]$b[1]) }
$w.Close()
"icon.ico: $((Get-Item $ziel).Length) Bytes, $($bilder.Count) Größen"
