param(
    [Parameter(Mandatory = $true)]
    [string] $SourceDir,

    [string] $IntermediateDir = (Join-Path $env:LOCALAPPDATA 'Temp\LugouCharacterFbx'),

    [string] $OutputDir = (Join-Path $PSScriptRoot '..\Model\Character'),

    [string] $MaxBatchPath,

    [string] $BlenderPath = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe',

    [switch] $Resume
)

$ErrorActionPreference = 'Stop'

function Resolve-EmptyOutputDirectory {
    param([Parameter(Mandatory = $true)][string] $PathValue)

    $absolutePath = [System.IO.Path]::GetFullPath($PathValue)
    if (Test-Path -LiteralPath $absolutePath) {
        $items = @(Get-ChildItem -LiteralPath $absolutePath -Force)
        if ($items.Count -gt 0) {
            throw "Output directory must be empty: $absolutePath"
        }
    }
    else {
        New-Item -ItemType Directory -Path $absolutePath | Out-Null
    }
    return $absolutePath
}

function New-SourceBridgeFile {
    param(
        [Parameter(Mandatory = $true)][string] $SourcePath,
        [Parameter(Mandatory = $true)][string] $DestinationPath
    )

    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        return
    }
    try {
        New-Item -ItemType HardLink -Path $DestinationPath -Target $SourcePath | Out-Null
    }
    catch {
        Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath
    }
}

$resolvedSourceDir = (Resolve-Path -LiteralPath $SourceDir).Path
$resolvedIntermediateDir = if ($Resume) {
    $absoluteIntermediatePath = [System.IO.Path]::GetFullPath($IntermediateDir)
    New-Item -ItemType Directory -Path $absoluteIntermediatePath -Force | Out-Null
    $absoluteIntermediatePath
}
else {
    Resolve-EmptyOutputDirectory -PathValue $IntermediateDir
}
$resolvedOutputDir = Resolve-EmptyOutputDirectory -PathValue $OutputDir

if (-not $MaxBatchPath) {
    $maxCandidates = @(
        Get-ChildItem -LiteralPath 'C:\Program Files\Autodesk' -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like '3ds Max *' } |
            ForEach-Object { Join-Path $_.FullName '3dsmaxbatch.exe' } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Sort-Object -Descending
    )
    if ($maxCandidates.Count -gt 0) {
        $MaxBatchPath = $maxCandidates[0]
    }
}
if (-not $MaxBatchPath -or -not (Test-Path -LiteralPath $MaxBatchPath -PathType Leaf)) {
    throw '3dsmaxbatch.exe was not found. Install/start 3ds Max 2018.4 or newer, or pass -MaxBatchPath.'
}
if (-not (Test-Path -LiteralPath $BlenderPath -PathType Leaf)) {
    throw "Blender executable was not found: $BlenderPath"
}

$requiredSources = @(
    '国军士兵5个(绑定).max',
    '日本士兵5个(绑定).max'
)
foreach ($requiredSource in $requiredSources) {
    $requiredPath = Join-Path $resolvedSourceDir $requiredSource
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Missing source file: $requiredPath"
    }
}
$bipFiles = @(Get-ChildItem -LiteralPath (Join-Path $resolvedSourceDir 'bip') -File -Filter '*.bip')
if ($bipFiles.Count -ne 16) {
    throw "Expected 16 .bip files, found $($bipFiles.Count)"
}

$actionMap = [ordered]@{
    '背靠墙_坐姿_探视.bip' = 'LeanWallSitPeek'
    '持枪_待机.bip' = 'RifleIdle'
    '持枪_待机2.bip' = 'RifleIdleAlt'
    '持枪_跑.bip' = 'RifleRun'
    '蹲射击.bip' = 'CrouchFire'
    '蹲射击2.bip' = 'CrouchFireAlt'
    '蹲姿_(静态).bip' = 'CrouchIdle'
    '机关枪射击.bip' = 'MachineGunFire'
    '机炮(静姿).bip' = 'EmplacementIdle'
    '进攻指令.bip' = 'AttackCommand'
    '匍匐射击.bip' = 'ProneFire'
    '起身_射击_下蹲.bip' = 'StandFireCrouch'
    '起身_射击_下蹲2.bip' = 'StandFireCrouchAlt'
    '上前_蹲_射击.bip' = 'AdvanceKneelFire'
    '上前射击.bip' = 'AdvanceFire'
    '手枪射击.bip' = 'PistolFire'
}
$actionPaths = @()
$sourceBridgeDir = Join-Path $resolvedIntermediateDir 'SourceBridge'
New-Item -ItemType Directory -Path $sourceBridgeDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $sourceBridgeDir 'Bip') -Force | Out-Null
$nraBridgePath = Join-Path $sourceBridgeDir 'Model_Nra.max'
$ijaBridgePath = Join-Path $sourceBridgeDir 'Model_Ija.max'
New-SourceBridgeFile -SourcePath (Join-Path $resolvedSourceDir '国军士兵5个(绑定).max') -DestinationPath $nraBridgePath
New-SourceBridgeFile -SourcePath (Join-Path $resolvedSourceDir '日本士兵5个(绑定).max') -DestinationPath $ijaBridgePath
foreach ($actionEntry in $actionMap.GetEnumerator()) {
    $actionFileName = $actionEntry.Key
    $actionPath = Join-Path (Join-Path $resolvedSourceDir 'bip') $actionFileName
    if (-not (Test-Path -LiteralPath $actionPath -PathType Leaf)) {
        throw "Missing source animation: $actionPath"
    }
    $bridgePath = Join-Path (Join-Path $sourceBridgeDir 'Bip') ("Animation_$($actionEntry.Value).bip")
    New-SourceBridgeFile -SourcePath $actionPath -DestinationPath $bridgePath
    $actionPaths += $bridgePath
}

$maxScript = Join-Path $PSScriptRoot 'Script_ExportLugouCharacters.ms'
$blenderScript = Join-Path $PSScriptRoot 'Script_BakeLugouCharacters.py'
$listenerLog = Join-Path $resolvedIntermediateDir 'Data_3dsMaxListenerLog.txt'
$systemLog = Join-Path $resolvedIntermediateDir 'Data_3dsMaxSystemLog.txt'

$environmentValues = [ordered]@{
    LUGOU_SOURCE_DIR = $sourceBridgeDir
    LUGOU_EXPORT_DIR = $resolvedIntermediateDir
    LUGOU_NRA_SCENE = $nraBridgePath
    LUGOU_IJA_SCENE = $ijaBridgePath
    LUGOU_CANONICAL_ACTIONS = 'true'
    LUGOU_RESUME = $(if ($Resume) { 'true' } else { 'false' })
}
for ($actionIndex = 0; $actionIndex -lt $actionPaths.Count; $actionIndex++) {
    $environmentValues[('LUGOU_ACTION_{0:D2}' -f ($actionIndex + 1))] = $actionPaths[$actionIndex]
}
$previousEnvironment = @{}
try {
    foreach ($environmentName in $environmentValues.Keys) {
        $previousEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
        [Environment]::SetEnvironmentVariable($environmentName, $environmentValues[$environmentName], 'Process')
    }
    # Max 2019's batch host throws before the first scripted loadMaxFile call
    # unless a legacy scene has already initialized the file loader.
    & $MaxBatchPath $maxScript -sceneFile $nraBridgePath -v 3 -dm on -listenerlog $listenerLog -log $systemLog
    if ($LASTEXITCODE -ne 0) {
        throw "3ds Max batch export failed with exit code $LASTEXITCODE. See $listenerLog"
    }
}
finally {
    foreach ($environmentName in $environmentValues.Keys) {
        [Environment]::SetEnvironmentVariable($environmentName, $previousEnvironment[$environmentName], 'Process')
    }
}

$modelFbx = @(Get-ChildItem -LiteralPath $resolvedIntermediateDir -File -Filter 'Model_Lugou*.fbx')
$animationFbx = @(Get-ChildItem -LiteralPath $resolvedIntermediateDir -File -Filter 'Animation_LugouCanonical_*.fbx')
if ($modelFbx.Count -ne 10 -or $animationFbx.Count -ne 16) {
    throw "Incomplete FBX bridge: models=$($modelFbx.Count), animations=$($animationFbx.Count)"
}

& $BlenderPath --factory-startup --background --python-exit-code 1 --python $blenderScript -- `
    --input-dir $resolvedIntermediateDir `
    --output-dir $resolvedOutputDir `
    --texture-dir (Join-Path $resolvedSourceDir 'texture')
if ($LASTEXITCODE -ne 0) {
    throw "Blender character bake failed with exit code $LASTEXITCODE"
}

$modelGlb = @(Get-ChildItem -LiteralPath $resolvedOutputDir -File -Filter 'Model_Lugou*.glb')
$manifest = Join-Path $resolvedOutputDir 'Data_LugouCharacterManifest.json'
if ($modelGlb.Count -ne 10 -or -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "Incomplete GLB bake: models=$($modelGlb.Count), manifest=$manifest"
}

Write-Output "Baked 10 animated character models to $resolvedOutputDir"
Write-Output "Manifest: $manifest"
