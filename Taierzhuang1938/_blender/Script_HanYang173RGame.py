"""Derive the user-requested 60k game geometry from immutable Dots 173R.
Run with Script_BlenderMcp.mjs start --batch. Original PBR payloads are kept
verbatim; only geometry is simplified, with source custom normals transferred.
"""
import bpy, os, json, struct, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(os.environ['HANYANG_PROJECT_ROOT'])
source=Path(os.environ['HANYANG_SOURCE_GLB'])
out=root/'Model/HanYang173R';out.mkdir(parents=True,exist_ok=True)
work=root.parent/'tmp/HanYang173R';work.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()=='3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=True)
originals=[o for o in bpy.context.scene.objects if o.type=='MESH']
report=[];total=0
for obj in originals:
    obj.data.calc_loop_triangles();count=len(obj.data.loop_triangles)
    original=obj.copy();original.data=obj.data.copy();bpy.context.collection.objects.link(original)
    original.hide_render=True;original.hide_set(True)
    original.name='Source_'+obj.name
    # Uniform ratio leaves all 44 objects present, including small pins.
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    preserve={'HandleRoot','HandleNeck','HandleSphere','HandledCylinder','FrontBand_ContinuousEnvelopeContact','RearBand_ControlledCrown','ReceiverOuterCollar','RearCockingExterior','Trigger_FlatCurvedExternalStrip','Sight_LowCrossPiece','HY150_RoundedUpperExterior'}
    if count>100 and obj.name not in preserve:
        mod=obj.modifiers.new('GameBudget','DECIMATE');mod.ratio=.098
        if obj.name=='MainWood_ContinuousLowerShoulder':mod.ratio=.17535
        if obj.name=='UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront':mod.ratio=.286
        mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normal=obj.modifiers.new('SourceCornerNormals','DATA_TRANSFER')
        normal.object=original;normal.use_loop_data=True
        normal.data_types_loops={'CUSTOM_NORMAL'};normal.loop_mapping='POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier=normal.name)
    if obj.name=='Sight_LowCrossPiece':
        # The delivered crosspiece is solid across the sight line. A 4.5 mm
        # gameplay notch supplies daylight beside the existing front blade.
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.321,.06835))
        cutter=bpy.context.object;cutter.dimensions=(.0045,.024,.012)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bpy.context.view_layer.objects.active=obj
        cut=obj.modifiers.new('PlayableRearNotch','BOOLEAN');cut.operation='DIFFERENCE';cut.solver='EXACT';cut.object=cutter
        bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(cutter,do_unlink=True)
        tri=obj.modifiers.new('NotchTriangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.data.calc_loop_triangles();actual=len(obj.data.loop_triangles);total+=actual
    tree=BVHTree.FromPolygons([v.co for v in original.data.vertices],[tuple(t.vertices) for t in original.data.loop_triangles])
    reverse=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(t.vertices) for t in obj.data.loop_triangles])
    forward=max((tree.find_nearest(v.co)[3] or 0) for v in obj.data.vertices)
    backward=max((reverse.find_nearest(v.co)[3] or 0) for v in original.data.vertices)
    report.append({'part':obj.name,'sourceTriangles':count,'gameTriangles':actual,'gameToSourceMaxM':forward,'sourceToGameMaxM':backward,'gameplayAdaptation':'4.5mm rear sight notch' if obj.name=='Sight_LowCrossPiece' else None})
    bpy.data.objects.remove(original,do_unlink=True)
    obj.select_set(False)
assert 59000<=total<=60000,total
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
bpy.context.scene['BlenderMcpTask']='HanYang173RGame60k'
blendPath=Path(os.environ.get('HANYANG_GAME_SOURCE',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/Game60k/Scene_HanYang173RGame60k.blend'))
blendPath.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath),compress=True)
bpy.ops.object.select_all(action='SELECT')
draft=work/'Model_GameExport.glb'
bpy.ops.export_scene.gltf(filepath=str(draft),export_format='GLB',use_selection=True,export_yup=True,
    export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_extras=False)

def ReadGlb(p):
    b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0]
    j=json.loads(b[20:20+n]);return j,b[28+n:]
orig,originalBin=ReadGlb(source);doc,data=ReadGlb(draft)
used=sorted({a['bufferView'] for a in doc['accessors'] if 'bufferView' in a})
payload=bytearray();views=[];remap={}
for index in used:
    view=doc['bufferViews'][index];start=view.get('byteOffset',0)
    raw=data[start:start+view['byteLength']]
    while len(payload)%4:payload.append(0)
    remap[index]=len(views);views.append({**view,'buffer':0,'byteOffset':len(payload)})
    payload.extend(raw)
for accessor in doc['accessors']:
    if 'bufferView' in accessor:accessor['bufferView']=remap[accessor['bufferView']]
doc['bufferViews']=views
originalImages={image['name']:image for image in orig['images']}
for image in doc['images']:
    ref=originalImages[image['name']];view=orig['bufferViews'][ref['bufferView']]
    start=view.get('byteOffset',0);raw=originalBin[start:start+view['byteLength']]
    while len(payload)%4:payload.append(0)
    image['bufferView']=len(views);image['mimeType']=ref['mimeType']
    views.append({'buffer':0,'byteOffset':len(payload),'byteLength':len(raw)})
    payload.extend(raw)
# MikkTSpace can return near-zero tangents on numerical UV degeneracies.
# Project against the transferred normal, retaining handedness and all other bytes.
import numpy as np
def Values(index):
    a=doc['accessors'][index];v=views[a['bufferView']];width={'VEC3':3,'VEC4':4}[a['type']]
    return np.ndarray((a['count'],width),dtype='<f4',buffer=payload,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*4),4))
repaired=0
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        n=Values(primitive['attributes']['NORMAL']).astype(float);t=Values(primitive['attributes']['TANGENT'])
        projected=t[:,:3].astype(float)-n*np.sum(t[:,:3]*n,axis=1)[:,None]
        length=np.linalg.norm(projected,axis=1);invalid=(~np.isfinite(length))|(length<1e-7)
        for i in np.flatnonzero(invalid):
            axis=np.zeros(3);axis[np.argmin(np.abs(n[i]))]=1
            projected[i]=np.cross(n[i],axis)
        projected/=np.linalg.norm(projected,axis=1)[:,None]
        changed=np.max(np.abs(projected-t[:,:3]),axis=1)>1e-5;repaired+=int(changed.sum());t[:,:3]=projected
        t[:,3]=np.where(t[:,3]<0,-1,1)
while len(payload)%4:payload.append(0)
doc['buffers']=[{'byteLength':len(payload)}]
doc['asset']['extras']={'sourceVersion':'Dots173R','gameTriangles':total,'sourceImagesPreserved':True}
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4E4F534A)+j+struct.pack('<II',len(payload),0x004E4942)+payload
target=out/'Model_HanYang173R.glb';target.write_bytes(result)
texturePayloads=[]
for image in orig['images']:
    view=orig['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
    texturePayloads.append({'name':image['name'],'mimeType':image['mimeType'],'sha256':hashlib.sha256(originalBin[start:start+view['byteLength']]).hexdigest()})
(out/'Data_GameGeometry.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'gameSha256':hashlib.sha256(result).hexdigest(),'triangles':total,'repairedTangents':repaired,'parts':report,'texturePayloads':texturePayloads},indent=2))
print(json.dumps({'triangles':total,'maxSurfaceDeviationMm':1000*max(max(r['gameToSourceMaxM'],r['sourceToGameMaxM']) for r in report),'path':str(target)}))
