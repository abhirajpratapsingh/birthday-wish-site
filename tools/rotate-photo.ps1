# Ghoomi hui photo ko seedha karta hai (phone ki side wali photos ke liye).
#
# Usage (PowerShell, project folder se):
#   powershell -ExecutionPolicy Bypass -File tools\rotate-photo.ps1 <photo> <left|right|flip> [output]
#
#   left  = 90 degree ulta ghumao (anticlockwise)  -> jab sir RIGHT ki taraf ho
#   right = 90 degree seedha ghumao (clockwise)     -> jab sir LEFT ki taraf ho
#   flip  = 180 degree                              -> jab photo ulti ho
#
# Example:
#   powershell -ExecutionPolicy Bypass -File tools\rotate-photo.ps1 private\images\wall\13.jpg left
param(
  [Parameter(Mandatory = $true)][string]$Photo,
  [Parameter(Mandatory = $true)][ValidateSet('left', 'right', 'flip')][string]$Direction,
  [string]$Output = $Photo
)
Add-Type -AssemblyName System.Drawing
$full = (Resolve-Path $Photo).Path
$bytes = [System.IO.File]::ReadAllBytes($full)            # read into memory so the same file can be overwritten
$stream = New-Object System.IO.MemoryStream(, $bytes)
$img = [System.Drawing.Image]::FromStream($stream)
switch ($Direction) {
  'left'  { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
  'right' { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  'flip'  { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
$outFull = [System.IO.Path]::GetFullPath($Output)
$img.Save($outFull, $codec, $params)
"Saved $outFull ($($img.Width) x $($img.Height))"
$img.Dispose(); $stream.Dispose()
