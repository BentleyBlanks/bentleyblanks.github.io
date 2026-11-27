"""Bake Type89 geometry visibility on the existing high and game UVs.

Run through Script_BlenderMcp. The bake proxy retains contact at fixed seams,
isolates moving assemblies, and gives each shoe actual neighbour geometry.
The two linear fields are stored separately from the authored surface maps.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
import numpy as np


HERE = Path(__file__).resolve().parent
ASSET = HERE.parent/'Model'/'Type89MediumTank'
ROOT = 'Model_Type89MediumTank'
BANDS = (.042, .145)
SAMPLES = 24
SPACING = 9
WHEEL = re.compile(r'^Node_(RoadWheel|LeadingWheel|FrontIdler|RearSprocket|ReturnRoller)')
MOVING = {
    'Node_BowHatch', 'Node_BowDoorLatch', 'Node_BowMachineGun', 'Node_BowRoundPortCover',
    'Node_SideVisionFlapLeft', 'Node_SideVisionFlapRight',
    'Node_SideVisionLatchLeft', 'Node_SideVisionLatchRight',
    'Node_DriverVisionFlap', 'Node_DriverPortShutter', 'Node_EngineHatchLeft', 'Node_EngineHatchRight',
    'Node_CommanderHatchFront', 'Node_CommanderHatchRear', 'Node_MainGunPitch',
    'Node_MainGunRecoil', 'Node_TurretMachineGun',
}


def Signal(material):
    if not material or not material.use_nodes or material.get('Type89Role') in {'Glass','Shadow'}:
        return None
    return next((node.image for node in material.node_tree.nodes
                 if node.type=='TEX_IMAGE' and node.label=='Orm' and node.image),None)


def Group(obj, root):
    current = obj
    while current and current!=root:
        name = current.name
        if name.startswith('Node_TrackLink'):
            return 'Belt'
        if name in MOVING or WHEEL.match(name) or name=='Node_TurretYaw':
            return name
        current = current.parent
    return 'Hull'


def EmitMaterial(name,image):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    graph = material.node_tree
    graph.nodes.clear()
    output = graph.nodes.new('ShaderNodeOutputMaterial')
    emission = graph.nodes.new('ShaderNodeEmission')
    bands = graph.nodes.new('ShaderNodeCombineColor')
    for distance,to in zip(BANDS,('Red','Green')):
        ray = graph.nodes.new('ShaderNodeAmbientOcclusion')
        ray.samples = SAMPLES
        ray.only_local = True
        ray.inputs['Distance'].default_value = distance
        graph.links.new(ray.outputs['AO'],bands.inputs[to])
    bands.inputs['Blue'].default_value = 1
    graph.links.new(bands.outputs[0],emission.inputs[0])
    graph.links.new(emission.outputs[0],output.inputs['Surface'])
    target = graph.nodes.new('ShaderNodeTexImage')
    target.image = image
    graph.nodes.active = target
    return material


def Field(name,size):
    image = bpy.data.images.new(name,width=size[0],height=size[1],alpha=False,float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1,1,1,1)
    image.use_view_as_render = False
    return image


def HullSeat(position,normal):
    return 1.54<position.z<1.803 and normal.z>.20 and abs(position.x)<1.12 and abs(position.y-.12)<1.42


def Race(position,normal):
    return position.z<1.881 and abs(position.x)<.735 and abs(position.y-.10)<.81


def Row(obj,group,receiver=True,transform=None,faceFilter=None):
    transform = (transform if transform is not None else obj.matrix_world).copy()
    receiver = receiver and bool(obj.data.uv_layers) and not obj.get('battleWearMud')
    return (obj,group,receiver,transform,faceFilter)


def BuildRows(root):
    rows = []
    representatives = {}
    meshes = sorted((obj for obj in root.children_recursive if obj.type=='MESH'),key=lambda obj:obj.name)
    names = {obj.name:obj for obj in meshes}
    for obj in meshes:
        group = Group(obj,root)
        if group=='Belt':
            if obj.name.startswith('Mesh_TrackLink'):
                # A repeated track bank is stationary in aggregate when seen
                # from its skirt. Individual treads receive a shoe-local bake.
                rows.append(Row(obj,'Hull',False))
                representatives.setdefault(obj.data,obj)
            continue
        if obj.name=='Mesh_ExhaustGuardPerforatedSheet':
            # The game sheet is opacity-mapped. An opaque triangle proxy here
            # would falsely block every hole in the assembled hull's bake.
            rows.append(Row(obj,'Guard'))
            continue
        rows.append(Row(obj,group))
        if WHEEL.match(group):
            rows.append(Row(obj,'Hull',False))
    if 'Mesh_ExhaustGuardPerforatedSheet' in names:
        rows.append(Row(names['Mesh_ExhaustGuard'],'Guard',False))
    rows.append(Row(names['Mesh_TurretYaw'],'Hull',False,faceFilter=Race))
    rows.append(Row(names['Mesh_Hull'],'Node_TurretYaw',False,faceFilter=HullSeat))

    # Receivers on a moving lid still see the small, fixed seating surfaces.
    # Keep this one-way so an opened lid never leaves a baked shape on the hull.
    seats = [
        ('Mesh_CommanderCupola','Node_CommanderHatchFront',lambda p,n: p.z>2.45),
        ('Mesh_CommanderCupola','Node_CommanderHatchRear',lambda p,n: p.z>2.45),
        ('Mesh_BowPlate','Node_DriverVisionFlap',lambda p,n: .00<p.x<.51 and p.z>1.45),
        ('Mesh_TurretYaw','Node_MainGunPitch',lambda p,n: p.y>.60 and abs(p.x)<.50),
        ('Mesh_EngineDeck','Node_EngineHatchLeft',lambda p,n: p.x<.10 and p.z>1.30),
        ('Mesh_EngineDeck','Node_EngineHatchRight',lambda p,n: p.x>-.10 and p.z>1.30),
        ('Mesh_SideVisionFrameLeft','Node_SideVisionFlapLeft',None),
        ('Mesh_SideVisionFrameRight','Node_SideVisionFlapRight',None),
    ]
    for name,group,region in seats:
        rows.append(Row(names[name],group,False,faceFilter=region))

    pitch = json.loads((ASSET/'Data_TrackPath.json').read_text(encoding='utf-8'))['pitchM']
    for i,shoe in enumerate(representatives.values()):
        group = 'Shoe'+str(i)
        rows.append(Row(shoe,group,True,Matrix.Identity(4)))
        for distance in (-pitch,pitch):
            rows.append(Row(shoe,group,False,Matrix.Translation((0,distance,0))))
    return rows,meshes


def CreateProxy(scene,rows,atlasMaterials,scratchMaterial):
    groups = {}
    copies = []
    for active,group,receive,transform,faceFilter in rows:
        index = groups.setdefault(group,len(groups))
        offset = Vector((SPACING*(index%9),SPACING*(index//9),0))
        materialSlots = [
            atlasMaterials.get(Signal(material),scratchMaterial) if receive else scratchMaterial
            for material in active.data.materials
        ]
        mesh = active.data.copy()
        if faceFilter:
            edit = bmesh.new()
            edit.from_mesh(mesh)
            normalMatrix = transform.to_3x3().inverted().transposed()
            invalid = [face for face in edit.faces if not faceFilter(transform@face.calc_center_median(),
                                                                  normalMatrix@face.normal)]
            bmesh.ops.delete(edit,geom=invalid,context='FACES')
            edit.to_mesh(mesh)
            edit.free()
            assert len(mesh.polygons)>0,(active.name,group)
        piece = bpy.data.objects.new('Contact bake '+active.name,mesh)
        scene.collection.objects.link(piece)
        transform.translation += offset
        piece.matrix_world = transform
        if materialSlots:
            # Assignment rather than collapsing avoids losing per-face slots.
            for i,material in enumerate(materialSlots):
                mesh.materials[i] = material
        else:
            mesh.materials.append(scratchMaterial)
        copies.append(piece)
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.context.view_layer.update()
    assert bpy.ops.object.join()=={'FINISHED'}
    proxy = bpy.context.object
    proxy.name = 'Type89 assembled contact bake'
    proxy.data.calc_loop_triangles()
    print('Joined',len(rows),'proxies in',len(groups),'pose groups with',
          len(proxy.data.loop_triangles),'triangles',flush=True)
    return proxy,groups


def Bake(source,destination,pilot):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root = bpy.data.objects[ROOT]
    assert root['geometryVersion']=='20261126GeometryV55' and root['surfaceRevision'] in ('SurfaceV17','SurfaceV18')
    bpy.context.view_layer.update()
    rows,meshes = BuildRows(root)
    images = {Signal(material) for obj in meshes for material in obj.data.materials}
    images.discard(None)
    scratchScene = bpy.data.scenes.new('Type89 contact bake only')
    bpy.context.window.scene = scratchScene
    fields = {}
    materials = {}
    for image in sorted(images,key=lambda image:image.name):
        size = (min(1024,int(image.size[0])),)*2 if pilot else tuple(image.size)
        field = Field('Bake '+image.name,size)
        fields[image] = field
        materials[image] = EmitMaterial('Contact '+image.name,field)
        print('Target',image.name,size,flush=True)
    scratch = EmitMaterial('Cast without receiving',Field('Contact scratch',(8,8)))
    proxy,groups = CreateProxy(scratchScene, rows, materials,scratch)
    scratchScene.render.engine = 'CYCLES'
    scratchScene.cycles.device = 'CPU'
    scratchScene.cycles.samples = 4
    scratchScene.render.threads_mode = 'FIXED'
    scratchScene.render.threads = 7
    assert proxy.select_get() and len(bpy.context.selected_objects)==1
    result = bpy.ops.object.bake(type='EMIT',use_selected_to_active=False,use_clear=False,
        margin=4 if pilot else 6, margin_type='EXTEND')
    assert result=={'FINISHED'},result

    destination.mkdir(parents=True,exist_ok=True)
    statistics = []
    for image,field in fields.items():
        width,height = field.size
        pixels = np.empty((height,width,4),np.float32)
        field.pixels.foreach_get(pixels.ravel())
        values = pixels[::-1,:,:2].copy()
        assert np.isfinite(values).all(),image.name
        weights = np.rint(np.clip(values,0,1)*65535).astype(np.uint16)
        covered = np.count_nonzero(np.min(weights,axis=2)<64500)
        assert covered>50,(image.name,covered)
        name = Path(image.name).stem
        np.save(destination/(name+'.npy'),weights,allow_pickle=False)
        statistics.append({'file':name+'.npy','source':image.name,
            'size':[width,height],'allocatedContactTexels':int(covered),
            'nearP02':float(np.quantile(values[:,:,0],.02)),'midP02':float(np.quantile(values[:,:,1],.02))})
        print(statistics[-1],flush=True)
    report = {'bandsM':list(BANDS),'hemisphereSamplesPerBand':SAMPLES,'groups':list(groups),
              'geometryRoles':dict(Counter(group for _,group,_,_,_ in rows)),'maps':statistics}
    (destination/'Data_Bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('destination',type=Path)
    parser.add_argument('--pilot',action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    Bake(args.source,args.destination,args.pilot)
