@echo off
chcp 65001 >nul
echo ============================================================
echo   Antigravity 中文汉化部署工具 (agy-chinese)
echo ============================================================
echo.

set "PY_SCRIPT=%~dp0scripts\deploy_chinese.py"
set "EXIT_CODE=1"

where python >nul 2>nul
if %errorlevel%==0 (
    python "%PY_SCRIPT%"
    set "EXIT_CODE=%errorlevel%"
    goto :done
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%PY_SCRIPT%"
    set "EXIT_CODE=%errorlevel%"
    goto :done
)

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%PY_SCRIPT%"
    set "EXIT_CODE=%errorlevel%"
    goto :done
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" "%PY_SCRIPT%"
    set "EXIT_CODE=%errorlevel%"
    goto :done
)

echo [错误] 未找到 Python 3 环境，请先安装 Python 3.8+ 并勾选 Add to PATH。

:done
echo.
if "%EXIT_CODE%"=="0" (
    echo 窗口将在 5 秒后自动关闭（按任意键立即关闭）...
    timeout /t 5 >nul
) else (
    echo [提示] 部署未完成，请查看上方报错信息。
    pause
)
