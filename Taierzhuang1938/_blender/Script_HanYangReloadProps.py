"""Sync Blender's packet with Script_HanYangReloadProps.mjs output in FOLDER.

Run after Setup and before Author. Preserves controls and animations; replaces
only the task's packet meshes with the actual runtime frame/case/bullet faces.
"""
import bpy,json,hashlib
from pathlib import Path
folder=Path(globals().get('HANYANG_RELOAD_FOLDER',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/HanYangReload_20261104'))
assert Path(bpy.data.filepath).resolve()==(folder/'Animation_HanYangReload.blend').resolve(),'Wrong task Blender source'
source=folder/'Data_HanYangReloadProps.json';raw=source.read_bytes();data=json.loads(raw)
def Replace(ob,entries):
    vertices=[];faces=[];materialIds=[]
    for material,entry in enumerate(entries):
        offset=len(vertices);p=entry['positions'];vertices.extend([p[i:i+3] for i in range(0,len(p),3)]);ix=entry['indices'];faces.extend([tuple(offset+j for j in ix[i:i+3]) for i in range(0,len(ix),3)]);materialIds.extend([material]*(len(ix)//3))
    mesh=bpy.data.meshes.new(ob.name+'_Runtime');mesh.from_pydata(vertices,[],faces);mesh.update()
    for material in ob.data.materials:mesh.materials.append(material)
    if len(entries)>1 and len(mesh.materials)<2:mesh.materials.append(bpy.data.materials.get('Mat_PacketSteel') or mesh.materials[0])
    for poly,material in zip(mesh.polygons,materialIds):poly.material_index=material
    old=ob.data;ob.data=mesh
    if old.users==0:bpy.data.meshes.remove(old)
for suffix in ('','Used'):
    Replace(bpy.data.objects['Mesh_Packet'+suffix],[data['body']])
    Replace(bpy.data.objects['Mesh_Rounds'+suffix],[data['cases'],data['bullets']])
bpy.context.scene['fpsReloadPropsSourceSha256']=hashlib.sha256(raw).hexdigest()
bpy.ops.wm.save_mainfile();print('SYNCED actual runtime packet geometry',bpy.context.scene['fpsReloadPropsSourceSha256'])
