"""Rebuild the authorized Type 11 mechanism and save its editable source."""
import bpy,runpy,sys,importlib,json,base64,struct
from pathlib import Path
from mathutils import Matrix,Euler,Vector


def Bake(projectRoot):
    project=Path(projectRoot).resolve()
    assert project.name=='Taierzhuang1938' and (project/'_blender/BuildAll.py').is_file()
    path=project/'Model/Data_ModelIndex.json';previous=json.loads(path.read_text(encoding='utf-8'))
    order={entry['name']:i for i,entry in enumerate(previous['models'])}
    sys.path.insert(0,str(project/'_blender'))
    for name in ['TzmCore','ImportLugouqiaoWeapons']:
        if name in sys.modules:importlib.reload(sys.modules[name])
    args=sys.argv[:]
    try:
        sys.argv=['BuildAll.py','--','--only','Type11','--out',str(project/'Model')]
        runpy.run_path(str(project/'_blender/BuildAll.py'),run_name='__main__')
    finally:sys.argv=args
    index=json.loads(path.read_text(encoding='utf-8'));index['models'].sort(key=lambda entry:order.get(entry['name'],len(order)))
    path.write_text(json.dumps(index,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    doc=json.loads((project/'Model/Model_Type11.tzm.json').read_text(encoding='utf-8'))
    source=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/Type11Mechanism_20261015';source.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_homefile(use_factory_startup=True,use_empty=True)
    bpy.context.scene['BlenderMcpTask']='Type11MechanismRealism';bpy.context.scene['FpsProjectRoot']=str(project)
    basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    images={'lqType11AmmoBox':'AmmoBox','lqType11Body':'Body','lqType11BodyAlt':'BodyAlt','lqType11Fore':'Fore'}
    materials={}
    for key in {mesh['material'] for mesh in doc['meshes']}:
        material=bpy.data.materials.new('Material_'+key);material.use_nodes=True
        shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.12,.14,.16,1)
        shader.inputs['Metallic'].default_value=.65;shader.inputs['Roughness'].default_value=.55
        if key in images:
            image=bpy.data.images.load(str(project/f'Texture/Texture_LugouqiaoType11{images[key]}Base.jpg'),check_existing=True);image.pack()
            node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
            material.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
        materials[key]=material
    objects=[]
    for n in doc['nodes']:
        obj=bpy.data.objects.new(n['name'],None);bpy.context.scene.collection.objects.link(obj)
        if n['parent']>=0:obj.parent=objects[n['parent']]
        obj.matrix_local=basis@Matrix.Translation(n.get('t',(0,0,0)))@Euler(n.get('r',(0,0,0)),'XYZ').to_matrix().to_4x4()@basis.inverted()
        objects.append(obj);obj.empty_display_size=.015
        for mi in n.get('meshes',[]):
            block=doc['meshes'][mi];raw=struct.unpack('<'+'H'*(block['count']*3),base64.b64decode(block['pos']))
            p=[tuple(block['posMin'][a]+raw[i*3+a]*block['posScale'][a] for a in range(3)) for i in range(block['count'])]
            ix=struct.unpack('<'+('H' if block['idxBits']==16 else 'I')*block['idxCount'],base64.b64decode(block['idx']))
            # Display this editable scene in the same normalized frame used by
            # BuildFromModel, while retaining the untouched source UVs/normals.
            mesh=bpy.data.meshes.new('Mesh_'+n['name']+'_'+block['material']);mesh.from_pydata([(v[0]-.06315,-v[2],v[1]-.146) for v in p],[],[ix[i:i+3] for i in range(0,len(ix),3)])
            uv_raw=struct.unpack('<'+'H'*(block['count']*2),base64.b64decode(block['uv']))
            uv=[tuple(block['uvMin'][a]+uv_raw[i*2+a]*block['uvScale'][a] for a in range(2)) for i in range(block['count'])]
            layer=mesh.uv_layers.new(name='SourceUv')
            for loop in mesh.loops:layer.data[loop.index].uv=uv[loop.vertex_index]
            normal_raw=struct.unpack('<'+'b'*(block['count']*3),base64.b64decode(block['nrm']))
            normals=[Vector((normal_raw[i*3],-normal_raw[i*3+2],normal_raw[i*3+1])).normalized() for i in range(block['count'])]
            for polygon in mesh.polygons:polygon.use_smooth=True
            mesh.normals_split_custom_set([normals[loop.vertex_index] for loop in mesh.loops])
            mesh.materials.append(materials[block['material']])
            item=bpy.data.objects.new(mesh.name,mesh);bpy.context.scene.collection.objects.link(item);item.parent=obj
    target=source/'Model_Type11Mechanism.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target))
    report={'rawSourceTriangles':8255,'preservedSourceTriangles':8252,'triangles':doc['triangles'],'addedTriangles':doc['triangles']-8252,
      'operatingHandleTriangles':sum(doc['meshes'][i]['idxCount']//3 for n in doc['nodes'] if n['name']=='operatingHandle' for i in n.get('meshes',[])),
      'handleContact':next(n['t'] for n in doc['nodes'] if n['name']=='fpsOperatingHandleContact'),
      'strokeM':next(n['t'][2] for n in doc['nodes'] if n['name']=='operatingHandleStroke'),
      'blend':str(target.relative_to(source.parent.parent)),'blendFrame':'first-person normalized, Z-up; source UVs/normals and packed base textures',
      'reference':'MID Special Series 19 (1943), printed pp. 88-93, figures 56-59'}
    (project/'Model/Data_Type11Mechanism.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report));return report


if __name__=='__main__':Bake(FPS_PROJECT_ROOT)
