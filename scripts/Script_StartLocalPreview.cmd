@echo off
rem The desktop shortcut points here. Double-click = start the local preview
rem server and open the index page. This console window IS the server:
rem closing it stops the server.
rem
rem Keep this file ASCII-only. cmd.exe parses the batch text using whatever
rem console codepage is active when it reads each chunk -- UTF-8 Chinese in
rem here gets mis-split under cp936 and spits a bogus "not recognized as an
rem internal or external command" line on every launch. All Chinese output
rem (and the window title) comes from the node script instead, which prints
rem correctly once chcp 65001 is in effect.
chcp 65001 >nul
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   node not found. Install Node.js, or reopen the terminal so PATH picks it up.
  echo.
  pause
  exit /b 1
)

node scripts\Script_LocalPreview.mjs %*
if errorlevel 1 pause
