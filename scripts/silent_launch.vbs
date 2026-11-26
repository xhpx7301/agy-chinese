Option Explicit

Dim fso, shell, scriptDir, repoDir, pyScript, cmdLine, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoDir = fso.GetParentFolderName(scriptDir)
pyScript = fso.BuildPath(scriptDir, "deploy_chinese.py")

Function FindPythonCommand()
    Dim localApp, py312, py311
    If shell.Run("cmd /c where python >nul 2>nul", 0, True) = 0 Then
        FindPythonCommand = "python"
        Exit Function
    End If
    If shell.Run("cmd /c where py >nul 2>nul", 0, True) = 0 Then
        FindPythonCommand = "py -3"
        Exit Function
    End If
    localApp = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
    py312 = localApp & "\Programs\Python\Python312\python.exe"
    If fso.FileExists(py312) Then
        FindPythonCommand = """" & py312 & """"
        Exit Function
    End If
    py311 = localApp & "\Programs\Python\Python311\python.exe"
    If fso.FileExists(py311) Then
        FindPythonCommand = """" & py311 & """"
        Exit Function
    End If
    FindPythonCommand = ""
End Function

Dim pyCmd
pyCmd = FindPythonCommand()
If pyCmd = "" Then
    MsgBox "Python 3 not found. Please install Python 3.8+ with Add to PATH enabled.", 16, "agy-chinese"
    WScript.Quit 1
End If

shell.CurrentDirectory = repoDir
cmdLine = pyCmd & " """ & pyScript & """ --check-and-launch --silent"
rc = shell.Run(cmdLine, 0, True)
If rc <> 0 Then
    MsgBox "Antigravity i18n check or launch failed (exit code: " & rc & "). Please run deploy_chinese.py manually to inspect.", 16, "agy-chinese"
    WScript.Quit rc
End If
