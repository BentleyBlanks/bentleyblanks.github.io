"""Rebuild the user-supplied rolled cigarette through Script_BlenderMcp exec.
Source FBX stays outside Git; embedded maps and UVs are retained at 1K.
"""
import bpy, json, os, hashlib
from pathlib import Path
from mathutils import Vector

repoRoot = (Path(bpy.context.scene['CigaretteProject']).parent
            if 'CigaretteProject' in bpy.context.scene else Path(__file__).resolve().parents[2])
sourcePath = Path(os.environ.get('CIGARETTE_SOURCE', r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/建模/卷烟/Smoke.fbx'))
blendPath = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Cigarette/Model_Cigarette.blend')
outputPath = repoRoot / 'Taierzhuang1938/Model/Model_Cigarette.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(sourcePath))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1
obj = meshes[0]
bpy.context.view_layer.objects.active = obj
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
obj.data.calc_loop_triangles()
sourceTriangles = len(obj.data.loop_triangles)
points = [v.co.copy() for v in obj.data.vertices]
low = Vector([min(p[i] for p in points) for i in range(3)])
high = Vector([max(p[i] for p in points) for i in range(3)])
assert high.z-low.z > 5*max(high.x-low.x,high.y-low.y)
# Measured source: long axis +Z, ash at the high end, twisted paper mouth at low end.
# Blender +Y becomes glTF -Z. The mouth embeds 5 mm behind the local origin.
scale = .09/(high.z-low.z)
for v in obj.data.vertices:
 p=v.co.copy()
 v.co=((p.x-(low.x+high.x)/2)*scale,(p.z-low.z)*scale-.005,-(p.y-(low.y+high.y)/2)*scale)
mod=obj.modifiers.new('CigaretteBudget','DECIMATE');mod.ratio=1800/sourceTriangles;mod.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=mod.name)
obj.data.calc_loop_triangles()
actualTriangles=len(obj.data.loop_triangles)
assert 500 <= actualTriangles <= 2000
obj.name='Cigarette';obj.data.name='Cigarette'
for p in obj.data.polygons:p.use_smooth=True
for mat in obj.data.materials:
 mat.name='CigarettePaperAsh'
 for node in mat.node_tree.nodes:
  if node.type=='TEX_IMAGE' and node.image:
   image=node.image
   image.scale(1024,1024)
   image.pack()
blendPath.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath))
bpy.ops.export_scene.gltf(filepath=str(outputPath),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
receipt={'sourceFile':sourcePath.name,'sourceSha256':hashlib.sha256(sourcePath.read_bytes()).hexdigest(),'sourceTriangles':sourceTriangles,'triangles':actualTriangles,'sourceBounds':[list(low),list(high)],'sourceAshAxis':'+Z','runtimeAshAxis':'-Z','lengthM':.09,'mouthInsetM':.005,'textureSize':1024}
(outputPath.parent/'Data_Cigarette.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt))
