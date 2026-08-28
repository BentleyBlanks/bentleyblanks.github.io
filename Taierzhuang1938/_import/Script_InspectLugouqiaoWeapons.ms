/*
  Inspect a 3ds Max scene without changing it and write one TSV row per node.

  Usage (3ds Max 2019):
    $env:TAIERZHUANG_WEAPON_REPORT = 'C:\\temp\\Data_LugouqiaoWeaponNodes.tsv'
    & 'C:\\Program Files\\Autodesk\\3ds Max 2019\\3dsmaxbatch.exe' `
      'Script_InspectLugouqiaoWeapons.ms' -sceneFile '武器.max'

  The report is build evidence only. It is not a game runtime asset.
*/

fn SafeText value =
(
    local text = value as string
    text = substituteString text "\t" " "
    text = substituteString text "\r" " "
    text = substituteString text "\n" " "
    text
)

fn MaterialSummary material =
(
    if material == undefined then return ""
    local parts = #()
    append parts ((SafeText material.name) + "<" + (SafeText (classOf material)) + ">")
    for index = 1 to (getNumSubMtls material) do
    (
        local subMaterial = getSubMtl material index
        if subMaterial != undefined do
            append parts ((SafeText subMaterial.name) + "<" + (SafeText (classOf subMaterial)) + ">")
    )
    join parts "|"
)

fn MeshCounts node =
(
    local vertices = 0
    local faces = 0
    if (superClassOf node == GeometryClass) do
    (
        local meshValue = undefined
        try (meshValue = snapshotAsMesh node) catch ()
        if meshValue != undefined do
        (
            vertices = getNumVerts meshValue
            faces = getNumFaces meshValue
            delete meshValue
        )
    )
    #(vertices, faces)
)

local reportPath = getEnvVariable "TAIERZHUANG_WEAPON_REPORT"
if reportPath == undefined or reportPath == "" do
    throw "TAIERZHUANG_WEAPON_REPORT is required"

local report = createFile reportPath encoding:#utf8
format "Node\tParent\tClass\tSuperClass\tLayer\tHidden\tFrozen\tRenderable\tVertices\tTriangles\tCenterX\tCenterY\tCenterZ\tSizeX\tSizeY\tSizeZ\tMaterial\n" to:report

local orderedNodes = for node in objects collect node
qsort orderedNodes (fn SortNodes left right = ((toLower left.name) < (toLower right.name)))

for node in orderedNodes do
(
    local bounds = nodeGetBoundingBox node (matrix3 1)
    local minimum = bounds[1]
    local maximum = bounds[2]
    local center = (minimum + maximum) * 0.5
    local size = maximum - minimum
    local counts = MeshCounts node
    local parentName = if node.parent == undefined then "" else node.parent.name
    local layerName = try (node.layer.name) catch ("")
    format "%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\t%\n" \
        (SafeText node.name) (SafeText parentName) (SafeText (classOf node)) \
        (SafeText (superClassOf node)) (SafeText layerName) node.isHidden node.isFrozen \
        node.renderable counts[1] counts[2] center.x center.y center.z \
        size.x size.y size.z (MaterialSummary node.material) to:report
)

close report
format "Wrote % nodes to %\n" orderedNodes.count reportPath
