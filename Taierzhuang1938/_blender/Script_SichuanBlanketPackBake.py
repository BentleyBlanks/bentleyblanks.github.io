"""Rebuild the approved 1938 Sichuan folded single-blanket pack via BlenderMCP.

Run from the repository root with Script_BlenderMcp.mjs exec --file <this file>.
Native Blender: X right, Z up, -Y outward. glTF: X right, Y up, +Z outward.
The root is the centre of the planar body-contact surface, in metres.
The imagegen material studies are reprojected into one 1024 GameUV PBR set.
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
for oldSource in list(bpy.context.scene.objects):
    if oldSource.get('SichuanHighSource'):bpy.data.objects.remove(oldSource,do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)
for material in list(bpy.data.materials):
    if material.users == 0: bpy.data.materials.remove(material)
for oldImage in list(bpy.data.images):
    if oldImage.users==0 and oldImage.source!='VIEWER':bpy.data.images.remove(oldImage)
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
subprocess.run([shutil.which('python'),str(projectPath/'_import/Script_SichuanPackReferenceCloth.py'),'--reference',str(sourcePath/'Source/Image_SichuanBlanketPackThreeViewV02.png'),'--out',str(sourcePath/'Source/MaterialAtlasV03')],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
cottonBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonBase.png'),check_existing=False)
cottonBackBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonBackBase.png'),check_existing=False)
cottonNormal=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonNormal.png'),check_existing=False);cottonNormal.colorspace_settings.name='Non-Color'
cottonSideBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonSideBase.png'),check_existing=False)
cottonSideNormal=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceCottonSideNormal.png'),check_existing=False);cottonSideNormal.colorspace_settings.name='Non-Color'
patchBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferencePatchBase.png'),check_existing=False)
patchNormal=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferencePatchNormal.png'),check_existing=False);patchNormal.colorspace_settings.name='Non-Color'
indigoBase=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV03/Texture_ReferenceIndigoBase.png'),check_existing=False)
strawImages={}
subprocess.run([shutil.which('python'),str(projectPath/'_import/Script_SichuanStrawStudy.py'),'--source',str(sourcePath/'Source/MaterialAtlasV04/Image_SichuanStrawStudyV04.png'),'--out',str(sourcePath/'Source/MaterialAtlasV04')],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
for role in ('Sole','End','Weave','Cord'):
    for channel in ('Base','Normal'):
        image=bpy.data.images.load(str(sourcePath/'Source/MaterialAtlasV04'/f'Texture_Straw{role}{channel}.png'),check_existing=False)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
        image.pack();strawImages[(role,channel)]=image

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
        colour=nodes.new('ShaderNodeTexImage');colour.image=patchBase if suffix=='Patch' else cottonBackBase if suffix=='Back' else cottonSideBase if suffix=='Fold' else cottonBase;colour.extension='EXTEND';links.new(clothVector,colour.inputs['Vector']);baseColor=colour.outputs['Color']
    if key=='straw':
        strawRole='End' if suffix=='End' else 'Sole' if suffix=='Sandal' else 'Cord' if suffix=='Cord' else 'Weave'
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(.52,.52,0)
        repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY'
        repeatX,repeatY=(1,1) if strawRole=='End' else (1,2) if strawRole=='Sole' else (1,4) if strawRole=='Cord' else (8,2)
        repeat.inputs[1].default_value=(repeatX/.46,repeatY/.46,1)
        fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION'
        links.new(uv.outputs['UV'],origin.inputs[0]);links.new(origin.outputs[0],repeat.inputs[0]);links.new(repeat.outputs[0],fract.inputs[0])
        strawVector=repeat.outputs[0] if strawRole=='End' else fract.outputs[0]
        base.image=strawImages[(strawRole,'Base')];base.extension='EXTEND' if strawRole=='End' else 'REPEAT'
        links.new(strawVector,base.inputs['Vector']);baseColor=base.outputs['Color']
    if key=='jacket':
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(.52,.02,0)
        repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY';repeat.inputs[1].default_value=((.1 if suffix=='Button' else 12)/.46,(.1 if suffix=='Button' else 6)/.46,1)
        fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION'
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(.46,.46,1)
        offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(.52,.02,0)
        links.new(uv.outputs['UV'],origin.inputs[0]);links.new(origin.outputs[0],repeat.inputs[0]);links.new(repeat.outputs[0],fract.inputs[0]);links.new(fract.outputs[0],scale.inputs[0]);links.new(scale.outputs[0],offset.inputs[0]);jacketVector=offset.outputs[0]
        colour=nodes.new('ShaderNodeTexImage');colour.image=indigoBase;links.new(fract.outputs[0],colour.inputs['Vector']);baseColor=colour.outputs['Color']
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
        neutral=nodes.new('ShaderNodeHueSaturation');neutral.inputs['Saturation'].default_value=.25;neutral.inputs['Value'].default_value=1.20
        links.new(baseColor,neutral.inputs['Color']);baseColor=neutral.outputs['Color']
    if key=='straw':
        aged=nodes.new('ShaderNodeHueSaturation');aged.inputs['Saturation'].default_value=.85;aged.inputs['Value'].default_value=1
        links.new(baseColor,aged.inputs['Color']);baseColor=aged.outputs['Color']
    if suffix=='Button':
        faded=nodes.new('ShaderNodeMixRGB');faded.inputs[0].default_value=.60;faded.inputs[2].default_value=(.16,.18,.23,1)
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
    if key=='straw':
        normal.image=strawImages[(strawRole,'Normal')]
        normal.extension='EXTEND' if strawRole=='End' else 'REPEAT';links.new(strawVector,normal.inputs['Vector'])
    if key=='jacket':links.new(jacketVector,normal.inputs['Vector'])
    if key=='cloth':normal.image=patchNormal if suffix=='Patch' else cottonSideNormal if suffix=='Fold' else cottonNormal;normal.extension='EXTEND';links.new(clothVector,normal.inputs['Vector'])
    normalMap = nodes.new('ShaderNodeNormalMap'); normalMap.inputs['Strength'].default_value = normalStrength
    if key=='jacket':normalMap.inputs['Strength'].default_value=.55
    links.new(normal.outputs['Color'], normalMap.inputs['Color'])
    links.new(normalMap.outputs['Normal'], shader.inputs['Normal'])
    if suffix=='End' and key=='straw':
        geometry=nodes.new('ShaderNodeNewGeometry')
        subtract=nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT';subtract.inputs[1].default_value=(0,-.067,.1805)
        split=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],subtract.inputs[0]);links.new(subtract.outputs[0],split.inputs[0])
        y2=nodes.new('ShaderNodeMath');y2.operation='MULTIPLY';links.new(split.outputs['Y'],y2.inputs[0]);links.new(split.outputs['Y'],y2.inputs[1])
        z2=nodes.new('ShaderNodeMath');z2.operation='MULTIPLY';links.new(split.outputs['Z'],z2.inputs[0]);links.new(split.outputs['Z'],z2.inputs[1])
        add=nodes.new('ShaderNodeMath');add.operation='ADD';links.new(y2.outputs[0],add.inputs[0]);links.new(z2.outputs[0],add.inputs[1])
        radius=nodes.new('ShaderNodeMath');radius.operation='SQRT';links.new(add.outputs[0],radius.inputs[0])
        radiusOffset=nodes.new('ShaderNodeMath');radiusOffset.operation='SUBTRACT';radiusOffset.inputs[1].default_value=.004;links.new(radius.outputs[0],radiusOffset.inputs[0])
        pitch=nodes.new('ShaderNodeMath');pitch.operation='DIVIDE';pitch.inputs[1].default_value=.005435;links.new(radiusOffset.outputs[0],pitch.inputs[0])
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
materials['strawEnd']=MakeMaterial('straw',(.95,.94,.91,1),'End')
materials['sandal']=MakeMaterial('straw',suffix='Sandal')
materials['strawCord']=MakeMaterial('straw',suffix='Cord',normalStrength=.6)
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
    if name!='Pack_IndigoShortJacket':bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if name=='Pack_ContinuousClothStrap':
        for face in bm.faces:
            if face.calc_center_median().y<-.08 and face.normal.y>0:face.normal_flip()
    if name.startswith('Pack_FoldEdge'):
        sign=-1 if 'Left' in name else 1
        for face in bm.faces:
            if face.normal.x*sign<0:face.normal_flip()
    if name.startswith('Pack_ClothGather') or name=='Pack_RepairPatch':
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
    widthAxis = Vector((1,0,0) if axis == 'x' else (0,1,0) if axis=='y' else (0,0,1))
    verts, faces, uvs = [], [], []
    for index, point in enumerate(points):
        tangent=(Vector(points[min(index+1,len(points)-1)])-Vector(points[max(0,index-1)])).normalized()
        widthVector=widthAxis-tangent*widthAxis.dot(tangent)
        if widthVector.length<.01:widthVector=tangent.cross(Vector((1,0,0) if abs(tangent.x)<.8 else (0,1,0)))
        widthVector.normalize()
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

# A sculpted soft volume supplies the folded bundle, then is reduced to the
# game mesh. Keep its high-resolution cloth outside the exported root.
soft=runpy.run_path(str(projectPath/'_blender/Script_SichuanSoftBundleV6.py'))
FrontDepth=soft['SoftFrontDepth']
fabric=runpy.run_path(str(projectPath/'_blender/Script_SichuanFabricMaterial.py'))['ApplyFabric']
fabricFolder=sourcePath/'Source/MaterialAtlasV06'
subprocess.run([shutil.which('python'),str(projectPath/'_import/Script_SichuanFabricStudy.py'),'--source',str(fabricFolder/'Image_SichuanFabricStudyV06.png'),'--out',str(fabricFolder)],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
fabric(materials['cloth'],'Cotton',fabricFolder,(.38,.30),wear='Front')
fabric(backMaterial,'Cotton',fabricFolder,(.38,.30),wear='Back',normalStrength=.15)
fabric(foldMaterial,'Cotton',fabricFolder,(.13,.30),wear='End',foldRelief=True)
fabric(patchMaterial,'Patch',fabricFolder,(.044,.050))
fabric(materials['binding'],'Binding',fabricFolder,(.026,.18))
fabric(materials['jacket'],'Indigo',fabricFolder,(1.24,.56))
fabric(buttonMaterial,'Indigo',fabricFolder,(.008,.006),normalStrength=.30)
soft['ConfigureEndRelief'](fabricFolder/'Texture_EndWrinkleHeight.png')
bundle=soft['BuildSoftBundle'](CreateMesh,FrontDepth,materials['cloth'],backMaterial,foldMaterial,packRoot)
highSource=bpy.data.objects[bundle['HighSource']]

bpy.context.view_layer.update()
surfaceBvh=BVHTree.FromObject(bundle,bpy.context.evaluated_depsgraph_get())
def SurfaceDepth(xValue,zValue,offset=.0016):
    hit=surfaceBvh.ray_cast(Vector((xValue,-.25,zValue)),Vector((0,1,0)),.30)
    return (hit[0].y if hit[0] is not None else FrontDepth(xValue,zValue))-offset

sideEnvelope=max(abs(vertex.co.x) for vertex in bundle.data.vertices)
def SideSurfaceDepth(sign,yValue,zValue):
    # The cloth bridges all four rolled edges; a single outer envelope keeps
    # whole ribbon faces clear of the intervening folds, not just vertices.
    return sign*(sideEnvelope+.0012)

# One hand-stitched patch; stitches are plain cotton, no metal fasteners.
patchVerts=[];patchUvs=[];patchFaces=[];patchLookup={}
patchBounds=(.130,.174,-.132,-.082)
def ClipPatch(points,axis,bound,greater):
    result=[]
    for a,b in zip(points,points[1:]+points[:1]):
        insideA=a[axis]>=bound-1e-9 if greater else a[axis]<=bound+1e-9
        insideB=b[axis]>=bound-1e-9 if greater else b[axis]<=bound+1e-9
        if insideA:result.append(a)
        if insideA!=insideB:result.append(a.lerp(b,(bound-a[axis])/(b[axis]-a[axis])))
    return result
bundle.data.calc_loop_triangles()
for triangle in bundle.data.loop_triangles:
    points=[bundle.data.vertices[index].co.copy() for index in triangle.vertices]
    if triangle.normal.y>-.4 or any(point.y>-.103 for point in points):continue
    for axis,bound,greater in ((0,patchBounds[0],True),(0,patchBounds[1],False),(2,patchBounds[2],True),(2,patchBounds[3],False)):
        points=ClipPatch(points,axis,bound,greater)
        if len(points)<3:break
    face=[]
    for point in points:
        point.y-=.0018;key=tuple(round(value,8) for value in point)
        if key not in patchLookup:
            patchLookup[key]=len(patchVerts);patchVerts.append(tuple(point))
            patchUvs.append(((point.x-patchBounds[0])/(patchBounds[1]-patchBounds[0]),(point.z-patchBounds[2])/(patchBounds[3]-patchBounds[2])))
        index=patchLookup[key]
        if not face or face[-1]!=index:face.append(index)
    if len(face)>2 and face[0]==face[-1]:face.pop()
    if len(set(face))>=3:patchFaces.append(tuple(face))
patch=CreateMesh('Pack_RepairPatch',patchVerts,patchFaces,patchUvs,patchMaterial,bundle)
# The upper blanket fold overlaps the jacket corner, showing an actual tuck
# rather than presenting the blue corner as a sewn-on coloured patch.
lipVerts=[];lipUvs=[];lipFaces=[]
for step in range(6):
    t=step/5
    for across in range(3):
        s=across/2
        xValue=.111+.066*t+.012*s
        zValue=.140-.067*t+.009*s
        depth=SurfaceDepth(xValue,zValue,.0032)-.0008*math.sin(s*math.pi)
        lipVerts.append((xValue,depth,zValue));lipUvs.append(((xValue+.19)/.38,(zValue+.15)/.30))
for step in range(5):
    for across in range(2):
        index=step*3+across;lipFaces.append((index,index+1,index+4,index+3))
CreateMesh('Pack_TurnedFoldLip',lipVerts,lipFaces,lipUvs,materials['cloth'],bundle)
for edge in range(4):
    for stitch in range(6):
        fraction=.12+stitch*.15
        if edge<2:
            xValue=.13+fraction*.041;zValue=-.131 if edge==0 else -.082
            points=[(xValue-.001,SurfaceDepth(xValue-.001,zValue-.0015,.0025),zValue-.0015),(xValue+.001,SurfaceDepth(xValue+.001,zValue+.0015,.0025),zValue+.0015)]
        else:
            xValue=.130 if edge==2 else .172;zValue=-.128+fraction*.044
            points=[(xValue-.0013,SurfaceDepth(xValue-.0013,zValue-.001,.0025),zValue-.001),(xValue+.0013,SurfaceDepth(xValue+.0013,zValue+.001,.0025),zValue+.001)]
        AddRibbon('Pack_PatchStitch%d_%d'%(edge,stitch),points,.00065,stitchMaterial,bundle)

# One continuous cloth strip, including the two free shoulder loops.
BuildBinding=runpy.run_path(str(projectPath/'_blender/Script_SichuanPackBinding.py'))['BuildBinding']
bindingRoot=BuildBinding(CreateMesh,MakeRoot,AddTube,AddRibbon,SurfaceDepth,materials,packRoot,softCloth=True,refined=True,sideSurfaceDepth=SideSurfaceDepth)
for child in bindingRoot.children_recursive:
    if child.type=='MESH' and child.name=='Pack_ContinuousClothStrap':
        narrow=materials['binding'].copy();narrow.name='Material_NarrowCottonTape'
        fabric(narrow,'Binding',fabricFolder,(.026,.18),narrowTape=True)
        child.data.materials[0]=narrow

# Complete civilian short jacket, concealed inside the fold except one upper
# corner. It remains a single independent assembly when pulled out.
jacketRoot=MakeRoot('Pack_Jacket',packRoot)
jacketRoot['Control']='Hide this node or translate it upward/outward to withdraw the original garment'
jacketRoot['Garment']='Civilian indigo homespun short jacket; cloth knot button'
BuildCivilianJacket=runpy.run_path(str(projectPath/'_blender/Script_SichuanCivilianJacket.py'))['BuildCivilianJacket']
jacket=BuildCivilianJacket(CreateMesh,materials['jacket'],jacketRoot,SurfaceDepth,refined=True)
buttonCenter=Vector((.156,SurfaceDepth(.156,.126,.0080),.126))
buttonVerts=[];buttonUvs=[];buttonFaces=[]
for latitude in range(1,4):
    phi=math.pi*latitude/4
    for segment in range(6):
        angle=math.tau*segment/6
        rumple=1+.06*math.sin(segment*2.3+latitude)
        buttonVerts.append(tuple(buttonCenter+Vector((math.cos(angle)*math.sin(phi)*.0045*rumple,math.cos(phi)*.0025,math.sin(angle)*math.sin(phi)*.0038*rumple))))
        buttonUvs.append((segment/6,latitude/4))
for latitude in range(2):
    for segment in range(6):
        a=latitude*6+segment;b=latitude*6+(segment+1)%6;buttonFaces.append((a,b,b+6,a+6))
buttonFaces.extend([tuple(reversed(range(6))),tuple(12+i for i in range(6))])
CreateMesh('Pack_ClothKnotButton',buttonVerts,buttonFaces,buttonUvs,buttonMaterial,jacketRoot)
buttonLoop=[]
for index in range(13):
    angle=index*math.tau/12
    buttonX=.1642-.0072*math.cos(angle);buttonZ=.1265+.0030*math.sin(angle)+.0002*math.sin(angle*3)
    buttonLoop.append((buttonX,SurfaceDepth(buttonX,buttonZ,.0085)+.00035*math.cos(angle*2),buttonZ))
AddTube('Pack_ClothButtonLoop',buttonLoop,.0012,buttonMaterial,jacketRoot,sides=3)

BuildAttachments=runpy.run_path(str(projectPath/'_blender/Script_SichuanPackAttachments.py'))['BuildAttachments']
attachments=BuildAttachments(CreateMesh,AddRibbon,AddTube,materials,refined=True,surfaceDepth=SurfaceDepth)
for obj in attachments: obj.parent=packRoot

# The sculpt source also carries the repair and turned-over lip, so their
# raised edge normals survive the high-to-low normal projection.
highSource.hide_set(False);highSource.hide_render=False
sourceBvh=BVHTree.FromObject(highSource,bpy.context.evaluated_depsgraph_get())
copies=[]
for child in bundle.children_recursive:
    if child.type!='MESH':continue
    clone=child.copy();clone.data=child.data.copy();scene.collection.objects.link(clone);clone.parent=None
    clone['SichuanHighSource']=True
    if 'Patch' in child.name:
        for vertex in clone.data.vertices:
            hit=sourceBvh.ray_cast(Vector((vertex.co.x,-.25,vertex.co.z)),Vector((0,1,0)),.30)
            if hit[0] is not None:vertex.co.y=hit[0].y-(.0025 if 'Stitch' in child.name else .0018)
    copies.append(clone)
bpy.ops.object.select_all(action='DESELECT');highSource.select_set(True)
for clone in copies:clone.select_set(True)
bpy.context.view_layer.objects.active=highSource;bpy.ops.object.join()
highSource.hide_render=True;highSource.hide_set(True)

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
if preflight>10000:raise RuntimeError('All-parts pre-bake triangle budget exceeded: '+str(preflight))
if scene.get('SichuanSurfaceBake',True):
    BakeSurfaces=runpy.run_path(str(projectPath/'_blender/Script_SichuanPackSurfaceBake.py'))['BakeSurfaces']
    BakeSurfaces(packRoot,projectPath,reviewPath,highSource=highSource,fabricVersion='V06')
for filename in ('Script_SichuanBlanketPackBake.py','Script_SichuanSoftBundleV6.py','Script_SichuanFabricMaterial.py','Script_SichuanPackBinding.py','Script_SichuanCivilianJacket.py','Script_SichuanPackAttachments.py','Script_SichuanPackSurfaceBake.py','Script_SichuanUvRepair.py'):
    text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename)
    text.clear();text.write((projectPath/'_blender'/filename).read_text(encoding='utf-8'))
for filename in ('Script_SichuanPackReferenceCloth.py','Script_SichuanFabricStudy.py','Script_SichuanStrawStudy.py','Script_SichuanPackSurfaceMaps.py'):
    text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename)
    text.clear();text.write((projectPath/'_import'/filename).read_text(encoding='utf-8'))
triangles={}
for root in (bundle,bindingRoot,jacketRoot,*attachments):
    count=0
    for obj in [root,*root.children_recursive]:
        if obj.type=='MESH':obj.data.calc_loop_triangles();count+=len(obj.data.loop_triangles)
    triangles[root.name]=count
if sum(triangles.values())>10000:raise RuntimeError('All-parts triangle budget exceeded: '+str(triangles))
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
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(sourcePath/'Scene_SichuanBlanketPack.blend'))
(reviewPath/'Data_BlenderBuild.json').write_text(json.dumps({'triangles':triangles,'totalTriangles':sum(triangles.values()),'blend':bpy.data.filepath,'glb':str(modelPath/'Model_SichuanBlanketPack.glb'),'nativeAxes':'Z up; -Y outward','exportAxes':'Y up; +Z outward; back Z=0','unitScale':1},indent=2),encoding='utf-8')
contractPath=modelPath/'Data_SichuanBlanketPack.json'
contract=json.loads(contractPath.read_text(encoding='utf-8'))
contract['version']='20261020ReferenceMatchV6'
contract['triangles']={'total':sum(triangles.values()),'limit':10000,'includesAllOptionalParts':True,'byPart':triangles}
points=[bundle.matrix_world@vertex.co for vertex in bundle.data.vertices]
sizes=[max(point[axis] for point in points)-min(point[axis] for point in points) for axis in range(3)]
contract['actualBundleDimensionsM']={'width':sizes[0],'height':sizes[2],'thickness':sizes[1],'includes':'soft folded bundle, conforming repair patch and cotton stitches'}
contract['materials'].pop('ormRgb',None)
contract['materials']['ormSemantics']='R=baked surface occlusion, G=242/255 roughness, B=0 metallic'
contract['materials']['sharedAtlas']='Unique non-overlapping GameUV atlas from imagegen V06 fine cotton and V04 straw; independent dirt and sweat, sculpted folds and restrained geometric end relief'
contract['source']['surfaceBake']='../../_blender/Script_SichuanPackSurfaceBake.py'
contract['source']['surfaceEncoder']='../../_import/Script_SichuanPackSurfaceMaps.py'
contract['source']['foldedCloth']='../../_blender/Script_SichuanSoftBundleV6.py'
contract['source']['fabricMaterials']='../../_blender/Script_SichuanFabricMaterial.py'
contract['source']['fabricStudy']='../../_import/Script_SichuanFabricStudy.py'
contract['source']['textureRebuild']='../../_blender/Script_SichuanBlanketPackBake.py'
contract['source']['binding']='../../_blender/Script_SichuanPackBinding.py'
contract['source']['strawStudy']='../../_import/Script_SichuanStrawStudy.py'
contract['source']['civilianJacket']='../../_blender/Script_SichuanCivilianJacket.py'
for part in contract['parts']:
    if part['node']=='Pack_Jacket':
        part['description']='Full-size long-sleeved civilian indigo jacket, with sleeves and side panels folded inward and the hem folded underneath; the approved corner and cloth knot remain exposed'
        part['patternDimensionsM']=[1.24,.56]
        part.pop('refinementStatus',None)
contract['parts'][0]['description']='Soft folded homespun cotton volume with exposed turned cloth ends, pressure creases, a sewn repair patch and a planar contact leaf; sculpt source retained outside the game root'
contract['review']['sameHeightComparison']=['Texture_ReferenceCompare_front.jpg','Texture_ReferenceCompare_side.jpg','Texture_ReferenceCompare_back.jpg']
contract['review']['status']='V6RebuiltAwaitingVisualReview'
contract['commandsFromRepositoryRoot']=[command.replace('Script_SichuanBlanketPackVerify.mjs','Script_SichuanBlanketPackVerify.mjs --max-triangles=10000') if 'max-triangles' not in command else command for command in contract['commandsFromRepositoryRoot']]
contract['review']['technicalChecks']=None
contract['review']['sourceReopenVerified']=False
contract['assetUrl']='./Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb?v=20261020ReferenceMatchV6'
payload=(modelPath/'Model_SichuanBlanketPack.glb').read_bytes();contract['assetBytes']=len(payload);contract['assetSha256']=hashlib.sha256(payload).hexdigest()
contractPath.write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('SICHUAN_PACK_BUILD',json.dumps(triangles),'TOTAL',sum(triangles.values()),'BLEND',bpy.data.filepath)
