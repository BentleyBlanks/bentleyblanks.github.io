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
import hashlib
import subprocess
import shutil
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
for oldImage in list(bpy.data.images):
    if oldImage.users==0 and 'SichuanBlanketPack' in oldImage.name:bpy.data.images.remove(oldImage)
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
    imagePath = sourcePath / 'Source/MaterialAtlasV03' / ('Texture_SichuanBlanketPack' + channel + '.webp')
    images[channel] = bpy.data.images.load(str(imagePath), check_existing=False)
    images[channel].colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
    images[channel].pack()

atlasRects = {'cloth':(.02,.52,.48,.98), 'straw':(.52,.52,.98,.98),
              'binding':(.02,.02,.48,.48), 'jacket':(.52,.02,.98,.48)}
referenceImage=bpy.data.images.load(str(sourcePath/'Source/Image_SichuanBlanketPackThreeViewV02.png'),check_existing=False)
referenceImage.colorspace_settings.name='sRGB'
subprocess.run([shutil.which('python'),str(projectPath/'_import/Script_SichuanPackReferenceCloth.py'),'--reference',str(sourcePath/'Source/Image_SichuanBlanketPackThreeViewV02.png'),'--out',str(sourcePath/'Source/MaterialAtlasV03')],check=True)
cottonBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonBase.png'),check_existing=False)
cottonBackBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonBackBase.png'),check_existing=False)
cottonNormal=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonNormal.png'),check_existing=False);cottonNormal.colorspace_settings.name='Non-Color'
patchBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferencePatchBase.png'),check_existing=False)

def MakeMaterial(key, tint=(1,1,1,1), suffix='', normalStrength=.85):
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
    baseColor=base.outputs['Color']
    if key=='cloth':
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        subtract=nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT';subtract.inputs[1].default_value=(.02,.52,0)
        repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY';repeat.inputs[1].default_value=(2.55/.46,4.38/.46,1)
        fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION'
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(236/1774,114/887,1)
        offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(248/1774,1-508/887,0)
        sample=nodes.new('ShaderNodeTexImage');sample.image=referenceImage;sample.label='Approved imagegen cotton: unshadowed interior swatch'
        links.new(uv.outputs['UV'],subtract.inputs[0]);links.new(subtract.outputs[0],repeat.inputs[0]);links.new(repeat.outputs[0],fract.inputs[0]);links.new(fract.outputs[0],scale.inputs[0]);links.new(scale.outputs[0],offset.inputs[0]);links.new(offset.outputs[0],sample.inputs['Vector'])
        mix=nodes.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.30;links.new(sample.outputs['Color'],mix.inputs[1]);links.new(baseColor,mix.inputs[2]);baseColor=mix.outputs[0]
        plain=nodes.new('ShaderNodeUVMap');plain.uv_map='UVMap'
        origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(.02,.52,0)
        normalize=nodes.new('ShaderNodeVectorMath');normalize.operation='MULTIPLY';normalize.inputs[1].default_value=(1/.46,1/.46,1)
        links.new(plain.outputs['UV'],origin.inputs[0]);links.new(origin.outputs[0],normalize.inputs[0]);clothVector=normalize.outputs[0]
        colour=nodes.new('ShaderNodeTexImage');colour.image=patchBase if suffix=='Patch' else cottonBackBase if suffix=='Back' else cottonBase;colour.extension='EXTEND';links.new(clothVector,colour.inputs['Vector']);baseColor=colour.outputs['Color']
    if key=='straw':
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(.52,.52,0)
        repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY';repeatCount=3 if suffix=='Sandal' else 2;repeat.inputs[1].default_value=(repeatCount/.46,repeatCount/.46,1)
        fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION'
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(.46,.46,1)
        offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(.52,.52,0)
        links.new(uv.outputs['UV'],origin.inputs[0]);links.new(origin.outputs[0],repeat.inputs[0]);links.new(repeat.outputs[0],fract.inputs[0]);links.new(fract.outputs[0],scale.inputs[0]);links.new(scale.outputs[0],offset.inputs[0]);strawVector=offset.outputs[0];links.new(strawVector,base.inputs['Vector'])
    if key=='binding':
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        subtract=nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT';subtract.inputs[1].default_value=(.2132,.02,0)
        repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY';repeat.inputs[1].default_value=(1.8/.0736,3.1/.46,1)
        fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION'
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(23/1774,97/887,1)
        offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(209/1774,1-315/887,0)
        sample=nodes.new('ShaderNodeTexImage');sample.image=referenceImage
        links.new(uv.outputs['UV'],subtract.inputs[0]);links.new(subtract.outputs[0],repeat.inputs[0]);links.new(repeat.outputs[0],fract.inputs[0]);links.new(fract.outputs[0],scale.inputs[0]);links.new(scale.outputs[0],offset.inputs[0]);links.new(offset.outputs[0],sample.inputs['Vector'])
        mix=nodes.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.25;links.new(sample.outputs['Color'],mix.inputs[1]);links.new(baseColor,mix.inputs[2]);baseColor=mix.outputs[0]
    if key=='binding':
        neutral=nodes.new('ShaderNodeHueSaturation');neutral.inputs['Saturation'].default_value=.25;neutral.inputs['Value'].default_value=.95
        links.new(baseColor,neutral.inputs['Color']);baseColor=neutral.outputs['Color']
    if key=='straw':
        aged=nodes.new('ShaderNodeHueSaturation');aged.inputs['Saturation'].default_value=.85;aged.inputs['Value'].default_value=1
        links.new(baseColor,aged.inputs['Color']);baseColor=aged.outputs['Color']
    if suffix=='Button':
        faded=nodes.new('ShaderNodeMixRGB');faded.inputs[0].default_value=.35;faded.inputs[2].default_value=(.16,.18,.23,1)
        links.new(baseColor,faded.inputs[1]);baseColor=faded.outputs[0]
    if tint == (1,1,1,1):
        links.new(baseColor, shader.inputs['Base Color'])
    else:
        multiply = nodes.new('ShaderNodeMix'); multiply.data_type = 'RGBA'; multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[7].default_value = tint
        links.new(baseColor, multiply.inputs[6])
        links.new(multiply.outputs[2], shader.inputs['Base Color'])
    normal = nodes.new('ShaderNodeTexImage'); normal.image = images['Normal']
    if key=='straw':links.new(strawVector,normal.inputs['Vector'])
    if key=='cloth':normal.image=cottonNormal;normal.extension='EXTEND';links.new(clothVector,normal.inputs['Vector'])
    normalMap = nodes.new('ShaderNodeNormalMap'); normalMap.inputs['Strength'].default_value = normalStrength
    links.new(normal.outputs['Color'], normalMap.inputs['Color'])
    links.new(normalMap.outputs['Normal'], shader.inputs['Normal'])
    if suffix=='End' and key=='straw':
        geometry=nodes.new('ShaderNodeNewGeometry')
        subtract=nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT';subtract.inputs[1].default_value=(0,-.067,.186)
        split=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],subtract.inputs[0]);links.new(subtract.outputs[0],split.inputs[0])
        y2=nodes.new('ShaderNodeMath');y2.operation='MULTIPLY';links.new(split.outputs['Y'],y2.inputs[0]);links.new(split.outputs['Y'],y2.inputs[1])
        z2=nodes.new('ShaderNodeMath');z2.operation='MULTIPLY';links.new(split.outputs['Z'],z2.inputs[0]);links.new(split.outputs['Z'],z2.inputs[1])
        add=nodes.new('ShaderNodeMath');add.operation='ADD';links.new(y2.outputs[0],add.inputs[0]);links.new(z2.outputs[0],add.inputs[1])
        radius=nodes.new('ShaderNodeMath');radius.operation='SQRT';links.new(add.outputs[0],radius.inputs[0])
        radiusOffset=nodes.new('ShaderNodeMath');radiusOffset.operation='SUBTRACT';radiusOffset.inputs[1].default_value=.004;links.new(radius.outputs[0],radiusOffset.inputs[0])
        pitch=nodes.new('ShaderNodeMath');pitch.operation='DIVIDE';pitch.inputs[1].default_value=.00875;links.new(radiusOffset.outputs[0],pitch.inputs[0])
        angle=nodes.new('ShaderNodeMath');angle.operation='ARCTAN2';links.new(split.outputs['Z'],angle.inputs[0]);links.new(split.outputs['Y'],angle.inputs[1])
        phase=nodes.new('ShaderNodeMath');phase.operation='MULTIPLY_ADD';phase.inputs[1].default_value=1/math.tau;phase.inputs[2].default_value=-.45/math.tau;links.new(angle.outputs[0],phase.inputs[0])
        spiral=nodes.new('ShaderNodeMath');spiral.operation='SUBTRACT';links.new(pitch.outputs[0],spiral.inputs[0]);links.new(phase.outputs[0],spiral.inputs[1])
        radians=nodes.new('ShaderNodeMath');radians.operation='MULTIPLY';radians.inputs[1].default_value=math.tau;links.new(spiral.outputs[0],radians.inputs[0])
        crest=nodes.new('ShaderNodeMath');crest.operation='COSINE';links.new(radians.outputs[0],crest.inputs[0])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0008;bump.inputs['Strength'].default_value=.7;links.new(crest.outputs[0],bump.inputs['Height']);links.new(normalMap.outputs['Normal'],bump.inputs['Normal']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
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
materials['strawEnd']=MakeMaterial('straw',(.68,.66,.62,1),'End')
materials['sandal']=MakeMaterial('straw',suffix='Sandal')
patchMaterial = MakeMaterial('cloth', (1,1,1,1), 'Patch', .16)
backMaterial = MakeMaterial('cloth', suffix='Back', normalStrength=.06)
foldMaterial = MakeMaterial('cloth', suffix='Fold', normalStrength=.48)
stitchMaterial=MakeMaterial('binding',(.35,.30,.25,1),'Stitch',.20)
buttonMaterial=MakeMaterial('jacket',suffix='Button')

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
    if name=='Pack_ContinuousClothStrap':
        for face in bm.faces:
            if face.calc_center_median().y<-.08 and face.normal.y>0:face.normal_flip()
    if name.startswith('Pack_FoldEdge'):
        sign=-1 if 'Left' in name else 1
        for face in bm.faces:
            if face.normal.x*sign<0:face.normal_flip()
    if name.startswith('Pack_ClothGather'):
        for face in bm.faces:
            if face.normal.y>0:face.normal_flip()
    if name == 'Pack_Bundle':
        backFaces=[face for face in bm.faces if all(abs(vertex.co.y)<1e-7 for vertex in face.verts)]
        if backFaces and sum(face.normal.y*face.calc_area() for face in backFaces)<0:
            bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj)
    mesh.materials.append(material)
    obj.parent = parent
    for polygon in mesh.polygons: polygon.use_smooth = True
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
    edgeRoll = .014*max(0,(edge-.80)/.20)**1.6
    wrinkle = .0013*math.sin(xValue*57+zValue*21)*math.sin(zValue*61-.4)
    puff=0
    for left,right in ((-.19,-.116),(-.09,.076),(.102,.19)):
        if left<xValue<right:
            for bottom,top in ((-.15,-.073),(-.047,.037),(.063,.15)):
                if bottom<zValue<top:
                    puff=math.sin(math.pi*(xValue-left)/(right-left))**.6*math.sin(math.pi*(zValue-bottom)/(top-bottom))**.6
    cornerPocket=.012*max(0,min(1,(xValue-.08)/.07))*max(0,min(1,(zValue-.07)/.06))
    return max(-.130,-.1165-.013*puff+edgeRoll+wrinkle+cornerPocket)

# Gridded cloth face, shallow bowed sides and a genuinely planar full back.
xValues=[-.19,-.184,-.166,-.13,-.116,-.103,-.090,-.056,-.012,.04,.076,.089,.102,.13,.166,.184,.19]
zValues=[-.15,-.138,-.10,-.073,-.060,-.047,-.015,.037,.05,.063,.11,.138,.15]
verts=[]; uvs=[]; faces=[]
for zValue in zValues:
    for xValue in xValues:
        xPos,zPos=xValue,zValue
        cx,cz=.168,.128
        if abs(xPos)>cx and abs(zPos)>cz:
            delta=Vector((abs(xPos)-cx,abs(zPos)-cz)); delta=delta.normalized()*min(delta.length,.022)
            xPos=math.copysign(cx+delta.x,xPos); zPos=math.copysign(cz+delta.y,zPos)
        xPos-=math.copysign(.004*(.5+.5*math.sin(zPos*26+(.4 if xPos<0 else 2.3)))*(abs(xPos)/.19)**6,xPos)
        zPos-=math.copysign(.0033*(.5+.5*math.sin(xPos*29+.8))*(abs(zPos)/.15)**8,zPos)
        verts.append((xPos,FrontDepth(xPos,zPos),zPos));uvs.append(((xPos+.19)/.38,(zPos+.15)/.30))
nx,nz=len(xValues),len(zValues)
for row in range(nz-1):
    for col in range(nx-1):
        aValue=row*nx+col;faces.append((aValue,aValue+1,aValue+nx+1,aValue+nx))
perimeter=list(range(nx))+[row*nx+nx-1 for row in range(1,nz)]+[(nz-1)*nx+col for col in range(nx-2,-1,-1)]+[row*nx for row in range(nz-2,0,-1)]
previous=perimeter
for depth,inset in ((-.105,.014),(-.030,.016),(0,0)):
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
bundle.data.materials.append(backMaterial)
bundle.data.materials.append(foldMaterial)
for polygon in bundle.data.polygons:
    if all(abs(bundle.data.vertices[index].co.y)<1e-7 for index in polygon.vertices):polygon.material_index=1;polygon.use_smooth=False
    elif abs(polygon.normal.x)>.40 or abs(polygon.normal.z)>.65:polygon.material_index=2
bundle['NominalDimensionsM']=[.38,.30,.13]
bundle['Construction']='One thin homespun cotton single blanket, folded; not a sewn bag'

# The cut end of the folded blanket has nested U-shaped cloth edges. These
# stand in front of the recessed end surface, rather than being buried lines.
foldProfiles=[
    [(-.024,.123),(-.056,.132),(-.093,.129),(-.112,.113),(-.117,.073),(-.119,.012),(-.116,-.070),(-.111,-.119),(-.093,-.137),(-.060,-.142),(-.028,-.132),(-.016,-.106),(-.014,-.04),(-.017,.075)],
    [(-.041,.081),(-.043,.110),(-.057,.119),(-.078,.113),(-.087,.083),(-.088,.018),(-.086,-.063),(-.081,-.114),(-.065,-.129),(-.047,-.123),(-.037,-.103),(-.036,-.02),(-.038,.066)],
    [(-.057,.078),(-.059,.095),(-.068,.097),(-.074,.078),(-.073,.022),(-.069,-.047),(-.068,-.103),(-.062,-.116),(-.055,-.106),(-.053,-.025),(-.054,.055)]
]
for sideSign in (-1,1):
    for layer,profile in enumerate(foldProfiles[:1] if sideSign<0 else foldProfiles):
        points=[]
        for index in range(len(profile)-1):
            p0=Vector(profile[max(0,index-1)]);p1=Vector(profile[index]);p2=Vector(profile[index+1]);p3=Vector(profile[min(len(profile)-1,index+2)])
            samples=1 if sideSign<0 else 2
            for step in range(samples):
                t=step/samples
                points.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
        points.append(Vector(profile[-1]))
        foldVerts=[];foldUvs=[];foldFaces=[]
        width=.0105-layer*.0014
        foldDistances=[0.0]
        for index in range(1,len(points)):foldDistances.append(foldDistances[-1]+(points[index]-points[index-1]).length)
        for index,point in enumerate(points):
            tangent=(points[min(index+1,len(points)-1)]-points[max(0,index-1)]).normalized()
            across=Vector((-tangent.y,tangent.x))
            for s in (-1,-.45,.45,1):
                pressure=sum(math.exp(-((point.y-z)/.020)**2) for z in (.05,-.060))
                spread=width*(1+.16*math.sin(point.y*41+layer*1.3))*(1-pressure*.12)
                cross=point+across*spread*s
                cross.x+=.0026*math.sin(cross.y*47+layer*1.4)*(1-.5*pressure)
                taper=.008*max(0,min(1,(abs(cross.y)-.12)/.03))**2
                roundness=min(1,((1-abs(s))/.55)**.65)
                xValue=sideSign*(min(.1898,.173+roundness*.0168+.0013*math.sin(index*.71+layer)-.0021*pressure)-taper)
                foldVerts.append((xValue,cross.x,max(-.1485,min(.1485,cross.y))));foldUvs.append((.35+.12*(s+1)/2,(foldDistances[index]/.32)%1))
        for index in range(len(points)-1):
            for cell in range(3):
                a=index*4+cell;foldFaces.append((a,a+1,a+5,a+4))
        foldObject=CreateMesh('Pack_FoldEdge%s%d'%('Left' if sideSign<0 else 'Right',layer+1),foldVerts,foldFaces,foldUvs,foldMaterial,bundle)
        for polygon in foldObject.data.polygons:
            tile=math.floor((min(foldDistances[foldObject.data.loops[i].vertex_index//4] for i in polygon.loop_indices)+1e-7)/.32)
            for loopIndex in polygon.loop_indices:
                vertexIndex=foldObject.data.loops[loopIndex].vertex_index
                u=.35+.12*(vertexIndex%4)/3
                v=max(0,min(1,foldDistances[vertexIndex//4]/.32-tile))
                foldObject.data.uv_layers.active.data[loopIndex].uv=(.02+.46*u,.52+.46*v)

bpy.context.view_layer.update()
surfaceBvh=BVHTree.FromObject(bundle,bpy.context.evaluated_depsgraph_get())
def SurfaceDepth(xValue,zValue,offset=.0016):
    hit=surfaceBvh.ray_cast(Vector((xValue,-.25,zValue)),Vector((0,1,0)),.30)
    return (hit[0].y if hit[0] is not None else FrontDepth(xValue,zValue))-offset

gatherLines=[(-.180,.120,-.125,.086),(-.17,.011,-.115,.029),(-.18,-.126,-.12,-.087),(-.068,.133,-.021,.084),(-.067,.028,.016,.005),(-.028,-.057,.035,-.041),(.020,-.131,.071,-.094),(.179,.027,.119,.040),(.181,-.109,.119,-.084),(.15,-.015,.118,-.039)]
gatherLines=[gatherLines[index] for index in (0,2,4,6,7,8)]
for number,(ax,az,bx,bz) in enumerate(gatherLines):
    start=Vector((ax,az));end=Vector((bx,bz));tangent=(end-start).normalized();across=Vector((-tangent.y,tangent.x))
    gatherVerts=[];gatherUvs=[];gatherFaces=[]
    for step in range(5):
        t=step/4;point=start.lerp(end,t)+across*(.003*math.sin(t*math.pi)*(1 if number%2 else -1))
        for s in (-1,0,1):
            p=point+across*s*(.0015+.0035*math.sin(t*math.pi))
            height=.0025*math.sin(t*math.pi)**1.2*(1-s*s)
            depth=max(-.1315,SurfaceDepth(p.x,p.y,0)-height)
            gatherVerts.append((p.x,depth,p.y));gatherUvs.append(((p.x+.19)/.38,(p.y+.15)/.30))
    for step in range(4):
        for cross in range(2):
            a=step*3+cross;gatherFaces.append((a,a+1,a+4,a+3))
    CreateMesh('Pack_ClothGather%02d'%number,gatherVerts,gatherFaces,gatherUvs,materials['cloth'],bundle)

# One hand-stitched patch; stitches are plain cotton, no metal fasteners.
patchVerts=[];patchUvs=[]
for zValue in (-.134,-.105,-.078):
    for xValue in (.126,.151,.176):
        patchVerts.append((xValue,SurfaceDepth(xValue,zValue),zValue));patchUvs.append(((xValue-.126)/.05,(zValue+.134)/.056))
patch=CreateMesh('Pack_RepairPatch',patchVerts,[(0,1,4,3),(1,2,5,4),(3,4,7,6),(4,5,8,7)],patchUvs,patchMaterial,bundle)
# The upper blanket fold overlaps the jacket corner, showing an actual tuck
# rather than presenting the blue corner as a sewn-on coloured patch.
lipVerts=[];lipUvs=[];lipFaces=[]
for step in range(6):
    t=step/5
    for across in range(3):
        s=across/2
        xValue=.111+.066*t+.012*s
        zValue=.140-.067*t+.009*s
        depth=max(-.129,min(-.122,FrontDepth(xValue,zValue)-.006))-.0016*math.sin(s*math.pi)
        lipVerts.append((xValue,depth,zValue));lipUvs.append(((xValue+.19)/.38,(zValue+.15)/.30))
for step in range(5):
    for across in range(2):
        index=step*3+across;lipFaces.append((index,index+1,index+4,index+3))
CreateMesh('Pack_TurnedFoldLip',lipVerts,lipFaces,lipUvs,foldMaterial,bundle)
for edge in range(4):
    for stitch in range(4):
        fraction=.15+stitch*.23
        if edge<2:
            xValue=.13+fraction*.041;zValue=-.131 if edge==0 else -.082
            points=[(xValue-.001,SurfaceDepth(xValue-.001,zValue-.0015,.0025),zValue-.0015),(xValue+.001,SurfaceDepth(xValue+.001,zValue+.0015,.0025),zValue+.0015)]
        else:
            xValue=.130 if edge==2 else .172;zValue=-.128+fraction*.044
            points=[(xValue-.0013,SurfaceDepth(xValue-.0013,zValue-.001,.0025),zValue-.001),(xValue+.0013,SurfaceDepth(xValue+.0013,zValue+.001,.0025),zValue+.001)]
        AddRibbon('Pack_PatchStitch%d_%d'%(edge,stitch),points,.00065,stitchMaterial,bundle)

# ONE connected long cloth strip: horizontal pass, vertical pass, shoulder
# loop, transfer on the rear, vertical pass, shoulder loop, second horizontal
# pass. The ends meet in a small side knot. No separate sewn harness.
bindingRoot=MakeRoot('Pack_Binding',packRoot)
stripPoints=[];stripAxes=[]
def StripPoint(point,axis): stripPoints.append(Vector(point));stripAxes.append(Vector((1,0,0) if axis=='x' else (0,0,1)))
for p in [(-.184,.001,.05),(-.195,-.017,.05),(-.195,-.11,.05),(-.175,-.134,.05),(.175,-.134,.05),(.195,-.11,.05),(.195,-.017,.05),(.178,.001,.05),(-.103,.002,.05)]: StripPoint(p,'z')
for p in [(-.103,.002,.11),(-.103,-.004,.151),(-.103,-.03,.155),(-.103,-.10,.155),(-.103,-.128,.137),(-.103,-.134,.11),(-.103,-.134,-.10),(-.103,-.126,-.142),(-.103,-.10,-.154),(-.103,-.025,-.154),(-.103,.002,-.137),(-.103,.004,-.115),(-.103,.06,-.113),(-.11,.10,-.06),(-.111,.112,.02),(-.108,.092,.10),(-.103,.04,.144),(-.103,.004,.146)]: StripPoint(p,'x')
for p in [(-.075,-.006,.132),(.075,-.006,.132),(.103,.004,.146)]: StripPoint(p,'z')
for p in [(.103,-.03,.155),(.103,-.10,.155),(.103,-.128,.137),(.103,-.134,.11),(.103,-.134,-.10),(.103,-.126,-.142),(.103,-.10,-.154),(.103,-.025,-.154),(.103,.002,-.137),(.103,.004,-.115),(.103,.06,-.113),(.11,.10,-.06),(.111,.112,.02),(.108,.092,.10),(.103,.04,.144),(.103,.004,.146),(.103,.002,.11),(.103,.002,-.060)]: StripPoint(p,'x')
for p in [(.177,.003,-.060),(.195,-.017,-.060),(.195,-.11,-.060),(.175,-.134,-.060),(-.175,-.134,-.060),(-.195,-.11,-.060),(-.195,-.017,-.060),(-.18,.002,-.060),(-.184,.003,.025),(-.191,-.007,.049)]: StripPoint(p,'z')
stripPoints=stripPoints[:-2]
stripAxes=stripAxes[:-2]
for p in [(-.17,-.0008,-.06),(.14,-.0008,-.06),(.184,-.0008,.05),(.194,-.064,.05)]:StripPoint(p,'z')
prefix=[Vector(p) for p in [(.194,-.064,.05),(.18,-.0008,.05),(-.14,-.0008,.05)]]
stripPoints=prefix+stripPoints;stripAxes=[Vector((0,0,1)) for _ in prefix]+stripAxes
# Split at UV-repeat boundaries as well as geometric bends. That keeps the
# weave at cotton scale without stretching a quarter-atlas over a long pass.
for point in stripPoints:
    if 0<point.x<.13:point.x*=.86408
    if abs(point.x)>.194 and point.y<.001:point.x=math.copysign(.1932,point.x)
    if point.y>.03:point.y=.03+(point.y-.03)*.57
originalPoints,originalAxes=stripPoints,stripAxes
stripPoints=[originalPoints[0]];stripAxes=[originalAxes[0]];pathDistances=[0.0]
distance=0.0;repeatLength=.18
for index in range(len(originalPoints)-1):
    start,end=originalPoints[index],originalPoints[index+1]
    length=(end-start).length
    steps=max(3 if max(start.y,end.y)>.025 else 1,math.ceil(length/.048))
    fractions={step/steps for step in range(1,steps+1)}
    seam=(math.floor(distance/repeatLength)+1)*repeatLength
    while seam<distance+length-1e-7:
        fractions.add((seam-distance)/length);seam+=repeatLength
    for fraction in sorted(fractions):
        if max(start.y,end.y)>.025:
            p0=originalPoints[max(0,index-1)];p3=originalPoints[min(len(originalPoints)-1,index+2)]
            t=fraction
            point=.5*((2*start)+(-p0+end)*t+(2*p0-5*start+4*end-p3)*t*t+(-p0+3*start-3*end+p3)*t*t*t)
        else:point=start.lerp(end,fraction)
        stripPoints.append(point)
        stripAxes.append(originalAxes[index].lerp(originalAxes[index+1],fraction).normalized())
        pathDistances.append(distance+fraction*length)
    distance+=length
bpy.context.view_layer.update()
bundleBvh=BVHTree.FromObject(bundle,bpy.context.evaluated_depsgraph_get())
for index,point in enumerate(stripPoints):
    if point.y<-.122 and abs(point.x)<.18 and abs(point.z)<.145:
        depths=[]
        for dx,dz in ((0,0),(-.013,0),(.013,0),(0,-.013),(0,.013)):
            hit=bundleBvh.ray_cast(Vector((point.x+dx,-.25,point.z+dz)),Vector((0,1,0)),.3)
            if hit[0] is not None: depths.append(hit[0].y)
        if depths:
            crossing=.0015*sum(math.exp(-((point.z-z)/.022)**2) for z in (.05,-.060)) if stripAxes[index].x>.7 else 0
            point.y=min(depths)-.0018-crossing
stripVerts=[];stripFaces=[];stripUvs=[];stripRings=[];stripVertexDistances=[];stripVertexU=[]
for index,point in enumerate(stripPoints):
    tangent=stripPoints[min(index+1,len(stripPoints)-1)]-stripPoints[max(0,index-1)]
    tangent.normalize();widthVector=stripAxes[index]-tangent*stripAxes[index].dot(tangent)
    if widthVector.length<.01: widthVector=tangent.cross(Vector((0,1,0)))
    widthVector.normalize();normal=tangent.cross(widthVector).normalized()
    if point.y>.012:
        twist=.72*max(0,min(1,(point.y-.012)/.055))
        widthVector=(widthVector*math.cos(twist)+normal*math.sin(twist)).normalized()
        normal=tangent.cross(widthVector).normalized()
    front=point.y<-.09 and abs(point.x)<.18 and abs(point.z)<.145
    ring=[]
    for aValue in ((-1,0,1) if front else (-1,1)):
        edgeWobble=1+.025*math.sin(index*1.71+.4*aValue)
        crown=Vector((0,-.0013*(1-aValue*aValue),0)) if front else Vector((0,0,0))
        ring.append(len(stripVerts));stripVerts.append(tuple(point+widthVector*.013*aValue*edgeWobble+crown))
        stripUvs.append((.42+.16*(aValue+1)/2,(pathDistances[index]/repeatLength)%1))
        stripVertexDistances.append(pathDistances[index]);stripVertexU.append(.42+.16*(aValue+1)/2)
    stripRings.append(ring)
for index in range(len(stripPoints)-1):
    a,b=stripRings[index],stripRings[index+1]
    if len(a)==len(b)==2:stripFaces.append((a[0],a[1],b[1],b[0]))
    elif len(a)==len(b)==3:stripFaces.extend([(a[0],a[1],b[1],b[0]),(a[1],a[2],b[2],b[1])])
    elif len(a)==2:stripFaces.extend([(a[0],a[1],b[1],b[0]),(a[1],b[2],b[1])])
    else:stripFaces.extend([(a[0],a[1],b[0]),(a[1],a[2],b[1],b[0])])
binding=CreateMesh('Pack_ContinuousClothStrap',stripVerts,stripFaces,stripUvs,materials['binding'],bindingRoot)
rect=atlasRects['binding']
for polygon in binding.data.polygons:
    minDistance=min(stripVertexDistances[binding.data.loops[loopIndex].vertex_index] for loopIndex in polygon.loop_indices)
    tile=math.floor((minDistance+1e-7)/repeatLength)
    for loopIndex in polygon.loop_indices:
        vertexIndex=binding.data.loops[loopIndex].vertex_index
        uValue=stripVertexU[vertexIndex]
        vValue=max(0,min(1,stripVertexDistances[vertexIndex]/repeatLength-tile))
        binding.data.uv_layers.active.data[loopIndex].uv=(rect[0]+uValue*(rect[2]-rect[0]),rect[1]+vValue*(rect[3]-rect[1]))
binding['ContinuousStrip']=True
binding['OuterGridPasses']=[2,2]
binding['ShoulderLoops']=2
AddTube('Pack_SideClothKnot',[(.191,-.050,.05),(.199,-.065,.061),(.2,-.080,.054),(.192,-.065,.043),(.191,-.050,.05)],.005,materials['binding'],bindingRoot,sides=5)
for sign in (-1,1):
    AddRibbon('Pack_SideKnotLoop%d'%sign,[(.197,-.064,.05),(.199,-.064+sign*.013,.061),(.198,-.064+sign*.023,.047),(.196,-.064,.05)],.012,materials['binding'],bindingRoot,axis='z')
AddRibbon('Pack_SideKnotTail',[(.197,-.067,.05),(.202,-.073,.019),(.207,-.079,-.003)],.019,materials['binding'],bindingRoot,axis='z')

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
jacketVerts.extend([(.120,-.1195,.144),(.178,-.1195,.141),(.174,-.1195,.074)])
jacketUvs.extend([(.62,.92),(.94,.92),(.94,.60)])
jacketFaces.extend([(11,cornerStart,cornerStart+1),(11,cornerStart+1,cornerStart+2),(11,cornerStart+2,12),(cornerStart,cornerStart+1,cornerStart+2)])
jacket=CreateMesh('Pack_IndigoShortJacket',jacketVerts,jacketFaces,jacketUvs,materials['jacket'],jacketRoot)
# Front opening seam and a small folded hem are geometric, not printed labels.
AddRibbon('Pack_JacketFrontPlacket',[(.016,-.052,-.10),(.016,-.052,.07),(.027,-.056,.10)],.009,materials['jacket'],jacketRoot)
buttonCenter=Vector((.153,-.123,.119))
buttonVerts=[];buttonUvs=[];buttonFaces=[]
for latitude in range(1,4):
    phi=math.pi*latitude/4
    for segment in range(8):
        angle=math.tau*segment/8
        rumple=1+.06*math.sin(segment*2.3+latitude)
        buttonVerts.append(tuple(buttonCenter+Vector((math.cos(angle)*math.sin(phi)*.0045*rumple,math.cos(phi)*.0025,math.sin(angle)*math.sin(phi)*.0038*rumple))))
        buttonUvs.append((segment/8,latitude/4))
for latitude in range(2):
    for segment in range(8):
        a=latitude*8+segment;b=latitude*8+(segment+1)%8;buttonFaces.append((a,b,b+8,a+8))
buttonFaces.extend([tuple(reversed(range(8))),tuple(16+i for i in range(8))])
CreateMesh('Pack_ClothKnotButton',buttonVerts,buttonFaces,buttonUvs,buttonMaterial,jacketRoot)
AddTube('Pack_ClothButtonLoop',[(.156,-.123,.119),(.165,-.123,.122),(.167,-.122,.118),(.158,-.122,.116)],.0012,buttonMaterial,jacketRoot,sides=4)

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
preflight=0
for obj in packRoot.children_recursive:
    if obj.type=='MESH':obj.data.calc_loop_triangles();preflight+=len(obj.data.loop_triangles)
if preflight>3000:raise RuntimeError('All-parts pre-bake triangle budget exceeded: '+str(preflight))
if scene.get('SichuanSurfaceBake',True):
    BakeSurfaces=runpy.run_path(str(projectPath/'_blender/Script_SichuanPackSurfaceBake.py'))['BakeSurfaces']
    BakeSurfaces(packRoot,projectPath,reviewPath)
for filename in ('Script_SichuanBlanketPackBake.py','Script_SichuanPackAttachments.py','Script_SichuanPackSurfaceBake.py'):
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
contractPath=modelPath/'Data_SichuanBlanketPack.json'
contract=json.loads(contractPath.read_text(encoding='utf-8'))
contract['version']='20261019ReferenceMatchV2'
contract['triangles']={'total':sum(triangles.values()),'limit':3000,'includesAllOptionalParts':True,'byPart':triangles}
points=[bundle.matrix_world@vertex.co for vertex in bundle.data.vertices]
sizes=[max(point[axis] for point in points)-min(point[axis] for point in points) for axis in range(3)]
contract['actualBundleDimensionsM']={'width':sizes[0],'height':sizes[2],'thickness':sizes[1],'includes':'cloth gathers, folded edges, repair patch and its stitches'}
contract['materials'].pop('ormRgb',None)
contract['materials']['ormSemantics']='R=baked surface occlusion, G=242/255 roughness, B=0 metallic'
contract['materials']['sharedAtlas']='Unique non-overlapping GameUV surface atlas, reprojected from the imagegen material study and approved unshadowed cotton samples'
contract['source']['surfaceBake']='../../_blender/Script_SichuanPackSurfaceBake.py'
contract['source']['surfaceEncoder']='../../_import/Script_SichuanPackSurfaceMaps.py'
contract['review']['sameHeightComparison']=['Texture_ReferenceCompare_front.jpg','Texture_ReferenceCompare_side.jpg','Texture_ReferenceCompare_back.jpg']
contract['assetUrl']='./Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb?v=20261019ReferenceMatchV2'
payload=(modelPath/'Model_SichuanBlanketPack.glb').read_bytes();contract['assetBytes']=len(payload);contract['assetSha256']=hashlib.sha256(payload).hexdigest()
contractPath.write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('SICHUAN_PACK_BUILD',json.dumps(triangles),'TOTAL',sum(triangles.values()),'BLEND',bpy.data.filepath)
