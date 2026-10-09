"""One shared orthographic view of actual metre-scale props on a 10 cm grid.
No individual fit-to-frame or object scaling; the source scene is left intact.
"""
import bpy,bmesh,math,os
from pathlib import Path
from mathutils import Vector
source=bpy.context.scene
out=Path(os.environ['COMMAND_ROOM_ROOT'])/'Taierzhuang1938/_shots/CommandRoom'
review=bpy.data.scenes.new('CommandRoomPhysicalScaleReview')
review.render.engine='CYCLES';review.cycles.device='CPU';review.cycles.samples=32;review.cycles.use_denoising=True
review.render.resolution_x=1280;review.render.resolution_y=720;review.render.resolution_percentage=100
review.view_settings.view_transform='AgX';review.view_settings.look='AgX - Medium High Contrast';review.view_settings.exposure=0
world=bpy.data.worlds.new('ScaleReviewWorld');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.7,.7,.7,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6;review.world=world
pieces=[]
try:
    for ob in source.objects:
        if ob.type!='MESH' or not ob.data.attributes.get('InspectionAsset'):continue
        if not any(x.value in (1,3,6,7,8) for x in ob.data.attributes['InspectionAsset'].data):continue
        mesh=ob.data.copy();bm=bmesh.new();bm.from_mesh(mesh)
        role=bm.faces.layers.int.get('InspectionAsset')
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[role] not in (1,3,6,7,8)],context='FACES')
        bm.to_mesh(mesh);bm.free()
        clone=bpy.data.objects.new('ScaleReview_'+ob.name,mesh);review.collection.objects.link(clone)
        clone.matrix_world=ob.matrix_world.copy();pieces.append(clone)
    points=[o.matrix_world@v.co for o in pieces for v in o.data.vertices]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(lo+hi)*.5;planeZ=lo.z-.002
    def FlatMaterial(name,color):
        mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1;return mat
    ground=FlatMaterial('ScaleReviewGround',(.39,.41,.40));ink=FlatMaterial('ScaleReviewGrid',(.12,.14,.13))
    data=bpy.data.meshes.new('ScaleReviewGround');data.from_pydata([(-2,-2,planeZ),(2,-2,planeZ),(2,2,planeZ),(-2,2,planeZ)],[],[(0,1,2,3)])
    ob=bpy.data.objects.new('ScaleReviewGround',data);review.collection.objects.link(ob);ob.data.materials.append(ground)
    for axis in [0,1]:
        for index in range(-15,16):
            value=index*.1;curve=bpy.data.curves.new('TenCentimetreGrid','CURVE');curve.dimensions='3D';curve.bevel_depth=.00055;curve.bevel_resolution=0
            spline=curve.splines.new('POLY');spline.points.add(1)
            ends=[(value,-1.5,planeZ+.0003,1),(value,1.5,planeZ+.0003,1)] if axis==0 else [(-1.5,value,planeZ+.0003,1),(1.5,value,planeZ+.0003,1)]
            for p,co in zip(spline.points,ends):p.co=co
            line=bpy.data.objects.new('TenCentimetreGrid',curve);review.collection.objects.link(line);line.data.materials.append(ink)
    text=bpy.data.curves.new('ScaleLegend','FONT');text.body='10 cm grid  |  one shared camera  |  no per-object scaling';text.size=.022
    label=bpy.data.objects.new('ScaleLegend',text);review.collection.objects.link(label);label.location=(lo.x-.02,hi.y+.055,planeZ+.001);label.data.materials.append(ink)
    lightData=bpy.data.lights.new('ScaleReviewSoftbox','AREA');lightData.energy=110;lightData.size=1.5
    light=bpy.data.objects.new('ScaleReviewSoftbox',lightData);review.collection.objects.link(light);light.location=center+Vector((-.5,-.3,1.4));light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    cameraData=bpy.data.cameras.new('ScaleReviewCamera');cameraData.type='ORTHO';cameraData.ortho_scale=max(hi.x-lo.x+.18,(hi.y-lo.y+.20)*1280/720)
    camera=bpy.data.objects.new('ScaleReviewCamera',cameraData);review.collection.objects.link(camera);camera.location=center+Vector((0,0,2));camera.rotation_euler=(0,0,0);review.camera=camera
    review.render.filepath=str(out/'Scene_PhysicalScaleTop.png');bpy.ops.render.render(write_still=True,scene=review.name)
finally:
    for ob in list(review.objects):bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.scenes.remove(review)
print('Saved common-scale 10 cm grid comparison')
