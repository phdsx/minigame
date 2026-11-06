@echo off
chcp 65001 >nul
title 小兵战争 - 本地启动器
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 goto :node

where python >nul 2>nul
if %errorlevel%==0 goto :python

echo 未找到 Node.js 或 Python，无法启动本地服务器。
echo 请安装 Node.js（推荐）后重试，或自行用任意静态服务器托管：
echo   cocos-game\build\web-mobile
pause
exit /b 1

:node
echo 使用 Node.js 启动本地服务器...
node "tools\serve.mjs" 8099 "cocos-game\build\web-mobile"
set "GAME_EXIT=%errorlevel%"
if not "%GAME_EXIT%"=="0" pause
exit /b %GAME_EXIT%

:python
echo 使用 Python 启动本地服务器...
python "tools\serve.py" 8099 "cocos-game\build\web-mobile"
set "GAME_EXIT=%errorlevel%"
if not "%GAME_EXIT%"=="0" pause
exit /b %GAME_EXIT%
