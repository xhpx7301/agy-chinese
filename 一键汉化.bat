@echo off
chcp 65001 >nul
echo ============================================================
echo   Antigravity Chinese Locale (agy-chinese) 一键汉化部署
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python "%~dp0scripts\deploy_chinese.py"
    goto :done
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%~dp0scripts\deploy_chinese.py"
    goto :done
)

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%~dp0scripts\deploy_chinese.py"
    goto :done
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" "%~dp0scripts\deploy_chinese.py"
    goto :done
)

echo [Error] 未找到 Python 3 环境，请先安装 Python 3.8+ 并勾选 Add to PATH。

:done
echo.
pause
