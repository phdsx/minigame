param([string]$CreatorPath = $env:COCOS_CREATOR_PATH)

$ErrorActionPreference = 'Stop'
if (-not $CreatorPath -or -not (Test-Path -LiteralPath $CreatorPath -PathType Leaf)) {
    throw '请通过 -CreatorPath 或 COCOS_CREATOR_PATH 指定 Cocos Creator 3.8.8 可执行文件。'
}

$creatorExecutable = (Resolve-Path -LiteralPath $CreatorPath).Path
$gameProject = Join-Path $PSScriptRoot 'cocos-game'
$buildDirectory = Join-Path $gameProject 'build'
$buildLog = Join-Path $PSScriptRoot 'build-web.log'
$errorLog = Join-Path $PSScriptRoot 'build-web-error.log'
$electronRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $buildProcess = Start-Process -FilePath $creatorExecutable -ArgumentList @(
        '--project', "`"$gameProject`"", '--build',
        "`"platform=web-mobile;buildPath=$buildDirectory;debug=false`""
    ) -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $buildLog -RedirectStandardError $errorLog
    if (-not (Select-String -LiteralPath $buildLog -SimpleMatch 'build Task (web-mobile) Finished' -Quiet)) {
        throw "Web 构建失败（退出码 $($buildProcess.ExitCode)），请查看 $buildLog 和 $errorLog。"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $buildDirectory 'web-mobile/index.html') -PathType Leaf)) {
        throw '构建未生成 Web 入口文件。'
    }
    Write-Output 'Web 构建完成，可运行启动游戏.bat。'
}
finally {
    if ($null -ne $electronRunAsNode) { $env:ELECTRON_RUN_AS_NODE = $electronRunAsNode }
}
