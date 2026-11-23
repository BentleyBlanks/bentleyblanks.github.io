#Requires -Version 5.1
<#
.SYNOPSIS
  一键部署 NVIDIA GEM-X Native77 (77关节含手指) 到 Modal Serverless GPU（按秒计费、闲置60秒自动缩容至0）。
.DESCRIPTION
  1. 检查/安装 modal Python SDK；
  2. 若尚未登录 Modal，引导一次浏览器授权 (`python -m modal setup`)；
  3. 执行 `python -m modal deploy MotionWorkbench/cloud/modal_gemx_service.py`；
  4. 输出永久 HTTPS 网关地址，直接粘贴进本地动作工作台「云端 GPU 设置」即可！
#>
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceFile = Join-Path $ScriptDir "modal_gemx_service.py"

Write-Host "=== [1/3] 检查 Modal CLI ===" -ForegroundColor Cyan
$hasModal = $false
try {
    python -m modal --version | Out-Null
    $hasModal = $true
} catch {
    $hasModal = $false
}
if (-not $hasModal) {
    Write-Host "正在安装 modal SDK..." -ForegroundColor Yellow
    python -m pip install --upgrade modal
}

Write-Host "`n=== [2/3] 检查 Modal 登录态 ===" -ForegroundColor Cyan
$profileCheck = python -m modal profile current 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "尚未登录 Modal，正在打开浏览器完成一次授权（含每月免费额度）..." -ForegroundColor Yellow
    python -m modal setup
} else {
    Write-Host "当前 Modal 账号配置: $profileCheck" -ForegroundColor Green
}

Write-Host "`n=== [3/3] 永久部署 GEM-X Native77 Serverless GPU 服务 ===" -ForegroundColor Cyan
Write-Host "首次构建镜像（PyTorch + GEM-X + SOMA-X + Blender 4.2）约需 4~6 分钟，之后永远秒启不再重装。" -ForegroundColor Gray
python -m modal deploy $ServiceFile

Write-Host "`n部署完成！请复制上方以 https:// 开头、web-api.modal.run 结尾的地址，填进本地工作台右上角「云端 GPU 配置」即可免开 Colab 全自动转骨骼。" -ForegroundColor Green
