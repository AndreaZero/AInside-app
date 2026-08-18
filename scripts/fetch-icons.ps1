$ErrorActionPreference = "Stop"

$dest = Join-Path $PSScriptRoot "..\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$base = "https://raw.githubusercontent.com/tauri-apps/create-tauri-app/dev/templates/_base_/src-tauri/icons"
$files = @(
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.icns",
  "icon.ico",
  "icon.png"
)

foreach ($name in $files) {
  $out = Join-Path $dest $name
  if (Test-Path $out) {
    Write-Host "Skip $name"
    continue
  }
  Write-Host "Scarico $name"
  Invoke-WebRequest -Uri "$base/$name" -OutFile $out
}

Write-Host "Icone in $dest"
