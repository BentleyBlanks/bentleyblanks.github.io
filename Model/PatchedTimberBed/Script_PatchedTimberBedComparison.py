"""Optional local original high geometry transport and authoritative source render."""
import bpy, pathlib, json, argparse, sys
from mathutils import Vector
parser=argparse.ArgumentParser();parser.add_argument('--source-root',required=True);parser.add_argument('--review-root',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=pathlib.Path(args.source_root);out=pathlib.Path(args.review_root)
bpy.ops.wm.open_mainfile(filepath=str(root/'Scene_OriginalBed.blend'))
scene=bpy.context.scene
scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False;scene.render.use_crop_to_border=False;scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.filepath=str(out/'Render_OriginalSource.png');bpy.ops.render.render(write_still=True)
objects=[o for o in scene.objects if o.type=='MESH' and not o.hide_render and o.name!='Plane']
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.join();o=bpy.context.object;o.name='Original_BN_WholeBed'
# VERTEX_COLORS is a sample of the original Base Color shader at source corners.
# It is a local geometry comparison transport, not pixel-identical material evidence.
for m in o.data.materials:
 if m and m.use_nodes:
  for n in m.node_tree.nodes:
   if n.type=='VERTEX_COLOR' and not n.layer_name:n.layer_name='Color'
attr=o.data.color_attributes.new(name='OriginalBakedColor',type='FLOAT_COLOR',domain='CORNER');o.data.color_attributes.active_color=attr
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.target='VERTEX_COLORS';scene.render.bake.use_selected_to_active=False
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
bpy.ops.object.bake(type='DIFFUSE')
for m in o.data.materials:
 if m and m.use_nodes:
  p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if p:
   for link in list(p.inputs['Base Color'].links):m.node_tree.links.remove(link)
   p.inputs['Base Color'].default_value=(1,1,1,1)
   # Clear stale color-node references; exporter uses only the explicit baked layer.
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data:
  p=root/'Bakes'/('Texture_Original'+str(im.as_pointer())+'.png');im.filepath_raw=str(p);im.file_format='PNG';im.save();im.pack()
# Wait for final pivot receipt, already completed by the game bake in normal runs.
receipt=out/'Data_BakeReport.json'
if receipt.exists():offset=Vector(json.loads(receipt.read_text())['originOffsetBlender'])
else:raise RuntimeError('Rebuild the final bed first; its precise pivot receipt is required')
o.location-=offset
bpy.ops.export_scene.gltf(filepath=str(out/'Model_OriginalBed.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='OriginalBakedColor',export_all_vertex_colors=False,export_tangents=True)
(out/'Data_OriginalComparison.json').write_text(json.dumps({'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'offset':list(offset),'materialTransport':'Original high geometry, DIFFUSE COLOR sampled to source CORNER colors; original normal graphs. Cycles source render is authoritative for source material comparison.'},indent=2))
print('ORIGINAL_COMPARISON_DONE',flush=True)
