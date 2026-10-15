"""Rebuild only the three authorized rifle mechanisms, retaining source geometry.

Run via Script_BlenderMcp after setting scene['FpsProjectRoot'] to this project.
Normalized editable projects are saved outside the repository in OneDrive.
"""
import base64
import importlib
import json
import runpy
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Euler


def Bake(projectRoot, weaponIds=None):
    project = Path(projectRoot).resolve()
    assert project.name == 'Taierzhuang1938' and (project / '_blender/BuildAll.py').is_file()
    names = ['ZhongZheng', 'HanYang', 'Type38'] if weaponIds is None else list(weaponIds)
    assert names and set(names) <= {'ZhongZheng', 'HanYang', 'Type38'}
    index_path = project / 'Model/Data_ModelIndex.json'
    previous_index = json.loads(index_path.read_text(encoding='utf-8'))
    previous_order = {entry['name']: index for index, entry in enumerate(previous_index['models'])}
    script_dir = str(project / '_blender')
    if script_dir not in sys.path: sys.path.insert(0, script_dir)
    for module_name in ('TzmCore', 'ImportWeapons'):
        if module_name in sys.modules: importlib.reload(sys.modules[module_name])
    previous = sys.argv[:]
    try:
        sys.argv = ['BuildAll.py', '--', '--only', ','.join(names), '--out', str(project / 'Model')]
        runpy.run_path(str(project / '_blender/BuildAll.py'), run_name='__main__')
    finally:
        sys.argv = previous
    updated_index = json.loads(index_path.read_text(encoding='utf-8'))
    updated_index['models'].sort(key=lambda entry: previous_order.get(entry['name'], len(previous_order)))
    index_path.write_text(json.dumps(updated_index,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    output = project / 'Model/Data_RifleMechanisms.json'
    report = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    source_dir = Path.home() / 'OneDrive/AI/Models/Blender/Taierzhuang1938/RifleReloadRealism_20261015'
    source_dir.mkdir(parents=True, exist_ok=True)
    basis = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    for name in names:
        bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
        scene = bpy.context.scene
        scene['task'] = 'RifleMechanismBake'
        scene['FpsProjectRoot'] = str(project)
        doc = json.loads((project / f'Model/Model_{name}.tzm.json').read_text(encoding='utf-8'))
        materials = {}
        for key, color in [('wood',(.30,.15,.06,1)), ('steel',(.45,.48,.51,1))]:
            material = bpy.data.materials.new('Material_'+key.title()); material.diffuse_color = color
            materials[key] = material
        objects = []
        for index, node in enumerate(doc['nodes']):
            obj = bpy.data.objects.new(node['name'], None); scene.collection.objects.link(obj)
            if node['parent'] >= 0: obj.parent = objects[node['parent']]
            translation = Matrix.Translation(node.get('t',(0,0,0)))
            rotation = Euler(node.get('r',(0,0,0)), 'XYZ').to_matrix().to_4x4()
            scale = node.get('s',(1,1,1)); scale = (scale,)*3 if isinstance(scale,(int,float)) else scale
            obj.matrix_local = basis @ translation @ rotation @ Matrix.Diagonal((*scale,1)) @ basis.inverted()
            obj.empty_display_type = 'PLAIN_AXES'; obj.empty_display_size = .015
            objects.append(obj)
            for mesh_index in node.get('meshes',[]):
                block = doc['meshes'][mesh_index]
                raw = struct.unpack('<'+'H'*(block['count']*3),base64.b64decode(block['pos']))
                points = [tuple(block['posMin'][axis]+raw[i*3+axis]*block['posScale'][axis] for axis in range(3)) for i in range(block['count'])]
                indices = struct.unpack('<'+('H' if block['idxBits']==16 else 'I')*block['idxCount'],base64.b64decode(block['idx']))
                mesh = bpy.data.meshes.new(f'Mesh_{name}_{node["name"]}_{mesh_index}')
                mesh.from_pydata([(p[0],-p[2],p[1]) for p in points],[],[indices[i:i+3] for i in range(0,len(indices),3)])
                item = bpy.data.objects.new(mesh.name,mesh); scene.collection.objects.link(item); item.parent = obj
                item.data.materials.append(materials[block['material']])
        target = source_dir / f'Model_{name}Mechanism.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(target))
        report[name] = {'blend':str(target.relative_to(source_dir.parent.parent)),'triangles':doc['triangles'],
            'parts': {node['name']:sum(doc['meshes'][i]['idxCount']//3 for i in node.get('meshes',[]))
                      for node in doc['nodes'] if node['name'] in ('boltBody','cockingPiece')},
            'feedMouth':next(node['t'] for node in doc['nodes'] if node['name']=='feedMouth')}
    output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    return report


if globals().get('__name__', '__main__') == '__main__':
    Bake(bpy.context.scene['FpsProjectRoot'])
