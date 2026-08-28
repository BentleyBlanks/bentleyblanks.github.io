/*
  Legacy Lugou Bridge character exporter for 3ds Max.

  The source package stores ten rigged soldiers in two 3ds Max 2014 scenes and sixteen
  Character Studio motions as .bip files.  Blender cannot reconstruct the Skin/Physique
  modifiers or Biped tracks from those proprietary containers.  This script performs the
  lossless side of the bridge inside 3ds Max: ten bind-pose FBX files plus one skeleton-only
  FBX per character and motion.  Script_BakeLugouCharacters.py consolidates those files into
  ten web-ready GLBs afterwards.

  Required environment variables:
    LUGOU_SOURCE_DIR  Folder containing the two bound soldier .max files and bip/.
    LUGOU_EXPORT_DIR  Empty or dedicated output folder for the intermediate FBX files.

  Headless example (adjust the 3ds Max path):
    3dsmaxbatch.exe -script Script_ExportLugouCharacters.ms
*/

-- getEnvVariable was added after 3ds Max 2019.  System.Environment keeps the
-- batch bridge compatible with the installed legacy host.
fn ReadEnvironmentVariable variableName =
(
    local environmentClass = dotNetClass "System.Environment"
    environmentClass.GetEnvironmentVariable variableName
)

global LugouSourceDir = ReadEnvironmentVariable "LUGOU_SOURCE_DIR"
global LugouExportDir = ReadEnvironmentVariable "LUGOU_EXPORT_DIR"
global LugouNraScene = ReadEnvironmentVariable "LUGOU_NRA_SCENE"
global LugouIjaScene = ReadEnvironmentVariable "LUGOU_IJA_SCENE"
global LugouSideOnly = ReadEnvironmentVariable "LUGOU_SIDE_ONLY"
global LugouSkipModels = ReadEnvironmentVariable "LUGOU_SKIP_MODELS"
global LugouCanonicalActions = ReadEnvironmentVariable "LUGOU_CANONICAL_ACTIONS"
global LugouResume = ReadEnvironmentVariable "LUGOU_RESUME"
global LugouLogStream = undefined

fn NormalizePath pathValue =
(
    if pathValue == undefined then return undefined
    local normalized = substituteString pathValue "/" "\\"
    while normalized.count > 0 and normalized[normalized.count] == "\\" do
        normalized = substring normalized 1 (normalized.count - 1)
    normalized
)

fn JoinPath parentPath childPath = (NormalizePath parentPath) + "\\" + childPath

fn Pad2 numberValue =
(
    if numberValue < 10 then ("0" + (numberValue as string)) else (numberValue as string)
)

fn LogLine message =
(
    format "%\n" message
    if LugouLogStream != undefined do
    (
        format "%\n" message to:LugouLogStream
        flush LugouLogStream
    )
)

fn Fail message =
(
    LogLine ("ERROR: " + message)
    throw message
)

fn AppendUnique target value =
(
    if value != undefined and (findItem target value) == 0 do append target value
    target
)

fn CollectHierarchy rootNode =
(
    -- Nested recursive functions in MaxScript 2019 do not self-bind.  Walk the
    -- hierarchy iteratively so this also works for deep Biped link chains.
    local found = #(rootNode)
    local cursor = 1
    while cursor <= found.count do
    (
        local nodeValue = found[cursor]
        for childNode in nodeValue.children do AppendUnique found childNode
        cursor += 1
    )
    found
)

fn IsBipedRoot nodeValue =
(
    if nodeValue == undefined or nodeValue.parent != undefined then return false
    local handNode = undefined
    try (handNode = biped.getNode nodeValue #rarm link:4) catch (handNode = undefined)
    handNode != undefined
)

fn FindBipedRoots =
(
    local roots = for nodeValue in objects where IsBipedRoot nodeValue collect nodeValue
    qsort roots (fn CompareRoot left right = stricmp left.name right.name)
    roots
)

fn FindSkinModifier nodeValue =
(
    for modifierValue in nodeValue.modifiers where (classOf modifierValue == Skin) do return modifierValue
    undefined
)

fn ModifierSummary nodeValue =
(
    local names = #()
    for modifierValue in nodeValue.modifiers do append names ((classOf modifierValue) as string)
    if names.count == 0 then "none" else (names as string)
)

fn SkinUsesHierarchy skinModifier hierarchy =
(
    if skinModifier == undefined then return false
    local boneNodes = #()
    try (boneNodes = skinOps.GetBoneNodes skinModifier) catch
    (
        local boneCount = 0
        try (boneCount = skinOps.GetNumberBones skinModifier) catch (boneCount = 0)
        for boneIndex = 1 to boneCount do
        (
            local boneName = undefined
            try (boneName = skinOps.GetBoneName skinModifier boneIndex 0) catch (boneName = undefined)
            if boneName != undefined do AppendUnique boneNodes (getNodeByName boneName exact:true)
        )
    )
    for boneNode in boneNodes where (findItem hierarchy boneNode) > 0 do return true
    false
)

fn WorldCenter nodeValue =
(
    -- The second argument is the coordinate system in which the bounds are
    -- returned.  Identity gives world-space bounds; node.transform would
    -- incorrectly return each mesh around its own local origin.
    local bounds = nodeGetBoundingBox nodeValue (matrix3 1)
    (bounds[1] + bounds[2]) * 0.5
)

fn NearestRootIndex nodeValue roots =
(
    local center = WorldCenter nodeValue
    local bestIndex = 0
    local bestDistance = 1e30
    for rootIndex = 1 to roots.count do
    (
        -- Biped_Object roots expose their world transform but not the generic
        -- node .position property in Max 2019.
        local distanceValue = distance center roots[rootIndex].transform.translation
        if distanceValue < bestDistance do
        (
            bestDistance = distanceValue
            bestIndex = rootIndex
        )
    )
    bestIndex
)

fn BuildCharacterEntries roots =
(
    local entries = #()
    for rootNode in roots do append entries #(rootNode, CollectHierarchy rootNode, #())

    -- Biped bones themselves are GeometryClass in Max 2019, so exclude them.
    -- The source scenes lay the five soldiers out on the X axis; world-space
    -- proximity is authoritative and also picks up the one rigid accessory.
    for geometryNode in geometry where (classOf geometryNode != Biped_Object) do
    (
        local matchedIndex = NearestRootIndex geometryNode roots
        if matchedIndex > 0 do AppendUnique entries[matchedIndex][3] geometryNode
    )
    entries
)

fn SelectNodes nodeArray =
(
    clearSelection()
    for nodeValue in nodeArray where isValidNode nodeValue do selectMore nodeValue
)

fn TryFbxSetting settingName settingValue =
(
    try
    (
        local resultValue = FBXExporterSetParam settingName settingValue
        if resultValue == "unsupplied" do LogLine ("FBX setting unsupported: " + settingName)
        resultValue
    )
    catch
    (
        LogLine ("FBX setting failed: " + settingName)
        undefined
    )
)

fn ConfigureFbx exportAnimation =
(
    TryFbxSetting "ASCII" false
    TryFbxSetting "Cameras" false
    TryFbxSetting "Lights" false
    TryFbxSetting "SmoothingGroups" true
    TryFbxSetting "SmoothMeshExport" false
    TryFbxSetting "Preserveinstances" false
    TryFbxSetting "EmbedTextures" false
    TryFbxSetting "ConvertUnit" "m"
    TryFbxSetting "UpAxis" "Z"
    TryFbxSetting "Skin" true
    TryFbxSetting "Shape" true
    TryFbxSetting "Animation" exportAnimation
    TryFbxSetting "BakeAnimation" exportAnimation
    TryFbxSetting "Resampling" exportAnimation
    TryFbxSetting "FilterKeyReducer" false
    if exportAnimation do
    (
        -- A Max Time coerced to integer is measured in ticks (160 per frame),
        -- while the FBX plugin expects frame numbers.  Passing ticks inflated a
        -- 77-frame clip to 12,320 frames and made glTF animation export explode.
        TryFbxSetting "BakeFrameStart" ((animationRange.start / ticksPerFrame) as integer)
        TryFbxSetting "BakeFrameEnd" ((animationRange.end / ticksPerFrame) as integer)
        TryFbxSetting "BakeFrameStep" 1
    )
)

fn ExportSelection outputFile exportAnimation =
(
    ConfigureFbx exportAnimation
    exportFile outputFile #noPrompt selectedOnly:true
    if not doesFileExist outputFile do Fail ("FBX was not created: " + outputFile)
    LogLine ("WROTE " + outputFile)
)

fn ShouldResumeFile outputFile =
(
    LugouResume != undefined and (toLower LugouResume) == "true" and doesFileExist outputFile
)

fn GetActionEntries =
(
    -- Paths are supplied by PowerShell because Max 2019 reads BOM-less scripts
    -- using the active Windows code page and would corrupt Chinese literals.
    local actionIds = #(
        "LeanWallSitPeek",
        "RifleIdle",
        "RifleIdleAlt",
        "RifleRun",
        "CrouchFire",
        "CrouchFireAlt",
        "CrouchIdle",
        "MachineGunFire",
        "EmplacementIdle",
        "AttackCommand",
        "ProneFire",
        "StandFireCrouch",
        "StandFireCrouchAlt",
        "AdvanceKneelFire",
        "AdvanceFire",
        "PistolFire"
    )
    local entries = #()
    for actionIndex = 1 to actionIds.count do
    (
        local variableName = "LUGOU_ACTION_" + Pad2 actionIndex
        local actionFile = ReadEnvironmentVariable variableName
        if actionFile == undefined or actionFile == "" do Fail (variableName + " is not set")
        append entries #(NormalizePath actionFile, actionIds[actionIndex])
    )
    entries
)

fn LoadMotion rootNode actionFile =
(
    local loaded = false
    try
    (
        -- The bind scenes intentionally open every Biped in Figure mode.
        -- Character Studio refuses to load .bip motion while that mode is on.
        local bipedController = rootNode.transform.controller
        if bipedController.figureMode do bipedController.figureMode = false
        -- Match the BIP's source Biped structure before loading its List
        -- controllers.  The bundled clips were authored on a slightly different
        -- Character Studio structure; loading them onto the bind skeleton without
        -- this remap preserves legs but can leave unmatched upper-body tracks in
        -- Figure pose.  Max-object payloads are deliberately excluded because
        -- legacy clips may contain interactive scene-object import dialogs.
        biped.loadBipFile bipedController actionFile #matchFileStruct #noRedraw #loadSubAnimControllers
        local motionRange = biped.getCurrentRange bipedController
        -- Static source poses legitimately report 0f..0f.  Max refuses a zero
        -- length global animationRange, so expose that pose as a one-frame clip.
        if motionRange.end <= motionRange.start then
        (
            animationRange = interval motionRange.start (motionRange.start + ticksPerFrame)
            LogLine ("BIP static pose " + (motionRange.start as string) + " -> one frame")
        )
        else
        (
            animationRange = motionRange
            LogLine ("BIP range " + (motionRange.start as string) + ".." + (motionRange.end as string))
        )
        loaded = true
    )
    catch
    (
        LogLine ("BIP load failed: " + rootNode.name + " <- " + actionFile + " :: " + getCurrentException())
        loaded = false
    )
    loaded
)

fn ExportSide sideId sourceScene =
(
    local currentScene = NormalizePath maxFilePath
    if currentScene != undefined and (toLower currentScene) == (toLower (NormalizePath sourceScene)) then
    (
        LogLine ("USING PRELOADED " + sourceScene)
    )
    else
    (
        LogLine ("OPEN " + sourceScene)
        -- The missing-files reference parameters throw an undocumented system
        -- exception in the 2019 batch host before the scene opens.  Missing maps
        -- are relinked by Blender, so a quiet load is sufficient here.
        local loaded = loadMaxFile sourceScene quiet:true
        if not loaded do Fail ("Could not load source scene: " + sourceScene)
    )

    local roots = FindBipedRoots()
    if roots.count != 5 do Fail (sideId + " expected 5 Biped roots, found " + (roots.count as string))
    local entries = BuildCharacterEntries roots
    for rootIndex = 1 to roots.count do
    (
        local rootNode = roots[rootIndex]
        local entry = entries[rootIndex]
        LogLine (sideId + " ROOT " + (Pad2 rootIndex) + ": name=" + rootNode.name +
            ", hierarchy=" + (entry[2].count as string) +
            ", meshes=" + (entry[3].count as string) +
            ", world=" + (rootNode.transform.translation as string))
    )
    for geometryNode in geometry where (classOf geometryNode != Biped_Object) do
    (
        LogLine (sideId + " GEOMETRY: name=" + geometryNode.name +
            ", modifiers=" + ModifierSummary geometryNode +
            ", center=" + (WorldCenter geometryNode as string))
    )

    -- Bind-pose/model exports happen before any .bip mutates the source scene.
    if LugouSkipModels == undefined or (toLower LugouSkipModels) != "true" do
    (
        for modelIndex = 1 to entries.count do
        (
            local entry = entries[modelIndex]
            -- `copy` is the scene-node clone command in MaxScript 2019, not an
            -- array-copy helper; build a fresh selection array explicitly.
            local exportNodes = for nodeValue in entry[2] collect nodeValue
            join exportNodes entry[3]
            if entry[3].count == 0 do Fail (sideId + (Pad2 modelIndex) + " has no geometry")
            local modelId = "Lugou" + sideId + (Pad2 modelIndex)
            local modelOutput = JoinPath LugouExportDir ("Model_" + modelId + ".fbx")
            if ShouldResumeFile modelOutput then
                LogLine ("SKIP existing " + modelOutput)
            else
            (
                SelectNodes exportNodes
                ExportSelection modelOutput false
                LogLine (modelId + ": root=" + entry[1].name + ", meshes=" + (entry[3].count as string))
            )
        )
    )

    local useCanonicalActions = LugouCanonicalActions != undefined and (toLower LugouCanonicalActions) == "true"
    local shouldExportActions = not useCanonicalActions or sideId == "Nra"
    if shouldExportActions do
    (
        local actionEntries = GetActionEntries()
        for actionEntry in actionEntries do
        (
            local actionFile = actionEntry[1]
            local actionId = actionEntry[2]
            if not doesFileExist actionFile do Fail ("Missing BIP: " + actionFile)
            local firstModelIndex = if useCanonicalActions then 1 else 1
            local lastModelIndex = if useCanonicalActions then 1 else entries.count
            for modelIndex = firstModelIndex to lastModelIndex do
            (
                local outputName = if useCanonicalActions then
                    ("Animation_LugouCanonical_" + actionId + ".fbx")
                else
                    ("Animation_Lugou" + sideId + (Pad2 modelIndex) + "_" + actionId + ".fbx")
                local actionOutput = JoinPath LugouExportDir outputName
                if ShouldResumeFile actionOutput then
                    LogLine ("SKIP existing " + actionOutput)
                else
                (
                    local rootNode = entries[modelIndex][1]
                    if not LoadMotion rootNode actionFile do Fail ("Could not retarget " + actionFile + " to " + rootNode.name)
                    local hierarchy = CollectHierarchy rootNode
                    SelectNodes hierarchy
                    ExportSelection actionOutput true
                )
            )
        )
    )
)

fn Main =
(
    LugouSourceDir = NormalizePath LugouSourceDir
    LugouExportDir = NormalizePath LugouExportDir
    if LugouSourceDir == undefined or LugouSourceDir == "" do Fail "LUGOU_SOURCE_DIR is not set"
    if LugouExportDir == undefined or LugouExportDir == "" do Fail "LUGOU_EXPORT_DIR is not set"
    if not doesDirectoryExist LugouSourceDir do Fail ("Source folder does not exist: " + LugouSourceDir)
    makeDir LugouExportDir all:true
    LugouLogStream = createFile (JoinPath LugouExportDir "Data_ExportLog.txt")
    if LugouLogStream == undefined do Fail "Could not create Data_ExportLog.txt"

    local nraScene = NormalizePath LugouNraScene
    local ijaScene = NormalizePath LugouIjaScene
    if nraScene == undefined or nraScene == "" do Fail "LUGOU_NRA_SCENE is not set"
    if ijaScene == undefined or ijaScene == "" do Fail "LUGOU_IJA_SCENE is not set"
    if not doesFileExist nraScene do Fail ("Missing source scene: " + nraScene)
    if not doesFileExist ijaScene do Fail ("Missing source scene: " + ijaScene)

    if LugouSideOnly == undefined or LugouSideOnly == "" or (toLower LugouSideOnly) == "nra" do
        ExportSide "Nra" nraScene
    if LugouSideOnly == undefined or LugouSideOnly == "" or (toLower LugouSideOnly) == "ija" do
        ExportSide "Ija" ijaScene
    if LugouSideOnly == undefined or LugouSideOnly == "" then
        LogLine "DONE: exported 10 bind-pose models and 160 retargeted animation files."
    else
        LogLine ("DONE: exported side " + LugouSideOnly + ".")
    close LugouLogStream
    LugouLogStream = undefined
    quitMAX #noPrompt
)

try (Main()) catch
(
    local errorMessage = getCurrentException()
    LogLine ("FATAL: " + errorMessage)
    if LugouLogStream != undefined do close LugouLogStream
    LugouLogStream = undefined
    quitMAX #noPrompt
)
