@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

set "PORT=8788"
if not "%~1"=="" set "PORT=%~1"

echo ============================================================
echo   动作制作管线工作台 (MotionWorkbench)
echo   地址: http://127.0.0.1:%PORT%/
echo   按 Ctrl+C 关闭服务
echo ============================================================

start "" "http://127.0.0.1:%PORT%/"
node "%~dp0server\Script_WorkbenchServer.mjs" %PORT%
endlocal
