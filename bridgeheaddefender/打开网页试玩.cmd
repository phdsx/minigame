@echo off
chcp 65001 >nul
cd /d "%~dp0"
node tools\start.cjs
if errorlevel 1 pause
