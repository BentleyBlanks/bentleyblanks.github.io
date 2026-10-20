"""Form a slack cotton leaf over the high sculpt under actual tie constraints."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
for obj in list(scene.objects):
    if obj.name.startswith('StudyV7_'):bpy.data.objects.remove(obj,do_unlink=True)
body=bpy.data.objects['Pack_Bundle'];binding=next(o for o in bpy.data.objects['Pack_Binding'].children_recursive if o.type=='MESH')
proxy=body.copy();proxy.data=body.data.copy();proxy.name='StudyV7_ClothCollider';proxy.parent=None;scene.collection.objects.link(proxy);proxy.hide_render=True
bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
proxy.data.calc_loop_triangles();mod=proxy.modifiers.new('CollisionSurfaceReduction','DECIMATE');mod.ratio=10000/len(proxy.data.loop_triangles);bpy.ops.object.modifier_apply(modifier=mod.name)
mod=proxy.modifiers.new('RemoveAuthoredMicroGrooves','SMOOTH');mod.factor=.65;mod.iterations=5;bpy.ops.object.modifier_apply(modifier=mod.name)
proxy.modifiers.new('CottonContact','COLLISION');proxy.collision.thickness_outer=.0005;proxy.collision.thickness_inner=.0005;proxy.collision.cloth_friction=8
bodyTree=BVHTree.FromObject(proxy,bpy.context.evaluated_depsgraph_get());tieTree=BVHTree.FromObject(binding,bpy.context.evaluated_depsgraph_get())
# Width sampled from the actual soft outline, not a rectangular sheet bound.
bins={}
for vertex in body.data.vertices:
    key=round(vertex.co.z/.002);bins[key]=max(bins.get(key,0),abs(vertex.co.x))
verts=[];faces=[];uvs=[];pins=[];nx=80;nz=64
for row in range(nz+1):
    z=-.144+row/nz*.288;key=round(z/.002);half=max([bins[k] for k in range(key-1,key+2) if k in bins] or [.17])*.965
    for column in range(nx+1):
        u=column/nx;x=(2*u-1)*half
        hit=bodyTree.ray_cast(Vector((x,-.3,z)),Vector((0,1,0)),.4)
        y=(hit[0].y if hit[0] is not None else -.095)-.0010
        tie=tieTree.ray_cast(Vector((x,-.3,z)),Vector((0,1,0)),.4)
        pinned=False
        if tie[0] is not None and tie[0].y<y+.001 and tie[1].y<-.30:
            pinned=True;y=max(tie[0].y+.0010,y)
        if column in (0,1,nx-1,nx) or row in (0,1,nz-1,nz):pinned=True
        verts.append((x,y,z));uvs.append((u,row/nz));pins.append(1.0 if pinned else 0.0)
for row in range(nz):
    for column in range(nx):
        a=row*(nx+1)+column;faces.append((a,a+1,a+nx+2,a+nx+1))
restVerts=[(x*1.055,y,z*1.055) for x,y,z in verts]
mesh=bpy.data.meshes.new('StudyV7_FrontLeafGeometry');mesh.from_pydata(restVerts,[],faces);mesh.update();skin=bpy.data.objects.new('StudyV7_FrontLeafSimulation',mesh);scene.collection.objects.link(skin)
uv=mesh.uv_layers.new(name='UVMap')
for loop in mesh.loops:
    u,v=uvs[loop.vertex_index];uv.data[loop.index].uv=(.02+.46*u,.52+.46*v)
mesh.materials.append(body.data.materials[0])
for polygon in mesh.polygons:polygon.use_smooth=True
skin.shape_key_add(name='Basis');target=skin.shape_key_add(name='TieContactTarget');target.value=0
for point,coordinate in zip(target.data,verts):point.co=coordinate
target.keyframe_insert(data_path='value',frame=1);target.value=1;target.keyframe_insert(data_path='value',frame=24);target.value=0
pin=skin.vertex_groups.new(name='TieAndFoldConstraints')
for index,weight in enumerate(pins):
    if weight:pin.add([index],weight,'REPLACE')
cloth=skin.modifiers.new('RelaxedHomespunCotton','CLOTH');settings=cloth.settings;settings.quality=6;settings.mass=.16;settings.air_damping=4
settings.tension_stiffness=40;settings.compression_stiffness=35;settings.shear_stiffness=15;settings.bending_stiffness=.0015
settings.tension_damping=8;settings.compression_damping=8;settings.shear_damping=6;settings.bending_damping=.8
settings.vertex_group_mass=pin.name;settings.pin_stiffness=1
if hasattr(settings,'use_dynamic_mesh'):settings.use_dynamic_mesh=False
settings.effector_weights.gravity=.25
cloth.collision_settings.use_collision=True;cloth.collision_settings.distance_min=.0003;cloth.collision_settings.collision_quality=4;cloth.collision_settings.use_self_collision=False
cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=70
scene.frame_start=1;scene.frame_end=70;scene.frame_set(1);scene['HighClothNextFrame']=2
bpy.context.view_layer.objects.active=skin
print('HIGH_CLOTH_SETUP',json.dumps({'vertices':len(verts),'quads':len(faces),'pinned':sum(pins),'restSlack':1.055}))
