"""Pack the edge-wear result and export the same physical surface study."""
import bpy,json,importlib.util,hashlib,os
from pathlib import Path
revision=os.environ.get('TYPE94_SURFACE_REVISION','SurfaceV36')
assert revision in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']
suffix=revision.removeprefix('Surface')
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path.cwd())));root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'));source=root/('Scene_Type94TanketteHigh'+revision+'.blend')
assert Path(bpy.data.filepath)==source and bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
scene=bpy.context.scene
for other in list(bpy.data.scenes):
 if other!=scene and other.name.startswith('Scene_Type94ActualSurface')and other.get('BlenderMcpTask')=='Type94Tankette':
  for obj in list(other.objects):
   if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.scenes.remove(other)
report=json.loads((root/('Acceptance/Data_SurfaceWearBake'+suffix+'.json')).read_text());material=bpy.data.materials['Material_Type94Paint']
for name,sha in report['inputHashes'].items():assert hashlib.sha256((root/('Textures/High'+revision)/name).read_bytes()).hexdigest()==sha
for channel in ['Base','Orm']:
 old=material.node_tree.nodes['Baked '+channel].image;image=bpy.data.images.load(report['outputs'][channel+'Wear']['file'],check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
 for node in material.node_tree.nodes:
  if node.type=='TEX_IMAGE'and node.image==old:node.image=image
 if old.users==0:bpy.data.images.remove(old)
image=bpy.data.images.load(report['mask'],check_existing=False);image.colorspace_settings.name='Non-Color';image.pack();node=material.node_tree.nodes.get('Editable physical edge wear mask')or material.node_tree.nodes.new('ShaderNodeTexImage');oldMask=node.image;node.name='Editable physical edge wear mask';node.label='Inferred convex-edge wear, metric stroke width';node.image=image;node.parent=material.node_tree.nodes['Editable physical surface authoring']
if oldMask and oldMask.users==0:bpy.data.images.remove(oldMask)
scene['SurfaceEdgeWearApplied']=True;scene['SurfaceEdgeWearPlacementInferred']=True
scene['SurfaceEdgeWearInputHashes']=json.dumps(report['inputHashes'])
if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:
 tree=material.node_tree
 compression=tree.nodes.get('Editable finish pigment compression')or tree.nodes.new('ShaderNodeMixRGB')
 compression.name='Editable finish pigment compression';compression.parent=tree.nodes['Editable physical surface authoring']
 compression.inputs[0].default_value=.38;compression.inputs[2].default_value=(.092,.102,.067,1)
 pigmentNode='Faint scuffed coating pigment'if revision in ['SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']else'Oxidation restricted to retained fittings'
 tree.links.new(tree.nodes[pigmentNode].outputs[0],compression.inputs[1])
 for role,strength in [('Paint',1.65),('Track',1.25),('Steel',1.15)]:
  bpy.data.materials['Material_Type94'+role].node_tree.nodes['Tangent normal, OpenGL +Y'].inputs['Strength'].default_value=strength
 scene['SurfacePaintPigmentCompression']=.38
if revision in ['SurfaceV36','SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:
 for blocks in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.node_groups]:
  for block in list(blocks):
   if block.users==0:blocks.remove(block)
bpy.ops.wm.save_as_mainfile(filepath=str(source));bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
 if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
script=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('Type94SurfaceWearExport',script);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ExportGltf(root/('Exports/Model_Type94TanketteHigh'+revision+'.glb'))
print('TYPE94_PHYSICAL_EDGE_WEAR_PACKED_AND_EXPORTED')
