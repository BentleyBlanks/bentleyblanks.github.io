"""Rebuild the approved 1938 Sichuan folded single-blanket pack via BlenderMCP.

Run from the repository root with Script_BlenderMcp.mjs exec --file <this file>.
Native Blender: X right, Z up, -Y outward. glTF: X right, Y up, +Z outward.
The root is the centre of the planar body-contact surface, in metres.
Texture_SichuanBlanketPack is an imagegen-authored, four-material 1024 atlas.
"""
import bpy
import bmesh
import math
import json
import runpy
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repoCandidates=[Path.cwd(),Path(bpy.context.scene.get('SichuanPackRepository',''))]
if globals().get('__file__'):
    repoCandidates.insert(0,Path(__file__).resolve().parents[2])
repoPath=next((candidate.resolve() for candidate in repoCandidates if (candidate/'Taierzhuang1938/_blender/Script_SichuanBlanketPackBake.py').is_file()),None)
if repoPath is None:raise RuntimeError('Run this rebuild from the repository root')
projectPath = repoPath / 'Taierzhuang1938'
modelPath = projectPath / 'Model/SichuanBlanketPack'
sourcePath = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
reviewPath = repoPath / 'tmp/SichuanBlanketPack/Review'
for directory in (modelPath, sourcePath, reviewPath):
    directory.mkdir(parents=True, exist_ok=True)
if bpy.context.scene.get('BlenderMcpTask') != 'SichuanBlanketPack':
    raise RuntimeError('Refusing to replace a scene not owned by this task')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)
for material in list(bpy.data.materials):
    if material.users == 0: bpy.data.materials.remove(material)
scene = bpy.context.scene
scene['SichuanPackRepository'] = str(repoPath)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def MakeRoot(name, parent=None):
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = .025
    root.parent = parent
    return root

packRoot = MakeRoot('Pack_Root')
packRoot['Units'] = 'metres'
packRoot['ExportAxes'] = 'Y up; +Z outward; contact plane Z=0'
packRoot['Pivot'] = 'Centre of planar body-contact face'
packRoot['Reference'] = 'User-approved imagegen ThreeViewV02, 2026-10-18'
packRoot['NoModernHardware'] = True

images = {}
for channel in ('Base', 'Normal', 'Orm'):
    imagePath = modelPath / ('Texture_SichuanBlanketPack' + channel + '.webp')
    images[channel] = bpy.data.images.load(str(imagePath), check_existing=True)
    images[channel].colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
    images[channel].pack()

atlasRects = {'cloth':(.02,.52,.48,.98), 'straw':(.52,.52,.98,.98),
              'binding':(.02,.02,.48,.48), 'jacket':(.52,.02,.98,.48)}

def MakeMaterial(key, tint=(1,1,1,1), suffix=''):
    material = bpy.data.materials.new('Material_Sichuan' + key.title() + suffix)
    material.use_nodes = True
    material.diffuse_color = tint
    material['AtlasRegion'] = key
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .95
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    base = nodes.new('ShaderNodeTexImage'); base.image = images['Base']; base.label = '1024 sRGB imagegen atlas'
    if tint == (1,1,1,1):
        links.new(base.outputs['Color'], shader.inputs['Base Color'])
    else:
        multiply = nodes.new('ShaderNodeMix'); multiply.data_type = 'RGBA'; multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[7].default_value = tint
        links.new(base.outputs['Color'], multiply.inputs[6])
        links.new(multiply.outputs[2], shader.inputs['Base Color'])
    normal = nodes.new('ShaderNodeTexImage'); normal.image = images['Normal']
    normalMap = nodes.new('ShaderNodeNormalMap'); normalMap.inputs['Strength'].default_value = .48
    links.new(normal.outputs['Color'], normalMap.inputs['Color'])
    links.new(normalMap.outputs['Normal'], shader.inputs['Normal'])
    orm = nodes.new('ShaderNodeTexImage'); orm.image = images['Orm']
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], shader.inputs['Roughness'])
    links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    occlusion = nodes.new('ShaderNodeGroup'); occlusion.node_tree = group
    links.new(separate.outputs['Red'], occlusion.inputs['Occlusion'])
    return material

materials = {key: MakeMaterial(key) for key in atlasRects}
patchMaterial = MakeMaterial('cloth', (.76,.73,.68,1), 'Patch')

def CreateMesh(name, verts, faces, uvs, material, parent=None):
    mesh = bpy.data.meshes.new(name + 'Geometry')
    mesh.from_pydata(verts, [], faces); mesh.update()
    uvLayer = mesh.uv_layers.new(name='UVMap')
    rect = atlasRects[material['AtlasRegion']]
    for loop in mesh.loops:
        uValue, vValue = uvs[loop.vertex_index]
        uvLayer.data[loop.index].uv = (rect[0]+max(0,min(1,uValue))*(rect[2]-rect[0]), rect[1]+max(0,min(1,vValue))*(rect[3]-rect[1]))
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if name == 'Pack_Bundle':
        backFaces=[face for face in bm.faces if all(abs(vertex.co.y)<1e-7 for vertex in face.verts)]
        if backFaces and sum(face.normal.y*face.calc_area() for face in backFaces)<0:
            bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj)
    mesh.materials.append(material)
    obj.parent = parent
    for polygon in mesh.polygons: polygon.use_smooth = material['AtlasRegion'] != 'binding'
    if name == 'Pack_Bundle':
        # Give folded side and top faces their own projection; an X/Z-only
        # projection would stretch the front scan into horizontal side lines.
        for polygon in mesh.polygons:
            for loopIndex in polygon.loop_indices:
                point = mesh.vertices[mesh.loops[loopIndex].vertex_index].co
                if abs(polygon.normal.x) > .5:
                    uValue,vValue=(point.y+.13)/.13,(point.z+.15)/.30
                elif abs(polygon.normal.z) > .5:
                    uValue,vValue=(point.x+.19)/.38,(point.y+.13)/.13
                else:
                    uValue,vValue=(point.x+.19)/.38,(point.z+.15)/.30
                mesh.uv_layers.active.data[loopIndex].uv=(rect[0]+uValue*(rect[2]-rect[0]),rect[1]+vValue*(rect[3]-rect[1]))
    return obj

def AddRibbon(name, points, width, material, parent=None, axis='x'):
    widthVector = Vector((1,0,0) if axis == 'x' else (0,0,1))
    verts, faces, uvs = [], [], []
    for index, point in enumerate(points):
        for side in (-1,1):
            verts.append(tuple(Vector(point)+widthVector*width*.5*side))
            uvs.append(((side+1)/2, index/max(1,len(points)-1)))
    for index in range(len(points)-1): faces.append((2*index,2*index+1,2*index+3,2*index+2))
    return CreateMesh(name, verts, faces, uvs, material, parent)

def AddTube(name, points, radius, material, parent=None, sides=5):
    verts, faces, uvs = [], [], []
    for index, point in enumerate(points):
        tangent = Vector(points[min(index+1,len(points)-1)])-Vector(points[max(0,index-1)])
        tangent.normalize()
        ref = Vector((1,0,0)) if abs(tangent.x)<.8 else Vector((0,1,0))
        aVector = tangent.cross(ref).normalized(); bVector = tangent.cross(aVector).normalized()
        for side in range(sides):
            angle = side*math.tau/sides
            verts.append(tuple(Vector(point)+radius*(aVector*math.cos(angle)+bVector*math.sin(angle))))
            uvs.append((side/sides,index/max(1,len(points)-1)))
    for index in range(len(points)-1):
        for side in range(sides):
            aValue=index*sides+side; bValue=index*sides+(side+1)%sides
            faces.append((aValue,bValue,bValue+sides,aValue+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+side for side in range(sides))])
    return CreateMesh(name,verts,faces,uvs,material,parent)

def FrontDepth(xValue,zValue):
    edge = max(abs(xValue)/.19,abs(zValue)/.15)
    edgeRoll = .016*max(0,(edge-.85)/.15)**1.5
    wrinkle = .0014*math.sin(xValue*92+zValue*11)*math.sin(zValue*78)
    compression = .003*sum(math.exp(-((xValue-center)/.019)**2) for center in (-.103,.103))
    compression += .003*sum(math.exp(-((zValue-center)/.019)**2) for center in (.05,-.065))
    return -.127+edgeRoll+compression+wrinkle

# Gridded cloth face, shallow bowed sides and a genuinely planar full back.
xValues=[-.19,-.184,-.173,-.13,-.07,0,.07,.13,.173,.184,.19]
zValues=[-.15,-.144,-.133,-.10,-.05,0,.05,.10,.133,.144,.15]
verts=[]; uvs=[]; faces=[]
for zValue in zValues:
    for xValue in xValues:
        xPos,zPos=xValue,zValue
        cx,cz=.174,.134
        if abs(xPos)>cx and abs(zPos)>cz:
            delta=Vector((abs(xPos)-cx,abs(zPos)-cz)); delta=delta.normalized()*min(delta.length,.016)
            xPos=math.copysign(cx+delta.x,xPos); zPos=math.copysign(cz+delta.y,zPos)
        verts.append((xPos,FrontDepth(xPos,zPos),zPos));uvs.append(((xPos+.19)/.38,(zPos+.15)/.30))
for row in range(10):
    for col in range(10):
        aValue=row*11+col;faces.append((aValue,aValue+1,aValue+12,aValue+11))
perimeter=list(range(11))+[row*11+10 for row in range(1,11)]+[110+col for col in range(9,-1,-1)]+[row*11 for row in range(9,0,-1)]
previous=perimeter
for depth,inset in ((-.106,.007),(-.083,.001),(-.065,.007),(-.045,.001),(-.024,.006),(0,0)):
    current=[]
    for index in perimeter:
        xValue,_,zValue=verts[index]
        sideWeight=abs(xValue)/.19
        current.append(len(verts));verts.append((xValue-math.copysign(inset*sideWeight,xValue),depth,zValue))
        uvs.append(((xValue+.19)/.38,(zValue+.15)/.30))
    for index in range(len(perimeter)):
        nextIndex=(index+1)%len(perimeter)
        faces.append((previous[index],current[index],current[nextIndex],previous[nextIndex]))
    previous=current
backCenter=len(verts);verts.append((0,0,0));uvs.append((.5,.5))
for index in range(len(previous)):faces.append((backCenter,previous[(index+1)%len(previous)],previous[index]))
bundle=CreateMesh('Pack_Bundle',verts,faces,uvs,materials['cloth'],packRoot)
bundle['NominalDimensionsM']=[.38,.30,.13]
bundle['Construction']='One thin homespun cotton single blanket, folded; not a sewn bag'

# Thin rolled fold edges on both sides, visibly distinct from padding.
for sideSign in (-1,1):
    for layer in range(3):
        yValue=-.029-layer*.029
        points=[(sideSign*.185,yValue-.003,.120),(sideSign*.187,yValue,.11),(sideSign*.187,yValue,.03),(sideSign*.187,yValue,-.09),(sideSign*.181,yValue-.003,-.131),(sideSign*.168,yValue-.007,-.141)]
        AddTube('Pack_FoldEdge%s%d'%('Left' if sideSign<0 else 'Right',layer+1),points,.0021,materials['cloth'],bundle,sides=3)

# One hand-stitched patch; stitches are plain cotton, no metal fasteners.
patchVerts=[];patchUvs=[]
for zValue in (-.139,-.11,-.083):
    for xValue in (.126,.151,.176):
        patchVerts.append((xValue,-.1305,zValue));patchUvs.append(((xValue-.126)/.05,(zValue+.139)/.056))
patch=CreateMesh('Pack_RepairPatch',patchVerts,[(0,1,4,3),(1,2,5,4),(3,4,7,6),(4,5,8,7)],patchUvs,patchMaterial,bundle)
# The upper blanket fold overlaps the jacket corner, showing an actual tuck
# rather than presenting the blue corner as a sewn-on coloured patch.
CreateMesh('Pack_TurnedFoldLip',[(.120,-.1298,.144),(.172,-.1298,.144),(.122,-.1306,.094),(.119,-.122,.096)],[(0,1,2),(0,2,3)],[(.70,.90),(.95,.90),(.70,.65),(.68,.65)],materials['cloth'],bundle)
for edge in range(4):
    for stitch in range(4):
        fraction=.15+stitch*.23
        if edge<2:
            xValue=.13+fraction*.041;zValue=-.136 if edge==0 else -.087
            points=[(xValue-.001,-.1311,zValue-.0015),(xValue+.001,-.1311,zValue+.0015)]
        else:
            xValue=.130 if edge==2 else .172;zValue=-.133+fraction*.044
            points=[(xValue-.0013,-.1311,zValue-.001),(xValue+.0013,-.1311,zValue+.001)]
        AddRibbon('Pack_PatchStitch%d_%d'%(edge,stitch),points,.00065,materials['binding'],bundle)

# ONE connected long cloth strip: horizontal pass, vertical pass, shoulder
# loop, transfer on the rear, vertical pass, shoulder loop, second horizontal
# pass. The ends meet in a small side knot. No separate sewn harness.
bindingRoot=MakeRoot('Pack_Binding',packRoot)
stripPoints=[];stripAxes=[]
def StripPoint(point,axis): stripPoints.append(Vector(point));stripAxes.append(Vector((1,0,0) if axis=='x' else (0,0,1)))
for p in [(-.184,.001,.05),(-.195,-.017,.05),(-.195,-.11,.05),(-.175,-.134,.05),(.175,-.134,.05),(.195,-.11,.05),(.195,-.017,.05),(.178,.001,.05),(-.103,.002,.05)]: StripPoint(p,'z')
for p in [(-.103,.002,.11),(-.103,-.004,.151),(-.103,-.03,.155),(-.103,-.10,.155),(-.103,-.128,.137),(-.103,-.134,.11),(-.103,-.134,-.10),(-.103,-.126,-.142),(-.103,-.10,-.154),(-.103,-.025,-.154),(-.103,.002,-.137),(-.103,.004,-.115),(-.103,.06,-.113),(-.11,.10,-.06),(-.111,.112,.02),(-.108,.092,.10),(-.103,.04,.144),(-.103,.004,.146)]: StripPoint(p,'x')
for p in [(-.075,-.006,.132),(.075,-.006,.132),(.103,.004,.146)]: StripPoint(p,'z')
for p in [(.103,-.03,.155),(.103,-.10,.155),(.103,-.128,.137),(.103,-.134,.11),(.103,-.134,-.10),(.103,-.126,-.142),(.103,-.10,-.154),(.103,-.025,-.154),(.103,.002,-.137),(.103,.004,-.115),(.103,.06,-.113),(.11,.10,-.06),(.111,.112,.02),(.108,.092,.10),(.103,.04,.144),(.103,.004,.146),(.103,.002,.11),(.103,.002,-.065)]: StripPoint(p,'x')
for p in [(.177,.003,-.065),(.195,-.017,-.065),(.195,-.11,-.065),(.175,-.134,-.065),(-.175,-.134,-.065),(-.195,-.11,-.065),(-.195,-.017,-.065),(-.18,.002,-.065),(-.184,.003,.025),(-.191,-.007,.049)]: StripPoint(p,'z')
# Split at UV-repeat boundaries as well as geometric bends. That keeps the
# weave at cotton scale without stretching a quarter-atlas over a long pass.
originalPoints,originalAxes=stripPoints,stripAxes
stripPoints=[originalPoints[0]];stripAxes=[originalAxes[0]];pathDistances=[0.0]
distance=0.0;repeatLength=.18
for index in range(len(originalPoints)-1):
    start,end=originalPoints[index],originalPoints[index+1]
    length=(end-start).length
    fractions={step/max(1,math.ceil(length/.045)) for step in range(1,max(1,math.ceil(length/.045))+1)}
    seam=(math.floor(distance/repeatLength)+1)*repeatLength
    while seam<distance+length-1e-7:
        fractions.add((seam-distance)/length);seam+=repeatLength
    for fraction in sorted(fractions):
        stripPoints.append(start.lerp(end,fraction))
        stripAxes.append(originalAxes[index].lerp(originalAxes[index+1],fraction).normalized())
        pathDistances.append(distance+fraction*length)
    distance+=length
bpy.context.view_layer.update()
bundleBvh=BVHTree.FromObject(bundle,bpy.context.evaluated_depsgraph_get())
for point in stripPoints:
    if point.y<-.122 and abs(point.x)<.18 and abs(point.z)<.145:
        depths=[]
        for dx,dz in ((0,0),(-.013,0),(.013,0),(0,-.013),(0,.013)):
            hit=bundleBvh.ray_cast(Vector((point.x+dx,-.25,point.z+dz)),Vector((0,1,0)),.3)
            if hit[0] is not None: depths.append(hit[0].y)
        if depths:point.y=min(depths)-.0025
stripVerts=[];stripFaces=[];stripUvs=[]
for index,point in enumerate(stripPoints):
    tangent=stripPoints[min(index+1,len(stripPoints)-1)]-stripPoints[max(0,index-1)]
    tangent.normalize();widthVector=stripAxes[index]-tangent*stripAxes[index].dot(tangent)
    if widthVector.length<.01: widthVector=tangent.cross(Vector((0,1,0)))
    widthVector.normalize();normal=tangent.cross(widthVector).normalized()
    for aValue,bValue in [(-1,-1),(1,-1),(1,1),(-1,1)]:
        stripVerts.append(tuple(point+widthVector*.0125*aValue+normal*.0007*bValue))
        stripUvs.append((.42+.16*(aValue+1)/2,(pathDistances[index]/repeatLength)%1))
for index in range(len(stripPoints)-1):
    for side in range(4):
        aValue=index*4+side;bValue=index*4+(side+1)%4;stripFaces.append((aValue,bValue,bValue+4,aValue+4))
stripFaces.extend([(3,2,1,0),tuple((len(stripPoints)-1)*4+i for i in range(4))])
binding=CreateMesh('Pack_ContinuousClothStrap',stripVerts,stripFaces,stripUvs,materials['binding'],bindingRoot)
rect=atlasRects['binding']
for polygon in binding.data.polygons:
    minDistance=min(pathDistances[binding.data.loops[loopIndex].vertex_index//4] for loopIndex in polygon.loop_indices)
    tile=math.floor((minDistance+1e-7)/repeatLength)
    for loopIndex in polygon.loop_indices:
        vertexIndex=binding.data.loops[loopIndex].vertex_index
        uValue=.42+.16*(1 if vertexIndex%4 in (1,2) else 0)
        vValue=max(0,min(1,pathDistances[vertexIndex//4]/repeatLength-tile))
        binding.data.uv_layers.active.data[loopIndex].uv=(rect[0]+uValue*(rect[2]-rect[0]),rect[1]+vValue*(rect[3]-rect[1]))
binding['ContinuousStrip']=True
binding['OuterGridPasses']=[2,2]
binding['ShoulderLoops']=2
AddTube('Pack_SideClothKnot',[(-.194,-.014,.055),(-.201,-.022,.061),(-.2,-.032,.054),(-.192,-.024,.048),(-.194,-.014,.055)],.0038,materials['binding'],bindingRoot,sides=5)
AddRibbon('Pack_SideKnotTail',[(-.197,-.021,.05),(-.202,-.028,.019),(-.207,-.031,-.003)],.019,materials['binding'],bindingRoot,axis='z')

# Complete civilian short jacket, concealed inside the fold except one upper
# corner. It remains a single independent assembly when pulled out.
jacketRoot=MakeRoot('Pack_Jacket',packRoot)
jacketRoot['Control']='Hide this node or translate it upward/outward to withdraw the original garment'
jacketRoot['Garment']='Civilian indigo homespun short jacket; cloth knot button'
outline=[(-.035,.12),(-.075,.12),(-.098,.101),(-.158,.061),(-.145,.015),(-.082,.046),(-.076,-.116),(.078,-.116),(.083,.046),(.145,.014),(.159,.061),(.099,.101),(.075,.12),(.035,.12),(.025,.10),(-.025,.10)]
jacketVerts=[];jacketUvs=[]
def JacketY(xValue,zValue,back=False):
    return -.049+(.003 if back else 0)
for back in (False,True):
    for xValue,zValue in outline:
        jacketVerts.append((xValue+.015,JacketY(xValue,zValue,back),zValue+.012));jacketUvs.append(((xValue+.16)/.32,(zValue+.12)/.25))
length=len(outline)
jacketFaces=[tuple(range(length)),tuple(reversed(range(length,length*2)))]
for index in range(length):jacketFaces.append((index,(index+1)%length,(index+1)%length+length,index+length))
# An attached folded upper corner reaches out of the blanket fold, while the
# full jacket remains inside. These triangles share the shoulder edge.
cornerStart=len(jacketVerts)
jacketVerts.extend([(.125,-.129,.142),(.178,-.129,.142),(.178,-.129,.082)])
jacketUvs.extend([(.62,.92),(.94,.92),(.94,.60)])
jacketFaces.extend([(11,cornerStart,cornerStart+1),(11,cornerStart+1,cornerStart+2),(11,cornerStart+2,12),(cornerStart,cornerStart+1,cornerStart+2)])
jacket=CreateMesh('Pack_IndigoShortJacket',jacketVerts,jacketFaces,jacketUvs,materials['jacket'],jacketRoot)
# Front opening seam and a small folded hem are geometric, not printed labels.
AddRibbon('Pack_JacketFrontPlacket',[(.016,-.052,-.10),(.016,-.052,.07),(.027,-.056,.10)],.009,materials['jacket'],jacketRoot)
buttonCenter=Vector((.157,-.132,.12))
buttonPoints=[]
for index in range(9):
    angle=index*math.tau/8
    buttonPoints.append(tuple(buttonCenter+Vector((math.cos(angle)*.0042,math.sin(angle)*.0018,math.sin(angle)*.003))))
AddTube('Pack_ClothKnotButton',buttonPoints,.0015,materials['jacket'],jacketRoot,sides=4)
AddTube('Pack_ClothButtonLoop',[(.160,-.132,.120),(.169,-.132,.123),(.171,-.131,.119),(.162,-.131,.117)],.001,materials['jacket'],jacketRoot,sides=4)

BuildAttachments=runpy.run_path(str(projectPath/'_blender/Script_SichuanPackAttachments.py'))['BuildAttachments']
attachments=BuildAttachments(CreateMesh,AddRibbon,AddTube,materials)
for obj in attachments: obj.parent=packRoot

# Keep only five independently controlled assemblies and a small material
# palette. Joining geometry does not change visibility/extraction contracts.
for assembly in (bundle,bindingRoot,jacketRoot,*attachments):
    meshes=[obj for obj in [assembly,*assembly.children_recursive] if obj.type=='MESH']
    if len(meshes)>1:
        bpy.ops.object.select_all(action='DESELECT')
        active=assembly if assembly.type=='MESH' else meshes[0]
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=active
        bpy.ops.object.join()

# Persist the exact rebuild recipe inside the external .blend too.
for filename in ('Script_SichuanBlanketPackBake.py','Script_SichuanPackAttachments.py'):
    text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename)
    text.clear();text.write((projectPath/'_blender'/filename).read_text(encoding='utf-8'))
triangles={}
for root in (bundle,bindingRoot,jacketRoot,*attachments):
    count=0
    for obj in [root,*root.children_recursive]:
        if obj.type=='MESH':obj.data.calc_loop_triangles();count+=len(obj.data.loop_triangles)
    triangles[root.name]=count
if sum(triangles.values())>3000:raise RuntimeError('All-parts triangle budget exceeded: '+str(triangles))
packRoot['TotalTriangles']=sum(triangles.values())
packRoot['TrianglesByPart']=json.dumps(triangles)
bpy.ops.object.select_all(action='DESELECT')
for obj in [packRoot,*packRoot.children_recursive]:obj.select_set(True)
bpy.context.view_layer.objects.active=packRoot
bpy.ops.export_scene.gltf(filepath=str(modelPath/'Model_SichuanBlanketPack.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_image_format='AUTO',export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False)
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world.color=(.20,.20,.20)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='MATERIAL'
            space.region_3d.view_location=Vector((-.015,-.04,.025))
            space.region_3d.view_distance=.82
            space.region_3d.view_rotation=Vector((.55,-1,.35)).to_track_quat('Z','Y')
bpy.ops.wm.save_as_mainfile(filepath=str(sourcePath/'Scene_SichuanBlanketPack.blend'))
(reviewPath/'Data_BlenderBuild.json').write_text(json.dumps({'triangles':triangles,'totalTriangles':sum(triangles.values()),'blend':bpy.data.filepath,'glb':str(modelPath/'Model_SichuanBlanketPack.glb'),'nativeAxes':'Z up; -Y outward','exportAxes':'Y up; +Z outward; back Z=0','unitScale':1},indent=2),encoding='utf-8')
print('SICHUAN_PACK_BUILD',json.dumps(triangles),'TOTAL',sum(triangles.values()),'BLEND',bpy.data.filepath)
