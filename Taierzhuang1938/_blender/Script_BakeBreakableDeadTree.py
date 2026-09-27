"""Rebuild the user-supplied dead tree in a dedicated Blender background process.
Use scripts/Script_BlenderMcp.mjs exec with sys.argv containing:
-- --source=Tree_50K.fbx --out=<Model directory> --blend-dir=<source directory>
The original FBX is read-only. The output includes a GLB, editable blend and statistics.
The two supplied FBX files were audited as identical; source hashes are recorded in docs.
"""
import bpy, bmesh, math, json, os
import numpy as np
from mathutils import Vector, Matrix

import argparse, sys
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--blend-dir', required=True, help='Source engineering directory outside the repository')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
outputDir = os.path.abspath(args.out)
os.makedirs(outputDir, exist_ok=True)
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
bpy.ops.import_scene.fbx(filepath=os.path.abspath(args.source))
source = next(obj for obj in bpy.context.selected_objects if obj.type == 'MESH')
source.hide_render = True
source.hide_set(True)
sourceCount = sum(len(p.vertices)-2 for p in source.data.polygons)
tree = source.copy()
tree.data = source.data.copy()
bpy.context.collection.objects.link(tree)
tree.name = 'TreeWorking'
tree.hide_render = False
tree.hide_set(False)
tree.data.transform(tree.matrix_world)
tree.matrix_world = Matrix.Identity(4)

# Cut just above the thin soil sheet, retaining the root flare.
bm = bmesh.new()
bm.from_mesh(tree.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=1e-6,
    plane_co=(0,0,0.018), plane_no=(0,0,1), clear_inner=True)
baseEdges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z-0.018)<1e-5 for v in e.verts)]
bmesh.ops.holes_fill(bm, edges=baseEdges, sides=0)
bm.to_mesh(tree.data)
bm.free()
scale = 7.2 / (0.968833983-0.018)
for v in tree.data.vertices:
    v.co = Vector((v.co.x*scale, v.co.y*scale, (v.co.z-0.018)*scale))
section = [v.co for v in tree.data.vertices if abs(v.co.z-.9)<.035]
pivot = Vector(((min(v.x for v in section)+max(v.x for v in section))*.5,
    (min(v.y for v in section)+max(v.y for v in section))*.5, 0))
for v in tree.data.vertices: v.co -= pivot
bpy.ops.object.select_all(action='DESELECT')
tree.select_set(True)
bpy.context.view_layer.objects.active = tree
mod = tree.modifiers.new('GameBudget', 'DECIMATE')
mod.ratio = min(1, 12000 / sum(len(p.vertices)-2 for p in tree.data.polygons))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)

# Shared 2K PBR maps; bark is dielectric even if the generated source metal map is noisy.
mat = source.data.materials[0].copy()
mat.name = 'Material_DeadTreeBark'
tree.data.materials.clear()
tree.data.materials.append(mat)
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE' and node.image:
        node.image = node.image.copy()
        node.image.scale(2048,2048)
        node.image.pack()
    if node.type == 'BSDF_PRINCIPLED':
        for link in list(node.inputs['Metallic'].links): mat.node_tree.links.remove(link)
        node.inputs['Metallic'].default_value = 0

# Wood end-grain texture for the two matching closed fracture faces.
cap = bpy.data.materials.new('Material_FracturedWood')
cap.use_nodes = True
shader = cap.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .92
size = 256
y,x = np.mgrid[0:size,0:size].astype(np.float32)/(size-1)*2-1
theta = np.arctan2(y,x)
radius = np.sqrt((x*.94)**2+y*y)
grain = np.sin((radius+.02*np.sin(theta*7))*88)*.035
cracks = ((np.abs(np.sin(theta*9+radius*.7))<.04)&(radius>.3)).astype(np.float32)*.11
pixels = np.ones((size,size,4),dtype=np.float32)
for channel, color in enumerate([.40,.285,.165]): pixels[:,:,channel] = color + grain - cracks
capImage = bpy.data.images.new('Texture_FracturedWood',width=size,height=size)
capImage.pixels.foreach_set(pixels.ravel())
capImage.pack()
tex = cap.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = capImage
cap.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
tree.data.materials.append(cap)

parts=[]
for label,upper in [('Stump',False),('Crown',True)]:
    obj=tree.copy(); obj.data=tree.data.copy(); obj.name=label
    bpy.context.collection.objects.link(obj)
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,
        plane_co=(0,0,.9),plane_no=(0,0,1),clear_inner=upper,clear_outer=not upper)
    edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-.9)<1e-5 for v in e.verts)]
    faces=bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces']
    uv=bm.loops.layers.uv.verify()
    for face in faces:
        face.material_index=1
        for loop in face.loops:
            loop[uv].uv=(loop.vert.co.x/1.05+.5,loop.vert.co.y/1.05+.5)
    # Deform both sides with the same continuous function so the intact seam closes.
    for v in bm.verts:
        dz=abs(v.co.z-.9)
        if dz<.3:
            angle=math.atan2(v.co.y,v.co.x)
            v.co.z += (.065*math.sin(angle*7)+.032*math.sin(angle*13+1.1))*(1-dz/.3)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data); bm.free()
    for p in obj.data.polygons: p.use_smooth=(p.material_index==0)
    parts.append(obj)
bpy.data.objects.remove(tree,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
glb=os.path.join(outputDir,'Model_BreakableDeadTree.glb')
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_animations=False,
    export_image_format='AUTO',export_extras=True)
report={'sourceFiles':['Tree_50K.fbx','Tree_50k_1.fbx'],'identicalSources':True,
    'sourceTriangles':sourceCount,'height':7.2,'breakHeight':.9,
    'parts':{obj.name:len(obj.data.polygons) for obj in parts},'bytes':os.path.getsize(glb)}
open(os.path.join(outputDir,'Data_TreeProcessing.json'),'w',encoding='utf-8').write(json.dumps(report,indent=2))
# Keep the editable deliverable compact, without the duplicate 500K source meshes.
for obj in list(bpy.data.objects):
    if obj not in parts: bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
os.makedirs(args.blend_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.blend_dir,'Scene_BreakableDeadTree.blend'))
result=report
