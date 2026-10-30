import bpy,json,os,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
window=bpy.context.window_manager.windows[0]
area=next((a for a in window.screen.areas if a.type=='VIEW_3D'),window.screen.areas[0])
sourceScene=window.scene
for old in list(bpy.data.scenes):
    if old!=sourceScene and old.name.startswith('Scene_Type94ActualGameReimport') and old.get('BlenderMcpTask')=='Type94Tankette':
        for obj in list(old.objects):
            if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(old)
checkScene=bpy.data.scenes.new('Scene_Type94ActualGameReimport')
checkScene['BlenderMcpTask']='Type94Tankette'
checkScene['SourceGltfSha256']=hashlib.sha256((root/'Exports/Model_Type94TanketteGameCandidate.glb').read_bytes()).hexdigest()
window.scene=checkScene
with bpy.context.temp_override(window=window,area=area):
    bpy.ops.import_scene.gltf(filepath=str(root/'Exports/Model_Type94TanketteGameCandidate.glb'))
    bpy.context.view_layer.update()
    meshes=[o for o in checkScene.objects if o.type=='MESH']
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    bounds=[[min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)]]
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    channels=[]
    for material in {m for o in meshes for m in o.data.materials if m}:
        images=[n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
        for image in images:
            image.pack()
            channels.append({'material':material.name,'image':image.name,'size':list(image.size),'colorSpace':image.colorspace_settings.name})
    for o in sourceScene.objects:
        if o.type in ['CAMERA','LIGHT']:checkScene.collection.objects.link(o)
    checkScene.world=sourceScene.world
    checkScene.camera=bpy.data.objects['Camera_Reference']
    checkScene.render.engine='CYCLES';checkScene.cycles.samples=16;checkScene.cycles.use_denoising=True
    checkScene.render.resolution_x=1280;checkScene.render.resolution_y=853;checkScene.render.resolution_percentage=100
    checkScene.render.image_settings.file_format='PNG';checkScene.render.film_transparent=True
    checkScene.render.filepath=str(root/'Acceptance/Scene_ActualGameReimport.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.libraries.write(str(root/'Acceptance/Scene_ActualGameReimport.blend'),{checkScene},fake_user=True,compress=True)
report={'sha256':checkScene['SourceGltfSha256'],'actualImport':True,'triangles':triangles,'meshNodes':len(meshes),'boundsBlenderM':bounds,'images':channels,
        'linksLeft':sum(o.name.startswith('TrackLink_Left_') for o in checkScene.objects),
        'linksRight':sum(o.name.startswith('TrackLink_Right_') for o in checkScene.objects)}
(root/'Acceptance/Data_ActualBlenderReimport.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
window.scene=sourceScene
print(json.dumps({k:report[k] for k in ['actualImport','triangles','meshNodes','boundsBlenderM','linksLeft','linksRight']},indent=2))
