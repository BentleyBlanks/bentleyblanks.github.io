"""Incremental whole-airframe reconstruction from the protected V46 author.

Printed dimensions, frame6/hinge station and real control hierarchy remain.
Unprinted profiles/installations are hypotheses until whole native QA passes.
"""
import bpy, pathlib, os, json, hashlib, ast, array, struct, math, re, shutil
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4AirframeUpdate.py')).resolve()
repo = scriptPath.parents[2]
asset = pathlib.Path(os.environ.get('KI4_AIRFRAME_ASSET_ROOT', str(repo / 'tmp/NakajimaKi4/ReferenceV47_AirframeJoint')))
parameterPath = asset / 'Data_AirframeParameters.json'
parameters = json.loads(parameterPath.read_text(encoding='utf8'))
shared = parameters['shared']
oldParameterBytes = (repo / 'tmp/NakajimaKi4/ReferenceV46_FullBladeOutline/Data_ThreePhotoShapeParameters.json').read_bytes()
try:
    oldParameterText = oldParameterBytes.decode('utf8')
except UnicodeDecodeError:
    # Preserve the hashed legacy snapshot; all new recipes are explicitly UTF8.
    oldParameterText = oldParameterBytes.decode('cp936')
oldParameters = json.loads(oldParameterText)
oldShared = oldParameters['shared']
source = pathlib.Path(bpy.data.filepath)
sourceRoot = pathlib.Path(parameters['sourceRoot'])
assert source.resolve() == pathlib.Path(parameters['inputSource']).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == parameters['inputSourceSha256']
assert not sourceRoot.exists(), 'Reopen the protected source and use a new output directory'
root = bpy.data.objects['NakajimaKi4']
assert root['version'] == '20261027ReferenceV46FullBladeOutline'
assert not bpy.context.scene.get('Ki4AirframeMutationInProgress', False)
assert np.max(abs(np.array(root.matrix_world) - np.eye(4))) < 1e-7

def LoadFunctions(path, names):
    tree = ast.parse(path.read_text(encoding='utf8'))
    for name in names:
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), globals())

LoadFunctions(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py'), ['MeshFingerprint'])
LoadFunctions(scriptPath.with_name('Script_NakajimaKi4DatumCandidate.py'),
              ['EvaluatedTriangles', 'Slopes', 'Evaluate', 'Displacement', 'WorldVertices',
               'SetWorldVertices', 'Components', 'HasAncestor', 'IsWing', 'IsEngine'])
baseScript = scriptPath.with_name('Script_NakajimaKi4ThreePhotoShape.py')
LoadFunctions(baseScript, ['Caps', 'Tree', 'Inside', 'PlaceRod', 'CapPoints', 'UpdateRod'])
objects = list(root.children_recursive)
meshes = [obj for obj in objects if obj.type == 'MESH']
assert len(meshes) == 928
bpy.context.view_layer.update()
before = {obj.name: MeshFingerprint(obj) for obj in meshes}
packedBefore = {im.name: hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file}
assert len(packedBefore) == 42
protectedImages = {name: digest for name, digest in packedBefore.items() if name != 'Texture_Ki4PropellerGeometryAo'}
oldLower = np.array(json.loads(root['lowerExteriorOffsetsJson']))
oldUpper = np.array(json.loads(root['upperExteriorOffsetsJson']))
newLower = np.array(shared['lowerExteriorOffsetsYM'])
newUpper = np.array(shared['upperExteriorOffsetsYM'])
station = oldLower[:, 0]
width = np.array([.088, .147, .248, .358, .430, .490, .575, .625, .620, .610, .590])
axisHeight = float(root['bodyLongitudinalAxisHeightM'])
C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
Gltf = lambda p: np.asarray(p) @ C.T
Blender = lambda p: np.asarray(p) @ C

def Rotation(axis, angle):
    x, y, z = axis; c = math.cos(angle); s = math.sin(angle); a = 1 - c
    return np.array([[c+x*x*a, x*y*a-z*s, x*z*a+y*s],
                     [y*x*a+z*s, c+y*y*a, y*z*a-x*s],
                     [z*x*a-y*s, z*y*a+x*s, c+z*z*a]])

wingObjects = [obj for obj in objects if IsWing(obj)]
engineObjects = [obj for obj in objects if IsEngine(obj)]
body = bpy.data.objects['Fuselage_Monocoque']
rivets = bpy.data.objects['Surface_FlushRivetHeads']
bodyDeformed = [obj for obj in meshes if obj.name == body.name or obj.name.startswith(('Cockpit_Coaming', 'Cockpit_Lining', 'ObserverRingSupport'))]
screens = {i: [obj for obj in meshes if re.match(r'^Windscreen(?:SideFrame|Side|Frame)?'+str(i)+r'(?:$|-?1$)', obj.name)] for i in [1, 2]}
assert all(len(values) == 6 for values in screens.values())
observer = bpy.data.objects['Pivot_ObserverYaw']
while observer.parent and observer.parent != root: observer = observer.parent
observerMeshes = [obj for obj in [observer] + list(observer.children_recursive) if obj.type == 'MESH']
cabane = [bpy.data.objects['Cabane_'+position+side] for position in ['Front', 'Rear'] for side in ['Left', 'Right']]
braces = [bpy.data.objects['TailplaneBrace_'+side] for side in ['Left', 'Right']]
oldRodCaps = {obj.name: Caps(obj) for obj in cabane + braces}
oldRodMatrices = {obj.name: obj.matrix_world.copy() for obj in cabane + braces}
allowed = {obj.name for obj in wingObjects + engineObjects + bodyDeformed + observerMeshes + cabane + braces + [rivets] if obj.type == 'MESH'} | {obj.name for values in screens.values() for obj in values} | {'Rudder', 'Tailplane_Left', 'Tailplane_Right', 'Elevator_Left', 'Elevator_Right'}
wingFrame = bpy.data.objects['Frame_SharedWingDatumV40']
engineFrame = bpy.data.objects['Frame_SharedEngineDatumV40']
oldWingMatrix = wingFrame.matrix_world.copy(); oldEngineMatrix = engineFrame.matrix_world.copy()
oldTailMatrices = {side: bpy.data.objects['Frame_HorizontalTail'+side+'V42'].matrix_world.copy() for side in ['Left', 'Right']}
bpy.context.scene['Ki4AirframeMutationInProgress'] = True
# Reuse the already-audited body/rivet/screen and coupled datum retargeting.
text = baseScript.read_text(encoding='utf8')
chunk = text[text.index('bodyRows=[]'):text.index('# Shape the unprinted aft rudder contour')]
exec(compile(chunk, str(baseScript), 'exec'), globals())

# Invert the old smooth rudder map, then apply the new map to the same source.
rudder = bpy.data.objects['Rudder']; oldRudder = Gltf(WorldVertices(rudder))

hinge = np.array(shared['originalRudderHingeCenterGltfM']); hingeAxis = np.array(shared['originalRudderHingeAxisGltf'])
aft = np.array(shared['rudderChordAftDirectionGltf']); envelope = np.array(shared['rudderEnvelopeGltfYAndChordM'])
axisPoints = hinge + (oldRudder[:, 1, None] - hinge[1]) / hingeAxis[1] * hingeAxis
mapped = (oldRudder - axisPoints) @ aft; chord = np.interp(oldRudder[:, 1], envelope[:, 0], envelope[:, 1])
maximum = shared['rudderPrimaryMaximumChordM']; peak = shared['rudderProfilePeakGltfY']; minimum = float(oldRudder[:, 1].min())
def Bump(y, low, high):
    t = np.clip((y-low)/(high-low), 0, 1)
    return np.where((y > low) & (y < high), np.sin(np.pi*t)**2, 0.)
def ChordDelta(amplitudes):
    upper, lower = amplitudes
    return (upper * Bump(oldRudder[:, 1], peak, shared['rudderProfileUpperEndGltfY']) * (maximum-chord if upper >= 0 else chord)
            + lower * Bump(oldRudder[:, 1], minimum, peak) * (maximum-chord if lower >= 0 else chord))
oldDelta = ChordDelta(oldShared['rudderProfileAmplitudes']); newDelta = ChordDelta(shared['rudderProfileAmplitudes'])
lo = np.zeros(len(mapped)); hi = np.maximum(chord, mapped + abs(oldDelta)) + .01
for iteration in range(42):
    u = (lo+hi)/2; t = np.clip(u/np.maximum(chord, 1e-9), 0, 1); value = u + oldDelta*t*t*(3-2*t)
    mask = value < mapped; lo = np.where(mask, u, lo); hi = np.where(mask, hi, u)
originalU = (lo+hi)/2; t = np.clip(originalU/np.maximum(chord, 1e-9), 0, 1)
newU = originalU + newDelta*t*t*(3-2*t)
newRudder = oldRudder + np.where(mapped > 0, newU-mapped, 0)[:, None]*aft
SetWorldVertices(rudder, Blender(newRudder))
assert abs(float(newRudder[:, 1].max()-newRudder[:, 1].min())-shared['rudderHeightM']) < 5e-6
rudder.data.calc_loop_triangles()
newSide = sum(abs((rudder.data.vertices[t.vertices[1]].co-rudder.data.vertices[t.vertices[0]].co).cross(rudder.data.vertices[t.vertices[2]].co-rudder.data.vertices[t.vertices[0]].co).x)/2 for t in rudder.data.loop_triangles)/2
# Integrate the independent outer-envelope change, not the post-pocket area.
edges=np.array([list(edge.vertices)for edge in rudder.data.edges]);ys=np.unique(np.round(oldRudder[:,1],6));ys=np.clip(ys,float(oldRudder[:,1].min())+2e-6,float(oldRudder[:,1].max())-2e-6)
def Envelope(points):
    line=hinge+(points[:,1,None]-hinge[1])/hingeAxis[1]*hingeAxis;q=np.c_[(points-line)@aft,points[:,1]];aa=q[edges[:,0]];bb=q[edges[:,1]];dd=bb-aa;values=[]
    for y in ys:
        mask=(np.minimum(aa[:,1],bb[:,1])<=y)&(np.maximum(aa[:,1],bb[:,1])>=y)&(abs(dd[:,1])>1e-10)
        hits=aa[:,0]+(y-aa[:,1])/np.where(abs(dd[:,1])>1e-10,dd[:,1],1)*dd[:,0];values.append(float(max(hits[mask])))
    return np.array(values)
rudder['referenceSideAreaBeforePocketM2'] += float(np.trapezoid(Envelope(newRudder)-Envelope(oldRudder),ys))
assert newSide >= rudder['referenceSideAreaBeforePocketM2']*.98

tailCenter = np.array(shared['tailSourceFrameCenterGltfM']); tailRear = tailCenter[2]-.025
oldDihedral = math.radians(oldShared['tailDihedralDegrees'])
def TipMap(points, side, value, inverse=False):
    table = np.array(shared['tailLeadingProfilesGltfAbsXAndZ']['tailFixedNear' if side == 'Right' else 'tailFixedFar'])
    span = np.abs(points[:, 0]); leading = np.interp(span, table[:, 0], table[:, 1]); b = np.clip((span-.98)/1.2, 0, 1)**2
    q = points.copy(); distance = np.maximum(tailRear-leading, 1e-6); amount = value*b
    if inverse:
        a = amount/distance
        q[:, 2] = np.where(q[:, 2] >= tailRear, q[:, 2], np.where(q[:, 2] <= leading+amount, q[:, 2]-amount, (q[:, 2]-a*tailRear)/np.maximum(1-a, .05)))
    else: q[:, 2] += amount*np.clip((tailRear-q[:, 2])/distance, 0, 1)
    return q
def OriginalTail(points, side, fixed):
    matrix = np.array(oldTailMatrices[side]); R = C@matrix[:3, :3]@C.T; translation = C@matrix[:3, 3]
    p = (np.asarray(points)-translation)@R + tailCenter; p[:, 0] *= math.cos(oldDihedral)
    return TipMap(p, side, oldShared['tailTipSweepM'], True) if fixed else p
def NewTail(points, side, fixed):
    p = TipMap(np.asarray(points), side, shared['tailTipSweepM']) if fixed else np.asarray(points).copy()
    p[:, 0] /= math.cos(math.radians(shared['tailDihedralDegrees']))
    sign = 1 if side == 'Right' else -1
    R = Rotation([0, 0, 1], sign*math.radians(shared['tailDihedralDegrees']))@Rotation([1, 0, 0], math.radians(shared['tailIncidenceDegrees']))
    return (p-tailCenter)@R.T+tailCenter+[0, shared['tailHeightOffsetM'], 0], p
for side in ['Left', 'Right']:
    fixed = bpy.data.objects['Tailplane_'+side]; elevator = bpy.data.objects['Elevator_'+side]
    targets = []
    for obj, isFixed in [(fixed, True), (elevator, False)]:
        original = OriginalTail(Gltf(WorldVertices(obj)), side, isFixed); desired, shaped = NewTail(original, side, isFixed); targets.append((obj, desired, shaped))
    sign = 1 if side == 'Right' else -1
    R = Rotation([0, 0, 1], sign*math.radians(shared['tailDihedralDegrees']))@Rotation([1, 0, 0], math.radians(shared['tailIncidenceDegrees']))
    frame = bpy.data.objects['Frame_HorizontalTail'+side+'V42']; frame.rotation_mode = 'QUATERNION'
    frame.rotation_quaternion = Matrix((C.T@R@C).tolist()).to_quaternion(); frame.location = Vector(Blender(tailCenter+np.array([0, shared['tailHeightOffsetM'], 0])))
    bpy.context.view_layer.update()
    for obj, desired, shaped in targets:
        SetWorldVertices(obj, Blender(desired)); uv = obj.data.uv_layers['UVMap']
        for loop in obj.data.loops:
            x, y, z = shaped[loop.vertex_index]; u = (x+2.18)/4.36; v = (-z-shared['originalTailForwardShiftM']+4.567)/1.60
            uv.data[loop.index].uv = ((16+u*4064)/4096, 1-(16+(1-v)*992)/2048)
finFrame = bpy.data.objects['Frame_VerticalTailIncidence']; unYaw = finFrame.matrix_world.inverted(); uv = rudder.data.uv_layers['UVMap']
for loop in rudder.data.loops:
    p = unYaw@(rudder.matrix_world@rudder.data.vertices[loop.vertex_index].co)+finFrame.matrix_world.translation
    u = (p.z-1.42)/1.8085; v = (p.y+4.70)/1.85; uv.data[loop.index].uv = ((16+u*4064)/4096, 1-(1040+(1-v)*992)/2048)

# Only the unprinted ring envelope changes; the engine case, bay and cap do not.
cowl = bpy.data.objects['Cowl_AnnularRing']; q = Gltf(WorldVertices(cowl)); origin = np.array([0, 1.81, -2.25]); R = Rotation([1, 0, 0], theta)
q = (q-origin)@R+origin; stationY = -q[:, 2]; w = np.clip((stationY-2.85)/.34, 0, 1); w = w*w*(3-2*w)
radial = q[:, :2]-[0, 1.81]; radius = np.linalg.norm(radial, axis=1)
q[:, :2] += radial/np.maximum(radius[:, None], 1e-12)*(shared['cowlFrontRadiusOffsetM']*w)[:, None]
q[:, 2] -= shared['cowlFrontForwardOffsetM']*w
SetWorldVertices(cowl, Blender((q-origin)@R.T+origin))
cowl['profileScope'] = 'Unprinted forward Townend-ring profile; engine548mm case/bay and propeller cap unchanged; surface rebake pending'

bodyTree = Tree(body); rodRows = []
for obj in cabane:
    lower, upper = oldRodCaps[obj.name]
    UpdateRod(obj, lower+Vector(Displacement(np.array(lower)[None, :])[0]), wingDelta@upper)
for obj in braces:
    side = 'Left' if obj.name.endswith('Left') else 'Right'; lower, upper = oldRodCaps[obj.name]
    original = OriginalTail(Gltf(np.array(upper)[None, :]), side, True); desired, _ = NewTail(original, side, True)
    UpdateRod(obj, lower+Vector(Displacement(np.array(lower)[None, :])[0]), Vector(Blender(desired)[0]), Tree(bpy.data.objects['Tailplane_'+side]))
for guide in list(bpy.data.objects):
    if not guide.name.startswith('SourceGuide_'): continue
    name = guide.name[len('SourceGuide_'):]
    if name in oldRodMatrices: guide.matrix_world = bpy.data.objects[name].matrix_world@oldRodMatrices[name].inverted()@guide.matrix_world
    elif any(obj.name == name for obj in engineObjects): guide.matrix_world = engineDelta@guide.matrix_world
    elif any(obj.name == name for obj in wingObjects): guide.matrix_world = wingDelta@guide.matrix_world
    elif name.startswith('Windscreen'):
        match = re.search(r'(?:Frame|SideFrame)([12])', name)
        if match: guide.matrix_world = Matrix.Translation(screenDeltas[int(match[1])])@guide.matrix_world
    elif name.startswith('Observer'): guide.matrix_world = Matrix.Translation(observerDelta)@guide.matrix_world

for folder in ['Textures', 'Scripts', 'Evidence', 'Exports']:(sourceRoot/folder).mkdir(parents=True, exist_ok=True)
propRecipe = json.loads((asset/'Data_PropellerSectionParameters.json').read_text(encoding='utf8'))
modulePath = scriptPath.with_name('Script_NakajimaKi4PropellerSection.py'); namespace = {'__file__': str(modulePath)}
exec(compile(modulePath.read_text(encoding='utf8'), str(modulePath), 'exec'), namespace)
parts = namespace['BuildPropellerSections'](root, propRecipe)
bakePath = scriptPath.with_name('Script_NakajimaKi4PropellerBake.py'); bakeNamespace = {'__file__': str(bakePath)}
exec(compile(bakePath.read_text(encoding='utf8'), str(bakePath), 'exec'), bakeNamespace)
image, aoRecord = bakeNamespace['BakePropellerAssemblyAo'](root, propRecipe, sourceRoot, scriptPath)
after = {obj.name: MeshFingerprint(obj) for obj in meshes}
protected = {name: value for name, value in before.items() if name not in allowed}
assert all(after[name] == value for name, value in protected.items())
assert len([im for im in bpy.data.images if im.packed_file]) == 42
assert all(hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest() == value for name, value in protectedImages.items())
points = np.concatenate([WorldVertices(obj) for obj in meshes]); dimensions = (points.max(0)-points.min(0))[[0, 2, 1]]
assert np.all(abs(dimensions-[12, 3.31, 8.25]) <= [.002, .04, .05]), dimensions
controls = [obj for obj in root.children_recursive if obj.name.startswith('Pivot_')]
assert len(controls) == 10
assert all(max(abs(value-1) for value in obj.matrix_world.to_scale()) < 2e-6 for obj in controls)
evaluated = EvaluatedTriangles(meshes); triangles = sum(evaluated.values()); assert triangles == 354832
root['version'] = parameters['version']; root['referenceFidelityPassed'] = False; root['canonicalPromoted'] = False
root['geometryAoPendingForChangedGeometry'] = True; root['propellerGeometryAoFresh'] = True
root['lowerExteriorOffsetsJson'] = json.dumps(shared['lowerExteriorOffsetsYM']); root['upperExteriorOffsetsJson'] = json.dumps(shared['upperExteriorOffsetsYM'])
root['sharedDatumCandidateJson'] = json.dumps({key: value for key, value in shared.items() if 'Envelope' not in key and 'Profiles' not in key})
root['engineAxisBlenderM'] = list(engineDelta@Vector(root['engineAxisBlenderM']))
root['tailElevatorAxisBlenderM'] = list(bpy.data.objects['Pivot_ElevatorRight'].matrix_world.translation)
root['wingDatumTransformBlenderMatrix'] = json.dumps([list(row) for row in wingFrame.matrix_world@Matrix.Translation(Vector((0, -1.2813982901, -2.8206334265)))])
root['engineDatumTransformBlenderMatrix'] = json.dumps([list(row) for row in engineFrame.matrix_world@Matrix.Translation(Vector((0, -2.25, -1.81)))])
root['geometryUpdateScope'] = parameters['scope']; root['cowlFrontForwardOffsetM'] = shared['cowlFrontForwardOffsetM']; root['cowlFrontRadiusOffsetM'] = shared['cowlFrontRadiusOffsetM']
root['propellerPhotographicShapeParametersJson'] = json.dumps(propRecipe['parameters'])
root['nominalDimensionsCandidateBlenderM'] = dimensions[[0, 2, 1]].tolist()
root['threePhotoParametersSha256'] = hashlib.sha256((asset/'Data_ThreePhotoShapeParameters.json').read_bytes()).hexdigest()
root['fuselageExteriorProfile'] = 'WholeAirframeV47SharedEnvelope'
root['propellerMaximumRotationRadiusM'] = max(math.hypot(p[0], p[1]) for part in parts for p in part['sampledLocalGltf'])
root['propellerDiameterM'] = 2*root['propellerMaximumRotationRadiusM']
bpy.context.scene['Ki4AirframeMutationInProgress'] = False
for path in [scriptPath, baseScript, modulePath, bakePath, scriptPath.with_name('Script_NakajimaKi4DatumCandidate.py'), scriptPath.with_name('Script_NakajimaKi4AoSeams.py'), scriptPath.with_name('Script_NakajimaKi4AoQuantize.py')]:
    text = bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name); text.clear(); text.write(path.read_text(encoding='utf8')); text.use_fake_user = True; shutil.copy2(path, sourceRoot/'Scripts'/path.name)
for path in [parameterPath, asset/'Data_PropellerSectionParameters.json', asset/'Data_ThreePhotoShapeParameters.json']:shutil.copy2(path, sourceRoot/'Scripts'/path.name)
targetSource = sourceRoot/'Scene_NakajimaKi4.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(targetSource))
sourceSha = hashlib.sha256(targetSource.read_bytes()).hexdigest(); assert hashlib.sha256(source.read_bytes()).hexdigest() == parameters['inputSourceSha256']

# Transient diagnostic export only; the editable author retains old pending AO.
neutralized = []
for material in bpy.data.materials:
    if not material.use_nodes: continue
    for node in list(material.node_tree.nodes):
        im = getattr(node, 'image', None)
        if im is None or im == image or not re.search(r'GeometryAo|HardwareAo|TireAo|ShoeAo|SkidAo', im.name, re.I): continue
        links = [link for link in material.node_tree.links if link.from_node == node]
        if not links: continue
        white = material.node_tree.nodes.new('ShaderNodeRGB'); white.label = 'DiagnosticOnly_OtherGeometryAoPending'; white.outputs[0].default_value = (1, 1, 1, 1)
        for link in links:
            socket = link.to_socket; material.node_tree.links.remove(link); material.node_tree.links.new(white.outputs[0], socket)
        neutralized.append({'material': material.name, 'image': im.name})
bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+list(root.children_recursive):obj.select_set(True)
bpy.context.view_layer.objects.active = root
options = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_normals=True, export_tangents=True, export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
pbrPath = asset/'Model_NakajimaKi4HighPbr.glb'; bpy.ops.export_scene.gltf(filepath=str(pbrPath), **options)
originalMaterials = {obj: list(obj.data.materials) for obj in meshes}; gray = bpy.data.materials.new('Material_Airframe47GrayDiagnostic'); gray.use_nodes = True
bsdf = gray.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value = (.32, .33, .32, 1); bsdf.inputs['Roughness'].default_value = .77
for obj in meshes:
    if any(mat and 'Windscreen' in mat.name for mat in obj.data.materials):continue
    for index in range(len(obj.data.materials)):obj.data.materials[index] = gray
grayPath = asset/'Model_NakajimaKi4HighGray.glb'; bpy.ops.export_scene.gltf(filepath=str(grayPath), **options)
for obj, mats in originalMaterials.items():
    for index, mat in enumerate(mats):obj.data.materials[index] = mat
proof = {'state': 'SavedWholeAirframeWorkingSource_PhysicalAndNativeChecksPending', 'version': parameters['version'], 'inputSourcePath': str(source), 'inputSourceSha256': parameters['inputSourceSha256'], 'sourcePath': str(targetSource), 'sourceSha256': sourceSha, 'pbrExportPath': str(pbrPath), 'pbrExportSha256': hashlib.sha256(pbrPath.read_bytes()).hexdigest(), 'grayExportPath': str(grayPath), 'grayExportSha256': hashlib.sha256(grayPath.read_bytes()).hexdigest(), 'sourceMeshes': 928, 'sourceMeshFingerprints': after, 'protectedUnchangedMeshes': len(protected), 'changedMeshes': [name for name in before if before[name] != after[name]], 'originalPackedImagesRetained': protectedImages, 'sourcePackedImages': 42, 'newImageName': image.name, 'newImageSha256': hashlib.sha256(image.packed_file.data).hexdigest(), 'evaluatedTriangles': triangles, 'nominalDimensionsGltfM': dimensions.tolist(), 'rodConnections': rodRows, 'propellerParts': parts, 'freshPropellerAo': aoRecord, 'otherGeometryAoNeutralizedOnlyInDiagnosticExport': neutralized, 'rudderSideAreaRetention': newSide/rudder['referenceSideAreaBeforePocketM2'], 'canonicalPromoted': False, 'referenceFidelityPassed': False, 'scope': parameters['scope']}
for path in [asset/'Evidence/Data_WholeAirframeAuthor.json', asset/'Evidence/Data_PropellerSectionAuthor.json', sourceRoot/'Evidence/Data_WholeAirframeAuthor.json', sourceRoot/'Evidence/Data_PropellerSectionAuthor.json']:path.write_text(json.dumps(proof, indent=2), encoding='utf8')
result = {key: proof[key] for key in ['state', 'sourceSha256', 'pbrExportSha256', 'grayExportSha256', 'evaluatedTriangles', 'nominalDimensionsGltfM']}; print(json.dumps(result))
