"""Derive, bake and export the complete V55 Type89 game model from its saved high source."""

import argparse
import json
import math
import os
import struct
import sys
import time
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_Type89RestorationHigh import GEOMETRY, MODEL, SOURCE_ROOT, SURFACE, VERSION, Hash
from Script_Type89RestorationTopology import (GuardMesh, PrepareTriangulation, Role, ShoeMesh,
                                              Simplify, StripMaterials, Triangles)


def Select(objects, active):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active


def ExportGeometryProbe(root, file):
    materials = {}
    for obj in root.children_recursive:
        if obj.type!='MESH':
            continue
        for slot in obj.material_slots:
            role = Role(slot.material)
            if role not in materials:
                materials[role] = bpy.data.materials.new('Material_Type89Game'+role)
            slot.material = materials[role]
    Select([root]+list(root.children_recursive),root)
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_yup=True,
                              export_extras=True,export_animations=False,export_cameras=False,export_lights=False)


def Unwrap(objects, margin):
    uniqueObjects = {obj.data:obj for obj in objects}
    for mesh in uniqueObjects:
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
        mesh.uv_layers.new(name='UVMap')
    Select(uniqueObjects.values(), next(iter(uniqueObjects.values())))
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.context.scene.tool_settings.mesh_select_mode = (False,False,True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(63), island_margin=margin, area_weight=.1, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin, margin_method='FRACTION')
    bpy.ops.object.mode_set(mode='OBJECT')


def BodyGame(root):
    pairs = {'Body': [], 'Track': [], 'Guard': []}
    byMesh = {}
    track = None
    guardMask = None
    for obj in sorted(root.children_recursive,key=lambda item:item.name):
        if obj.type != 'MESH':
            continue
        high = obj.data
        if obj.name.startswith('Mesh_TrackLink'):
            if track is None:
                track = ShoeMesh(high)
                pairs['Track'].append((high,obj))
            obj.data = track
            continue
        if high in byMesh:
            obj.data = byMesh[high]
            continue
        obj.data = high.copy()
        if obj.name == 'Mesh_ExhaustGuard':
            guardMesh, guardMask = GuardMesh(high)
            liner = bpy.data.objects.new('Mesh_ExhaustGuardPerforatedSheet',guardMesh)
            bpy.context.scene.collection.objects.link(liner)
            liner.parent = obj.parent
            liner.matrix_basis = obj.matrix_basis.copy()
            guardHigh = high.copy()
            StripMaterials(guardHigh, {'Guard'})
            pairs['Guard'].append((guardHigh,liner))
            bodyRoles = {Role(material) for material in high.materials}-{'Guard'}
            high = high.copy()
            StripMaterials(high,bodyRoles)
            StripMaterials(obj.data,bodyRoles)
        low = Simplify(obj)
        byMesh[high] = low
        pairs['Body'].append((high,obj))
    for atlas,rows in pairs.items():
        for _, obj in rows:
            PrepareTriangulation(obj.data)
        if atlas != 'Guard':
            Unwrap([obj for _,obj in rows], .00063 if atlas=='Body' else .008)
        else:
            rows[0][1].data.uv_layers.active.name = 'UVMap'
    assert guardMask is not None and track is not None
    return pairs, guardMask


def Proxy(pairs, source, label):
    copies = []
    for i,(high, obj) in enumerate(pairs):
        mesh = high if source else obj.data
        copy = bpy.data.objects.new('Type89BakePart',mesh.copy())
        bpy.context.scene.collection.objects.link(copy)
        copy.location = (8*(i%10),8*(i//10),0)
        copies.append(copy)
    Select(copies,copies[0])
    if len(copies)>1:
        bpy.ops.object.join()
    proxy = bpy.context.object
    proxy.name = 'Type89Bake'+label
    return proxy


def MaterialOutput(material):
    nodes = material.node_tree.nodes
    return next(node for node in nodes if node.type=='OUTPUT_MATERIAL' and node.is_active_output)


def Relay(links, original, target):
    if original.is_linked:
        links.new(original.links[0].from_socket,target)
    else:
        target.default_value=original.default_value


def BindEmission(material, channel, useLocalOcclusion):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type=='BSDF_PRINCIPLED')
    output = MaterialOutput(material)
    emission = nodes.new('ShaderNodeEmission')
    if channel=='Base':
        Relay(links,shader.inputs['Base Color'],emission.inputs[0])
    elif channel=='Orm':
        packed = nodes.new('ShaderNodeCombineColor')
        ao = next((node.inputs['Occlusion'] for node in nodes if node.type=='GROUP'
                   and node.inputs.get('Occlusion') is not None),None)
        if useLocalOcclusion:
            contact = nodes.new('ShaderNodeAmbientOcclusion')
            contact.inputs['Distance'].default_value = .024
            contact.samples = 8
            contact.only_local = True
            indirect = nodes.new('ShaderNodeMath')
            indirect.operation = 'MULTIPLY_ADD'
            links.new(contact.outputs['AO'],indirect.inputs[0])
            indirect.inputs[1].default_value = .22
            indirect.inputs[2].default_value = .78
            multiply = nodes.new('ShaderNodeMath')
            multiply.operation = 'MULTIPLY'
            if ao is not None:
                Relay(links,ao,multiply.inputs[0])
            else:
                multiply.inputs[0].default_value = 1
            links.new(indirect.outputs[0],multiply.inputs[1])
            links.new(multiply.outputs[0],packed.inputs['Red'])
        elif ao is not None:
            Relay(links,ao,packed.inputs['Red'])
        else:
            packed.inputs['Red'].default_value = 1
        Relay(links,shader.inputs['Roughness'],packed.inputs['Green'])
        Relay(links,shader.inputs['Metallic'],packed.inputs['Blue'])
        links.new(packed.outputs[0],emission.inputs[0])
    links.new(emission.outputs[0],output.inputs['Surface'])


def Opacity(image, mask):
    if tuple(image.size) != tuple(mask.size):
        mask.scale(*image.size)
    width,height = image.size
    rgba = np.empty((height,width,4), dtype=np.float32)
    opacity = np.empty_like(rgba)
    image.pixels.foreach_get(rgba.ravel())
    mask.pixels.foreach_get(opacity.ravel())
    rgba[:,:,3] = opacity[:,:,3]
    image.pixels.foreach_set(rgba.ravel())
    image.update()


def FinishProjection(image, channel):
    data = np.empty(len(image.pixels),dtype=np.float32)
    image.pixels.foreach_get(data)
    rgba = data.reshape(-1,4)
    rgb = rgba[:,:3]
    if channel=='Normal':
        # Bake misses and opposite-facing/coplanar rays can produce zero or
        # inward vectors. Use the low geometric normal in those texels.
        vector = rgb*2-1
        length = np.linalg.norm(vector,axis=1)
        valid = np.isfinite(length)&(length>.55)&(length<1.25)&(vector[:,2]>.04)
        vector[~valid] = (0,0,1)
        length[~valid] = 1
        rgb[:] = (vector/length[:,None]+1)*.5
        count = int(np.count_nonzero(~valid))
    else:
        # This floor is below the darkest illuminated surface in the paint
        # atlas. It corrects isolated black hits without lifting film wear.
        missed = np.max(rgb,axis=1)<.055
        rgb[missed] = (.055,.055,.055)
        count = int(np.count_nonzero(missed))
    image.pixels.foreach_set(data)
    image.update()
    return count


def BakeAtlas(bake, name, rows, mapDir, sizes, mask):
    high = Proxy(rows,True,name+'High')
    low = Proxy(rows,False,name+'Low')
    highMaterials = list(high.data.materials)
    high.hide_render = False
    low.data.materials.clear()
    receiver = bpy.data.materials.new('Type89BakeReceiver'+name)
    receiver.use_nodes = True
    low.data.materials.append(receiver)
    texture = receiver.node_tree.nodes.new('ShaderNodeTexImage')
    receiver.node_tree.nodes.active = texture
    for face in low.data.polygons:
        face.material_index = 0
    for slot in high.material_slots:
        slot.link = 'OBJECT'
    defaults = {'Base':(.205,.181,.114,1), 'Normal':(.5,.5,1,1), 'Orm':(1,.69,0,1)}
    configuration = {'Body':(.0045,.018), 'Track':(.006,.019), 'Guard':(.003,.012)}
    cage, distance = configuration[name]
    files = {}
    for channel,size in zip(['Base','Normal','Orm'],sizes):
        clones = {}
        for slot,material in zip(high.material_slots,highMaterials):
            if channel=='Normal':
                slot.material = material
                continue
            if material not in clones:
                copy = material.copy()
                BindEmission(copy,channel,name=='Body')
                clones[material] = copy
            slot.material = clones[material]
        image = bake.Image('Type89Game'+name+channel,size,'sRGB' if channel=='Base' else 'Non-Color',defaults[channel])
        texture.image = image
        Select([high,low],low)
        print(f'Bake {name} {channel} at {size}²',flush=True)
        bpy.ops.object.bake(type='NORMAL' if channel=='Normal' else 'EMIT', normal_space='TANGENT',
                            use_selected_to_active=True,use_clear=False,margin=3 if name=='Body' else 5,
                            cage_extrusion=cage,max_ray_distance=distance)
        if channel in {'Normal','Base'}:
            repaired = FinishProjection(image,channel)
            print(f'{name} {channel} fallback texels including padding: {repaired}',flush=True)
        if name=='Guard' and channel=='Base':
            Opacity(image,mask)
        file = mapDir/('Texture_Type89Game'+name+channel+'.png')
        bake.SaveImage(image,file)
        texture.image = None
        bpy.data.images.remove(image)
        files[channel] = str(file)
        for slot,material in zip(high.material_slots,highMaterials):
            slot.material = material
        for material in clones.values():
            bpy.data.materials.remove(material)
    for target in (high,low):
        mesh = target.data
        bpy.data.objects.remove(target,do_unlink=True)
        bpy.data.meshes.remove(mesh)
    bpy.data.materials.remove(receiver)
    return files


def GameMaterials(bake, pairs, files):
    roles = {}
    for rows in pairs.values():
        for _,obj in rows:
            for source in list(obj.data.materials):
                role = Role(source)
                if role not in roles:
                    atlas = role if role in {'Track','Guard'} else 'Body'
                    material = bake.BakedMaterial(role,None if role=='Shadow' else files[atlas], 'Game',shareImages=True)
                    if role in {'Armor','CastArmor','Guard'}:
                        shader = next(node for node in material.node_tree.nodes if node.type=='BSDF_PRINCIPLED')
                        shader.inputs['Coat Weight'].default_value = .20 if role=='CastArmor' else .26
                        shader.inputs['Coat Roughness'].default_value = .45 if role=='CastArmor' else .41
                    if role=='Glass':
                        nodes,links = material.node_tree.nodes,material.node_tree.links
                        shader = next(node for node in nodes if node.type=='BSDF_PRINCIPLED')
                        socket = shader.inputs['Roughness']
                        original = socket.links[0].from_socket
                        factor = nodes.new('ShaderNodeMath')
                        factor.operation = 'MULTIPLY'
                        factor.inputs[1].default_value = .37
                        links.new(original,factor.inputs[0])
                        links.new(factor.outputs[0],socket)
                    roles[role] = material
    return roles


def RelinkGameMaps(materials, files, output):
    paths = {Path(file).name: Path(file).relative_to(output).as_posix()
             for atlas in files.values() for file in atlas.values()}
    images = {node.image for material in materials for node in material.node_tree.nodes
              if node.type=='TEX_IMAGE' and node.image}
    assert {image.name for image in images} == paths.keys()
    for image in images:
        assert image.packed_file is not None
        image.filepath_raw = '//' + paths[image.name]


def GlbCounts(file):
    with file.open('rb') as stream:
        _,version,_,length,kind = struct.unpack('<5I',stream.read(20))
        assert version==2 and kind==0x4e4f534a
        data = json.loads(stream.read(length))
    instances = {}
    def Visit(index):
        node = data['nodes'][index]
        triangles = 0
        if 'mesh' in node:
            for primitive in data['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4) == 4
                triangles += data['accessors'][primitive['indices']]['count']//3
            instances[node['name']] = triangles
        return triangles + sum(Visit(child) for child in node.get('children',[]))
    scene = data['scenes'][data.get('scene',0)]
    total = sum(Visit(index) for index in scene['nodes'])
    extra = data['asset'].get('extras',{})
    cleanup = sum(row['removedRenderedTriangles'] for row in extra.get('Type89ZeroAreaCleanup',[]))
    triangulation = extra.get('Type89TriangulationAccounting',{}).get('removedRenderedZeroAreaTriangles',0)
    return {'triangles':total, 'materials':len(data['materials']), 'images':len(data['images']),
            'bytes':file.stat().st_size, 'sha256':Hash(file), 'exportCleanupTriangles':cleanup,
            'removedOnExplicitTriangulation':triangulation},instances


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=SOURCE_ROOT/VERSION)
    parser.add_argument('--resolution',type=int,default=4096,choices=[1024,2048,4096])
    parser.add_argument('--geometry-only',action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    start = time.monotonic()
    source = args.source.resolve()
    assert source.is_relative_to(SOURCE_ROOT.resolve()) and source != SOURCE_ROOT.resolve()
    highReport = json.loads((source/'Data_HighBuild.json').read_text(encoding='utf-8'))
    highBlend = source/'Scene_Type89MediumTankHighPbr.blend'
    assert Hash(highBlend) == highReport['blendSha256']
    bpy.ops.wm.open_mainfile(filepath=str(highBlend))
    root = bpy.data.objects[MODEL]
    assert root['geometryVersion']==GEOMETRY and root['surfaceRevision']==SURFACE
    pairs,mask = BodyGame(root)
    rows = [{'name':obj.name,'vertices':len(obj.data.vertices),'triangles':Triangles(obj.data)}
            for obj in root.children_recursive if obj.type=='MESH']
    total = sum(row['triangles'] for row in rows)
    unpaired = [row for row in rows if not row['name'].startswith('Mesh_TrackLink')]
    print(f'{total-sum(row["triangles"] for row in unpaired):,} track triangles',flush=True)
    if args.geometry_only:
        print(json.dumps(unpaired,ensure_ascii=False),flush=True)
    assert total<=80000, f'{total:,} exceeds the complete vehicle limit'
    print(f'{total:,} triangles across {len(rows)} mesh nodes',flush=True)
    scene = bpy.context.scene
    scene['Type89Quality'] = 'Game'
    root['runtimeEnclosedShoeCleanup'] = False
    root['acceptance'] = 'HIGH_DERIVED_80K_GAME_MESH'
    # Legacy metadata described the previous atlas layout. The new game
    # material contains the projected micro finish in its tangent map.
    for propertyName in ('microSurface','poseOcclusionCorrection','paintFinish'):
        if propertyName in root:
            del root[propertyName]
    root['derivedHighSha256'] = highReport['blendSha256']
    bpy.context.preferences.filepaths.save_version = 0
    out = source/'Game'
    out.mkdir(exist_ok=True)
    (out/'Data_GameTriangles.json').write_text(json.dumps({'limit':80000,'triangles':total,'instances':rows},indent=2)+'\n',encoding='utf-8')
    if args.geometry_only:
        ExportGeometryProbe(root,out/'Model_Type89MediumTankGeometryProbe.glb')
        return

    os.environ['TYPE89_SOURCE_SUBDIR'] = str(source.relative_to(SOURCE_ROOT.resolve()))
    os.environ['TYPE89_REVIEW_SUBDIR'] = VERSION
    from Script_Type89PbrBake import BakedMaterial, Export, Image, SaveImage
    from types import SimpleNamespace
    bake = SimpleNamespace(BakedMaterial=BakedMaterial, Export=Export, Image=Image, SaveImage=SaveImage)
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    scene.render.bake.target = 'IMAGE_TEXTURES'
    for obj in root.children_recursive:
        if obj.type=='MESH':
            obj.hide_render = True
    mapDir = out/'Maps'
    mapDir.mkdir(exist_ok=True)
    sizes = {'Body':(args.resolution,args.resolution,args.resolution), 'Track':(1024,1024,1024), 'Guard':(1024,1024,1024)}
    files = {name:BakeAtlas(bake,name,group,mapDir,sizes[name],mask) for name,group in pairs.items()}
    gameMats = GameMaterials(bake,pairs,files)
    for obj in root.children_recursive:
        if obj.type!='MESH':
            continue
        for slot in obj.material_slots:
            slot.material = gameMats[Role(slot.material)]
        obj.hide_set(False)
        obj.hide_render = False
    root['gameBake'] = {'triangleCeiling':80000,'highSourceSha256':highReport['blendSha256'],
                        'normal':'Selected-to-active high surface, MikkTSpace OpenGL',
                        'ao':'High assembled AO with newly baked 24mm local contact occlusion',
                        'maps':{name:list(size) for name,size in sizes.items()}}
    bpy.data.orphans_purge(do_recursive=True)
    bpy.data.use_autopack = False
    RelinkGameMaps(gameMats.values(),files,out)
    blend = out/'Scene_Type89MediumTankGamePbr.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),relative_remap=False)
    glb = out/'Model_Type89MediumTank.glb'
    bake.Export(root,glb)
    measured, instances = GlbCounts(glb)
    assert measured['triangles'] <= 80000
    assert measured['triangles'] <= total
    assert instances.keys() == {row['name'] for row in rows}
    differences = {row['name']:row['triangles']-instances[row['name']] for row in rows
                   if row['triangles']!=instances[row['name']]}
    assert all(count>0 for count in differences.values())
    measured['exporterOmittedTriangles'] = sum(differences.values())-measured['exportCleanupTriangles']-measured['removedOnExplicitTriangulation']
    assert measured['exporterOmittedTriangles']>=0
    report = dict(schema='Type89GameSourceV55',highBlend=str(highBlend),highSha256=highReport['blendSha256'],
                  gameBlend=str(blend),gameBlendSha256=Hash(blend),gameGlb=str(glb),maps=files,atlasSizes=sizes,
                  authoringTriangles=total,measured=measured,exportDifferencesByNode=differences,
                  elapsedSeconds=round(time.monotonic()-start,2))
    (out/'Data_GameBuild.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(measured),flush=True)


if __name__=='__main__':
    Main()
