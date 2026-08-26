@echo off
rem 桌面快捷方式指向的就是这个文件。双击 = 起本地预览服 + 自动开浏览器。
rem 这个黑窗口就是服务本身：关掉它 = 停服。
chcp 65001 >nul
title 本地预览 - bentleyblanks.github.io  (关掉本窗口即停服)
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   找不到 node —— 装了 Node.js 但没进 PATH 的话，重开一次终端再试。
  echo.
  pause
  exit /b 1
)

node scripts\Script_LocalPreview.mjs %*
if errorlevel 1 pause
