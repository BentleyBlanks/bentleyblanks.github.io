"""Restore the original Type 38 near-stock primitives for a complete held prop."""
import base64,json,struct
from pathlib import Path
import bpy

def CompleteRifle(root,faction,rifle):
    if faction!='Ija':return
    source=Path(root)/'Models/SourceWeapons/Data_Type38.tzm.json'
    data=json.loads(source.read_text(encoding='utf-8'))
    def Decode(encoded,kind):
        raw=base64.b64decode(encoded)
        return struct.unpack('<'+kind*(len(raw)//struct.calcsize(kind)),raw)
    # The first-person source splits these from `body` for ADS. Third-person needs both.
    for node in data['nodes']:
        if node['name']!='adsNear':continue
        for index in node['meshes']:
            name=f'Model_{faction}RifleNear{index}'
            if bpy.data.objects.get(name):continue
            block=data['meshes'][index];q=Decode(block['pos'],'H');uv=Decode(block['uv'],'H')
            ids=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
            vertices=[tuple(block['posMin'][j]+q[i*3+j]*block['posScale'][j] for j in range(3)) for i in range(block['count'])]
            mesh=bpy.data.meshes.new('Mesh_'+name);mesh.from_pydata(vertices,[],[ids[i:i+3] for i in range(0,len(ids),3)]);mesh.update()
            layer=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:
                i=loop.vertex_index
                layer.data[loop.index].uv=tuple(block['uvMin'][j]+uv[i*2+j]*block['uvScale'][j] for j in range(2))
            obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=rifle
            obj.location=node.get('t',[0,0,0]);obj.rotation_euler=node.get('r',[0,0,0])
            mesh.materials.append(bpy.data.materials['Material_'+faction+block['material']])
            for face in mesh.polygons:face.use_smooth=True
    rifle['completeThirdPersonWeapon']=True
    rifle['completedSourceNode']='adsNear'
