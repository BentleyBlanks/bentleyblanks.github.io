# Create the TestScenes Launcher desktop shortcut: target = node, arguments = Script_TestScenesLaunch.mjs, working dir = repo root.
# Called by Script_TestScenesLaunch.mjs --shortcut (same approach as Script_CreateControlCenterShortcut.ps1).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
param(
  [string]$LinkPath = '',
  [string]$LinkPathBase64 = '',
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Arguments,
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [string]$Icon = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\scripts\Script_ShortcutIcon.ps1')
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

if ($LinkPathBase64) {
  $LinkPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($LinkPathBase64))
}
if (-not $LinkPath) { throw 'LinkPath or LinkPathBase64 is required' }

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($LinkPath)
$shortcut.TargetPath       = $Target
$shortcut.Arguments        = $Arguments
$shortcut.WorkingDirectory = $WorkDir
$shortcut.Description      = 'TestScenes Launcher: start the local preview server and open the independent test scenes launcher'
if ($Icon -and (Test-Path -LiteralPath $Icon)) {
  SaveShortcutIcon -Shortcut $shortcut -LinkPath $LinkPath -IconPath $Icon
} else { $shortcut.Save() }
Write-Output "SHORTCUT_PATH=$LinkPath"
