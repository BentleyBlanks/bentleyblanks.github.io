"""Bind the scanned Type89 mud textures in both editable sources."""
import json
from pathlib import Path

import bpy
import numpy as np

from Script_Type89BattleWearHigh import Existing, Graph, RECIPE
from Script_Type89SoilMaterial import CLOD_UV, Choice, NAMES, PROFILE, ROOT, RelocateUv


CLOD = 'Texture_Type89SoilClod'
TREAD = 'Texture_Type89SoilTread'


def Image(version,name,space):
    path = version/name
    image = bpy.data.images.load(str(path),check_existing=False)
    image.colorspace_settings.name = space
    image.pack()
    image.filepath_raw = '//'+name
    return image


def Clods(root):
    return [obj for obj in root.children_recursive if obj.type=='MESH' and obj.get('battleWearMud')]


def RoleTree(owner,role):
    material = bpy.data.materials[owner]
    return next(node.node_tree for node in material.node_tree.nodes if node.type=='GROUP' and node.label==role)


def SetCorners(mesh,layer,values):
    indices = np.empty(len(mesh.loops),np.int32)
    mesh.loops.foreach_get('vertex_index',indices)
    layer.uv.foreach_set('vector',values[indices].astype(np.float32).ravel())


def ClodLocalUv(obj):
    coordinates = np.empty((len(obj.data.vertices),3),np.float32)
    obj.data.vertices.foreach_get('co',coordinates.ravel())
    # Project over the broad face of each actual clod. The rim deposits on
    # the side castings have a different dominant plane from the shoe caps.
    centred = coordinates-coordinates.mean(axis=0)
    _,vectors = np.linalg.eigh(centred.T@centred)
    n = vectors[:,-1]
    tangent = vectors[:,-2]
    planeNormal = np.cross(n,tangent)
    if np.dot(planeNormal,np.array([0,0,1])) < 0:
        tangent = -tangent
    plane = np.column_stack((centred@n,centred@tangent))
    low,high = plane.min(axis=0),plane.max(axis=0)
    t = (plane-low)/np.maximum(.001,high-low)
    index = Choice(obj.name)
    u = (index%2+.045+t[:,0]*.91)*.5
    v = (1-index//2+.045+t[:,1]*.91)*.5
    return np.column_stack((u,v))


def ClodShader(root,version):
    material = 'Material_Type89HighRunningGear'
    graph = Graph(RoleTree(material,'Soil'))
    principled = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    graph.Lane(principled.location.x-780,principled.location.y-880)
    uv = graph.Node('ShaderNodeUVMap','Mud particle scale')
    uv.uv_map = CLOD_UV
    samples = {}
    for name in NAMES:
        tex = graph.Node('ShaderNodeTexImage','Scanned soil '+name)
        tex.image = Image(version,'Maps/High/'+CLOD+name+'.png','sRGB' if name=='Base' else 'Non-Color')
        tex.extension = 'EXTEND'
        graph.Set(tex.inputs['Vector'],uv.outputs[0])
        samples[name] = tex.outputs['Color']
    graph.Set(principled.inputs['Base Color'],samples['Base'])
    red,green,blue = graph.Separate(samples['Orm'])
    graph.Set(principled.inputs['Roughness'],green)
    graph.Set(principled.inputs['Metallic'],blue)
    principled.inputs['Specular IOR Level'].default_value = .43
    normal = graph.Node('ShaderNodeNormalMap','Scanned granular surface')
    normal.uv_map = CLOD_UV
    graph.Set(normal.inputs['Color'],samples['Normal'])
    graph.Set(principled.inputs['Normal'],normal.outputs[0])
    output = next(node for node in graph.nodes if node.type=='GROUP_OUTPUT')
    graph.Set(output.inputs['Baked contact AO'],red)
    graph.Set(output.inputs['Metallic'],blue)
    for obj in Clods(root):
        layer = obj.data.uv_layers.new(name=CLOD_UV,do_init=False)
        SetCorners(obj.data,layer,ClodLocalUv(obj))


def TreadShader(version):
    graph = Graph(RoleTree('Material_Type89HighRunningGear','Track'))
    pbr = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    layer = next(node for node in graph.nodes if node.type=='GROUP' and node.label=='Compacted soil in the casting')
    graph.Lane(pbr.location.x-1170,pbr.location.y-2110)
    op = graph.Math
    x,y,_ = graph.Separate(graph.Node('ShaderNodeTexCoord').outputs['Object'])
    objectColor = graph.Separate(graph.Node('ShaderNodeObjectInfo').outputs['Color'])[0]
    variant = op('ROUND',op('MULTIPLY',objectColor,3))
    tileX = op('MULTIPLY',op('MODULO',variant,2),.5)
    tileY = op('MULTIPLY',op('FLOOR',op('DIVIDE',variant,2)),.5)
    u = op('ADD',op('ADD',.25,op('DIVIDE',x,.700)),tileX)
    v = op('SUBTRACT',op('ADD',.75,op('DIVIDE',y,.368)),tileY)
    uv = graph.XY(u,v)
    sampled = {}
    for name in ('Base','Control'):
        node = graph.Node('ShaderNodeTexImage','Photogrammetric soil '+name)
        node.image = Image(version,'Maps/High/'+TREAD+name+'.png','sRGB' if name=='Base' else 'Non-Color')
        node.extension = 'EXTEND'
        graph.Set(node.inputs['Vector'],uv)
        sampled[name]=node.outputs['Color']
    rough,_,relief = graph.Separate(sampled['Control'])
    cake = graph.Smooth(layer.outputs['Earth'],.16,.77)
    weight = op('MULTIPLY',graph.Smooth(cake,.18,.79),op('SUBTRACT',1,op('MULTIPLY',layer.outputs['Dust'],.36)))
    graph.Set(pbr.inputs['Base Color'],graph.Mix(Existing(pbr.inputs['Base Color']),sampled['Base'],weight))
    graph.Set(pbr.inputs['Roughness'],graph.ScalarMix(Existing(pbr.inputs['Roughness']),rough,weight))
    metal = op('MULTIPLY',Existing(pbr.inputs['Metallic']),op('SUBTRACT',1,weight))
    graph.Set(pbr.inputs['Metallic'],metal)
    output = next(node for node in graph.nodes if node.type=='GROUP_OUTPUT')
    graph.Set(output.inputs['Metallic'],metal)
    bump = graph.Node('ShaderNodeBump','Real scanned surface relief')
    bump.inputs['Distance'].default_value = .0069
    graph.Set(bump.inputs['Strength'],weight)
    graph.Set(bump.inputs['Height'],relief)
    graph.Set(bump.inputs['Normal'],Existing(pbr.inputs['Normal']))
    graph.Set(pbr.inputs['Normal'],bump.outputs[0])


def Game(version,root,report):
    layout=report['clodTiles']
    body=bpy.data.materials['Material_Type89GameBody']
    images={}
    for role,atlas in [('Body','Body'),('Glass','Body'),('Track','Track')]:
        material=bpy.data.materials['Material_Type89Game'+role]
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or node.label not in NAMES:
                continue
            identity='Game/Maps/Texture_Type89Game'+atlas+node.label+'.png'
            if identity not in images:
                images[identity]=Image(version,identity,'sRGB' if node.label=='Base' else 'Non-Color')
                images[identity].filepath_raw='//Maps/'+Path(identity).name
            node.image=images[identity]
    assert len(images)==6
    for obj in Clods(root):
        mesh=obj.data
        original=mesh.uv_layers.active
        values=np.empty((len(mesh.loops),2),np.float32)
        original.uv.foreach_get('vector',values.ravel())
        values[:,1]=1-values[:,1]
        uv=RelocateUv(values,layout[Choice(obj.name)],RECIPE['tracks']['mudTile'])
        uv[:,1]=1-uv[:,1]
        original.uv.foreach_set('vector',uv.astype(np.float32).ravel())
        swatch=mesh.uv_layers.get('Type89SurfaceFinish') or mesh.uv_layers.new(name='Type89SurfaceFinish',do_init=False)
        swatch.uv.foreach_set('vector',np.broadcast_to(np.array([.625,.5],np.float32),values.shape).ravel())
        mesh.uv_layers.active=original
        original.active_render=True
        mesh.materials.clear()
        mesh.materials.append(body)
    assert len(Clods(root))==17


def Bind(version,tier):
    directory=version if tier=='High' else version/'Game'
    target=directory/f'Scene_Type89MediumTank{tier}Pbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root=bpy.data.objects[ROOT]
    if root['surfaceRevision']==PROFILE['revision']:
        baseline=version.with_name('GeometryV55SurfaceV21')/target.relative_to(version)
        bpy.ops.wm.open_mainfile(filepath=str(baseline))
        root=bpy.data.objects[ROOT]
    assert root['surfaceRevision']==PROFILE['baseline']
    review=version/'Review'/'Data_SoilMaterialReview.json'
    audit=json.loads(review.read_text(encoding='utf-8'))
    if tier=='High':
        ClodShader(root,version)
        TreadShader(version)
    else:
        Game(version,root,audit)
    root['surfaceRevision']=PROFILE['revision']
    bpy.context.scene['BlenderMcpTask']='Type89SoilScan'
    bpy.context.preferences.filepaths.save_version=0
    bpy.data.use_autopack=False
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    audit.setdefault('sourceClods',{})[tier]=len(Clods(root))
    review.write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
    print(tier,'saved with',len(Clods(root)),'scanned mud surfaces',flush=True)
