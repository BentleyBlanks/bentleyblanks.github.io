"""Preserve the production Dadao UVs, normals and packed PBR in the melee source."""
import bpy

def ClearMeleeWeaponMeshes(parent):
 # Only generated direct weapon meshes belong to this rebuild; keep its animated carrier.
 for child in list(parent.children):
  if child.type!='MESH':continue
  mesh=child.data;bpy.data.objects.remove(child,do_unlink=True)
  if mesh.users==0:bpy.data.meshes.remove(mesh)

def SetMeleeMeshSurface(mesh,uvs,normals):
 if uvs:
  layer=mesh.uv_layers.new(name='UVMap')
  for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
 if normals:
  for polygon in mesh.polygons:polygon.use_smooth=True
  mesh.normals_split_custom_set_from_vertices(normals)

def MeleeDadaoMaterial(root):
 material=bpy.data.materials.get('Material_MeleeDadaoPbr')
 if material:return material
 material=bpy.data.materials.new('Material_MeleeDadaoPbr');material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links
 shader=nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(1,1,1,1)
 def Texture(stem,srgb):
  node=nodes.new('ShaderNodeTexImage');node.label='Dadao '+stem
  node.image=bpy.data.images.load(str(root/'Texture'/('Texture_Dadao'+stem+'.webp')),check_existing=True)
  node.image.colorspace_settings.name='sRGB' if srgb else 'Non-Color';node.image.pack()
  return node
 base=Texture('Base',True);normal=Texture('Normal',False);orm=Texture('Orm',False)
 links.new(base.outputs['Color'],shader.inputs['Base Color'])
 tangent=nodes.new('ShaderNodeNormalMap');links.new(normal.outputs['Color'],tangent.inputs['Color']);links.new(tangent.outputs['Normal'],shader.inputs['Normal'])
 channels=nodes.new('ShaderNodeSeparateColor');channels.mode='RGB';links.new(orm.outputs['Color'],channels.inputs['Color'])
 links.new(channels.outputs['Green'],shader.inputs['Roughness']);links.new(channels.outputs['Blue'],shader.inputs['Metallic'])
 material['source']='Model/Dadao.tzm.json; original CGMOL PBR'
 return material
