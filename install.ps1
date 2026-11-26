# Installs Gemini Code on Windows, for this user only (no administrator):
#
#   powershell -c "irm https://raw.githubusercontent.com/ciro-maciel/gemini-code/main/install.ps1 | iex"
#
# It downloads the release, checks its SHA-256, unpacks it in
# %LOCALAPPDATA%\GeminiCode\app and adds that folder to the user's PATH.
# $env:GEMINI_CODE_VERSION = '0.1.0' picks a version.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'ciro-maciel/gemini-code'
$asset = 'gemini-code-windows-x64.zip'
$homeDir = Join-Path $env:LOCALAPPDATA 'GeminiCode'
$appDir = Join-Path $homeDir 'app'

if (-not [Environment]::Is64BitOperatingSystem) { throw 'Gemini Code needs 64-bit Windows.' }

if ($env:GEMINI_CODE_VERSION) {
  $base = "https://github.com/$repo/releases/download/v$($env:GEMINI_CODE_VERSION.TrimStart('v'))"
} else {
  $base = "https://github.com/$repo/releases/latest/download"
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("gemini-code-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Downloading $asset..."
  Invoke-WebRequest "$base/$asset" -OutFile (Join-Path $tmp $asset) -UseBasicParsing
  Invoke-WebRequest "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS') -UseBasicParsing

  $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_ -match " $([regex]::Escape($asset))$" }
  if (-not $line) { throw "$asset is not in SHA256SUMS" }
  $expected = ($line -split ' ')[0].ToLower()
  $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) { throw "checksum mismatch for ${asset}: the download is not the release" }

  Expand-Archive (Join-Path $tmp $asset) -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Path $homeDir -Force | Out-Null
  if (Test-Path $appDir) { Remove-Item $appDir -Recurse -Force }
  Move-Item (Join-Path $tmp 'gemini-code') $appDir
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not ($userPath -split ';' | Where-Object { $_ -eq $appDir })) {
  [Environment]::SetEnvironmentVariable('Path', ($(if ($userPath) { "$userPath;" } else { '' }) + $appDir), 'User')
  Write-Host "Added $appDir to your PATH."
}
$env:Path = "$env:Path;$appDir"

# A Start menu entry with the icon: it starts Gemini Code hidden (no console
# window) and opens the dashboard; opening it again only opens the dashboard.
$exe = Join-Path $appDir 'gemini-code.exe'
$icon = Join-Path $appDir 'icons\gemini-code.ico'
$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Gemini Code.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($programs)
$link.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$link.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Start-Process -FilePath '$exe' -WindowStyle Hidden`""
$link.WorkingDirectory = $appDir
if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
$link.Description = 'A desk of coding agents built around Google Gemini'
$link.Save()
Write-Host 'Added Gemini Code to the Start menu.'

$version = & (Join-Path $appDir 'gemini-code.exe') --version
Write-Host "Gemini Code $version installed in $appDir."
Write-Host ''
Write-Host 'Open a new terminal and start it with: gemini-code'
Write-Host 'Or point the agents at a project: gemini-code C:\code\my-app'
