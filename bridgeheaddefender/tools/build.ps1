param(
 [ValidateSet('web','android')][string]$Target='web',
 [switch]$Wait,
 [string]$CreatorPath=$env:COCOS_CREATOR_PATH
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$gameRoot=Join-Path $projectRoot 'game'
if (!$CreatorPath) { $CreatorPath=Join-Path $env:ProgramData 'cocos\editors\Creator\3.8.8\CocosCreator.exe' }
if (!(Test-Path -LiteralPath $CreatorPath -PathType Leaf)) { throw 'Cocos Creator 3.8.8 was not found. Set COCOS_CREATOR_PATH or pass -CreatorPath.' }
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'evidence') -Force | Out-Null
$buildArgs=@(('--user-data-dir="'+(Join-Path $gameRoot '.editor-profile')+'"'),'--project',('"'+$gameRoot+'"'),'--build',('"configPath='+(Join-Path $gameRoot ('build-'+$Target+'.json'))+'"'))
$taskProcess=Start-Process -FilePath $CreatorPath -ArgumentList $buildArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot ('evidence\build-'+$Target+'.log')) -RedirectStandardError (Join-Path $projectRoot ('evidence\build-'+$Target+'-error.log')) -PassThru
Write-Output ('Cocos '+$Target+' build PID: '+$taskProcess.Id)
if ($Wait) {
    $taskProcess.WaitForExit()
    $buildLog=Join-Path $projectRoot ('evidence\build-'+$Target+'.log')
    if (!(Select-String -LiteralPath $buildLog -Pattern 'build Task.*Finished' -Quiet)) { throw ('Build did not finish. Inspect '+$buildLog) }
    Write-Output ('Cocos '+$Target+' build finished.')
}
