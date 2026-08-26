# 在桌面放一个「本地预览」快捷方式，指向本仓库这份检出的 Script_StartLocalPreview.cmd。
#
#   powershell -ExecutionPolicy Bypass -File scripts\Script_CreateDesktopShortcut.ps1
#
# 从哪份检出运行，快捷方式就绑到哪份检出（用 $PSScriptRoot 定位，不写死路径）。
# 想让它指向主检出，就从主检出跑这条命令。加 -Name 可以另起一个名字，
# 这样主检出和某棵 worktree 可以各有一个快捷方式。
param(
  [string]$Name = '本地预览 bentleyblanks'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$target   = Join-Path $PSScriptRoot 'Script_StartLocalPreview.cmd'
if (-not (Test-Path -LiteralPath $target)) { throw "找不到启动脚本：$target" }

$linkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) ($Name + '.lnk')

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath       = $target
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description      = '本地起站点预览服，并打开页面索引（关掉黑窗口即停服）'
$icon = Join-Path $repoRoot 'favicon.ico'
if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = "$icon,0" }
$shortcut.Save()

Write-Output "快捷方式已创建：$linkPath"
Write-Output "  指向：$target"
Write-Output "  根目录：$repoRoot"
