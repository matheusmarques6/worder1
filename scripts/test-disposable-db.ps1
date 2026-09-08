#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Prepare', 'Replay', 'Upgrade', 'Test', 'Stop')]
    [string]$Action,
    [Parameter(Mandatory)][string]$RunDirectory,
    [string[]]$TestTargets = @(),
    [ValidatePattern('^[0-9]{14}$')][string]$MigrationThrough
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = Join-Path $repoRoot 'runtime'
$pythonPath = if ($IsWindows) {
    Join-Path $runtimeRoot '.venv/Scripts/python.exe'
} else {
    Join-Path $runtimeRoot '.venv/bin/python'
}
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw 'Runtime venv missing: run uv sync --directory runtime --frozen before the executor'
}

function Invoke-Executor([string]$SelectedAction) {
    $PSNativeCommandUseErrorActionPreference = $false
    $request = @{
        Action = $SelectedAction
        RunDirectory = $RunDirectory
        TestTargets = @($TestTargets)
        MigrationThrough = $(if ($MigrationThrough) { $MigrationThrough } else { $null })
    } | ConvertTo-Json -Depth 4 -Compress
    $previousEncoding = $OutputEncoding
    Push-Location -LiteralPath $runtimeRoot
    try {
        $OutputEncoding = [Text.UTF8Encoding]::new($false)
        $request | & $pythonPath -X utf8 -m tests.support.disposable_executor
        $result = $LASTEXITCODE
    } finally {
        $OutputEncoding = $previousEncoding
        Pop-Location
    }
    if ($null -eq $result) { exit 127 }
    exit ([int]$result)
}

switch ($Action) {
    'Prepare' { Invoke-Executor 'Prepare' }
    'Replay'  { Invoke-Executor 'Replay' }
    'Upgrade' { Invoke-Executor 'Upgrade' }
    'Test'    { Invoke-Executor 'Test' }
    'Stop'    { Invoke-Executor 'Stop' }
    default   { throw 'invalid Action' }
}
