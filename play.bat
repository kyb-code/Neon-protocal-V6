@echo off
rem NEON PROTOCOL launcher — delegates to the robust PowerShell launcher.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1"
