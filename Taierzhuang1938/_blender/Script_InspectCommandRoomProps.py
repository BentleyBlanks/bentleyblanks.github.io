"""Render the actual source meshes in three neutral views, without changing the room."""
import bpy,bmesh,math,os
from pathlib import Path
from mathutils import Vector,Matrix
source=bpy.context.scene
out=Path(os.environ.get('COMMAND_ROOM_ROOT',r'C:\Users\Bentl\Documents\bentleyblanks_Codex_CommandRoomMenu_20261004'))/'Taierzhuang1938/_shots/CommandRoom'
out.mkdir(parents=True,exist_ok=True)
review=bpy.data.scenes.new('CommandRoomInspection')
review.render.engine='CYCLES';review.cycles.device='CPU';review.cycles.samples=32;review.cycles.use_denoising=True
review.render.resolution_x=720;review.render.resolution_y=900;review.render.resolution_percentage=100
review.view_settings.view_transform='AgX';review.view_settings.look='AgX - Medium High Contrast';review.view_settings.exposure=0
world=bpy.data.worlds.new('InspectionWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.48,.44,.38,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;review.world=world
cameraData=bpy.data.cameras.new('InspectionCamera');cameraData.type='ORTHO'
camera=bpy.data.objects.new('InspectionCamera',cameraData);review.collection.objects.link(camera);review.camera=camera
for asset,name,views in [(1,'Cap',['Front','Side','Top']),(2,'Coat',['Front','Side','Back']),(3,'InkBottle',['Front','Side','Top'])]:
    pieces=[]
    for ob in source.objects:
        if ob.type!='MESH' or not ob.data.attributes.get('InspectionAsset'):continue
        if not any(x.value==asset for x in ob.data.attributes['InspectionAsset'].data):continue
        mesh=ob.data.copy();bm=bmesh.new();bm.from_mesh(mesh)
        attr=bm.faces.layers.int.get('InspectionAsset')
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[attr]!=asset],context='FACES')
        bm.to_mesh(mesh);bm.free()
        clone=bpy.data.objects.new('Inspect_'+ob.name,mesh);review.collection.objects.link(clone);clone.matrix_world=ob.matrix_world.copy();pieces.append(clone)
    points=[p.matrix_world@v.co for p in pieces for v in p.data.vertices]
    low=Vector(tuple(min(v[i] for v in points) for i in range(3)));high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center=(low+high)*.5;size=max(high-low)
    if asset==1:
        turn=Matrix.Translation(center)@Matrix.Rotation(math.radians(35),4,'Z')@Matrix.Translation(-center)
        for ob in pieces:ob.matrix_world=turn@ob.matrix_world
    lightData=bpy.data.lights.new('InspectionSoftbox','AREA');lightData.energy=35*size*size;lightData.shape='DISK';lightData.size=size*1.3
    light=bpy.data.objects.new('InspectionSoftbox',lightData);review.collection.objects.link(light)
    light.location=center+Vector((-size*1.2,-size*1.5,size*1.6));light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    for view in views:
        direction=Vector((0,-1,.35 if asset==1 else .03)) if view=='Front' else Vector((1,-.12,.3 if asset==1 else .05)) if view=='Side' else Vector((0,1,0)) if view=='Back' else Vector((0,-.001,1))
        camera.location=center+direction.normalized()*size*3;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        cameraData.ortho_scale=size*1.38
        review.render.filepath=str(out/f'Scene_ReferenceCheck{name}{view}.png')
        bpy.ops.render.render(write_still=True,scene=review.name)
    for ob in pieces+[light]:bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.scenes.remove(review)
print('Saved neutral three-view renders of actual cap, coat and bottle geometry')
