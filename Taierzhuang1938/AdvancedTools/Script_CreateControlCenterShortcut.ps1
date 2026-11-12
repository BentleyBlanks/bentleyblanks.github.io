# Create the AdvancedTool ControlCenter shortcut: target = node, arguments = Script_ControlCenterLaunch.mjs, working dir = repo root.
# Called by Script_ControlCenterLaunch.mjs --shortcut (same approach as scripts/Script_CreateDesktopShortcut.ps1).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
param(
  [Parameter(Mandatory = $true)][string]$LinkPath,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Arguments,
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [string]$Icon = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($LinkPath)
$shortcut.TargetPath       = $Target
$shortcut.Arguments        = $Arguments
$shortcut.WorkingDirectory = $WorkDir
$shortcut.Description      = 'AdvancedTool ControlCenter: start the local preview server and open the advanced tools control center'
if ($Icon -and (Test-Path -LiteralPath $Icon)) { $shortcut.IconLocation = "$Icon,0" }
$shortcut.Save()
Write-Output "SHORTCUT_PATH=$LinkPath"
