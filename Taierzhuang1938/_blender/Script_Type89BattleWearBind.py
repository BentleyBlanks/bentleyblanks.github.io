"""Bind the V17 baked maps and low mud meshes in the editable game source."""
import json
from pathlib import Path

import bpy
import numpy as np

from Script_Type89BattleWearHigh import AUTHORING, ROOT, RECIPE, MudObject, BodyMeshes


def Bind(version):
    target = version/'Game'/'Scene_Type89MediumTankGamePbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root = bpy.data.objects[ROOT]
    if root['surfaceRevision']==RECIPE['revision']:
        baseline = version.with_name('GeometryV55SurfaceV16')/'Game'/target.name
        bpy.ops.wm.open_mainfile(filepath=str(baseline))
        root = bpy.data.objects[ROOT]
    assert root['surfaceRevision']=='SurfaceV16' and root['geometryVersion']==RECIPE['geometryVersion']

    materials = {material for obj in BodyMeshes(root) for material in obj.data.materials}
    maps = {}
    for material in materials:
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or not node.image:
                continue
            original = node.image
            if original not in maps:
                name = original.name
                original.name = name+'V16'
                filename = name if name.endswith('.png') else name+'.png'
                image = bpy.data.images.load(str(target.parent/'Maps'/filename),check_existing=False)
                image.name = name
                image.colorspace_settings.name = original.colorspace_settings.name
                image.pack()
                image.filepath_raw = '//Maps/'+filename
                maps[original] = image
            node.image = maps[original]

    manifest = json.loads((version/'Game'/'Data_BattleWearRuntimeGeometry.json').read_text(encoding='utf-8'))
    variants = manifest['trackVariants']
    source = bpy.data.objects['Mesh_TrackLinkLeft000'].data
    track = next(material for material in source.materials if material.get('Type89Role')=='Track')
    shoes = []
    for tile in range(4):
        mesh = source.copy()
        mesh.name = f'Type89TrackShoeEarth{tile}'
        layer = mesh.uv_layers.active
        coords = np.empty(len(layer.uv)*2,dtype=np.float32)
        layer.uv.foreach_get('vector',coords)
        coords = coords.reshape(-1,2)*.5 + np.array((tile%2,(1-tile//2)),dtype=np.float32)*.5
        layer.uv.foreach_set('vector',coords.ravel())
        shoes.append(mesh)
    for name,variant in variants.items():
        bpy.data.objects[name].data = shoes[variant]

    collection = bpy.data.collections.new('Type89BattleWearMud')
    root.users_collection[0].children.link(collection)
    swatch = RECIPE['tracks']['mudTile']
    for row in manifest['heroClods']:
        parent = bpy.data.objects[row['parent']]
        obj = MudObject(collection,row['name'],parent,row['vertices'],row['faces'],track)
        layer = obj.data.uv_layers.new()
        positions = np.asarray(row['vertices'])
        planar = np.asarray(row.get('planar',positions[:,:2]-np.asarray(row['centre'][:2])))
        swatchCoordinates = planar/np.asarray(row['radii'][:2])/1.29
        pixels = np.asarray(swatch['offsetPixels'])+swatchCoordinates*np.array([1,-1])*swatch['halfSizePixels']
        uv = pixels/swatch['dimensionsPixels']
        uv[:,1] = 1-uv[:,1]
        for loop in obj.data.loops:
            layer.data[loop.index].uv = uv[loop.vertex_index]
    root['surfaceRevision'] = RECIPE['revision']
    root['battleWearReference'] = RECIPE['referenceEdition']
    bpy.data.orphans_purge(do_recursive=True)
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene['BlenderMcpTask'] = AUTHORING
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    meshes = BodyMeshes(root)
    for obj in meshes:
        obj.data.calc_loop_triangles()
    print('Saved editable game source',str(target), 'with',
          sum(len(obj.data.loop_triangles) for obj in meshes),'source triangles and',len(meshes),'mesh instances.',flush=True)
