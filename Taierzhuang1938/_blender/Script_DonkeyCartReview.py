"""Local-only, identical neutral studio views of the saved editable asset."""
import bpy, json
from pathlib import Path
from mathutils import Vector
scene=bpy.context.scene
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
camera=bpy.data.objects['ReviewCamera'];scene.camera=camera
views={
 'Front':((0,7,1.04),(0,0,.84),1.92,640,640),
 'Rear':((0,-7,1.04),(0,-.45,.84),1.92,640,640),
 'Quarter':((-4,5,2.8),(0,-.45,.81),3.85,640,400),
 'Side':((-7,-.49,1.14),(0,-.49,.86),3.83,640,360),
 'Head':((-2.7,3.7,1.9),(0,.94,1.20),.94,640,640),
}
requested=json.loads(scene.get('DonkeyReviewViews','["Front","Rear","Quarter"]'))
poses={o:o.data.pose_position for name in ('DonkeyRig','DonkeyCartRig') if (o:=bpy.data.objects.get(name))}
for obj in poses:obj.data.pose_position='REST'
for name in requested:
    position,target,scale,width,height=views[name]
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.filepath=str(base/'Review'/('Render_'+name+'.png'))
    bpy.ops.render.render(write_still=True)
    print(scene.render.filepath)
for obj,pose in poses.items():obj.data.pose_position=pose
