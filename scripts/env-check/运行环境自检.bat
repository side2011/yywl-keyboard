@echo off
title YYWL 键盘配置环境自检
cd /d "%~dp0"

echo ============================================
echo    YYWL 键盘配置环境自检
echo    正在检查 系统 / 浏览器 / USB 设备 ...
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yywl-env-check.ps1"

if errorlevel 1 (
  echo.
  echo 自检脚本运行失败，请截图这一段发给技术支持。
  pause
)