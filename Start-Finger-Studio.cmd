@echo off
setlocal
cd /d "%~dp0"
title Zeke Gamby - Local AI Finger Studio
echo.
echo Finger Studio - AI on your own PC, no paid API.
echo First setup may install Node.js and Ollama, then download a 4.7 GB model.
echo Keep this window open while you use the studio.
echo.
set "STUDIO_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined STUDIO_NODE set "STUDIO_NODE=%%N"
if not defined STUDIO_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "STUDIO_NODE=%ProgramFiles%\nodejs\node.exe"
if defined STUDIO_NODE goto run
where winget.exe >nul 2>nul
if errorlevel 1 goto installmanually
echo Installing Node.js using Windows Package Manager. Follow any installer prompts.
winget install --id OpenJS.NodeJS.LTS --exact --source winget
if errorlevel 1 goto installmanually
if exist "%ProgramFiles%\nodejs\node.exe" set "STUDIO_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined STUDIO_NODE goto installmanually
:run
"%STUDIO_NODE%" local-ai\start.mjs
if errorlevel 1 pause
exit /b
:installmanually
echo Install the LTS version of Node.js, then run this launcher again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1
