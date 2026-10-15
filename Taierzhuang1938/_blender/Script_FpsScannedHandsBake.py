"""Bake the authored scanned FPS skin while preserving the production rig.

Open the task's OneDrive Blender source through scripts/Script_BlenderMcp.mjs.
Set FPS_PROJECT_ROOT to Taierzhuang1938; FPS_SCAN_OUTPUT optionally chooses a
review path. Input: Mesh_FpsScanUnifiedSkin and Model_FpsHandsBeforeScan.glb
beside the .blend. No skeleton or clothing re-export is accepted into runtime.
The source contains registration, volume fitting, wrist bridge, texture bake,
contact-fit scripts and Artec CC BY 3.0 attribution. See the grip repair doc.
"""
import bpy,json,struct,copy,hashlib
from pathlib import Path
project=Path(FPS_PROJECT_ROOT).resolve();sourceFolder=Path(bpy.data.filepath).parent;out=sourceFolder/'Bake';out.mkdir(exist_ok=True)
scene=bpy.data.scenes['Scene_ScannedHandRegistration'];bpy.context.window.scene=scene
assert scene.get('BlenderMcpTask')=='FpsScannedHandPrototype_20261015'
for obj in list(scene.objects):
 if obj.name.startswith('Mesh_FpsScannedSkinExport'):
  mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
  if mesh.users==0:bpy.data.meshes.remove(mesh)
rig=next(o for o in bpy.data.scenes['Scene_OriginalHandChirality'].objects if o.type=='ARMATURE');rig.data.pose_position='REST'
if rig.name not in scene.objects:scene.collection.objects.link(rig)
unified=True
source=bpy.data.objects['Mesh_FpsScanUnifiedSkin' if unified else 'Mesh_FpsScanHybridBoth'];temp=source.copy();temp.data=source.data.copy();temp.name='Mesh_FpsScannedSkinExport';scene.collection.objects.link(temp)
for attribute in list(temp.data.color_attributes):temp.data.color_attributes.remove(attribute)
materialSlot=0 if unified else 2;stale=bpy.data.materials.get('Material_HanYangScanSkin')
if stale:stale.name='Material_ScanPreviousExport'
mat=source.data.materials[materialSlot].copy();mat.name='Material_HanYangScanSkin';assert mat.name=='Material_HanYangScanSkin';temp.data.materials[materialSlot]=mat
modifier=temp.modifiers.new('Armature_ProductionContract','ARMATURE');modifier.object=rig
bpy.ops.object.select_all(action='DESELECT');temp.hide_set(False);temp.select_set(True);rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=temp
try:
 bpy.ops.export_scene.gltf(filepath=str(out/'Model_ScannedHandsGeometry.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_rest_position_armature=True,export_apply=False,export_tangents=True,export_image_format='WEBP',export_image_quality=92)
finally:bpy.data.objects.remove(temp,do_unlink=True)
def Read(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),bytearray(raw[28+n:])
baseline=sourceFolder/'Model_FpsHandsBeforeScan.glb';assert hashlib.sha256(baseline.read_bytes()).hexdigest()=='0668606ced664768f78b244ce2b8d80dd5576900e0d80cc648e97c2b9e178d22'
doc,binary=Read(baseline);baselineDoc=copy.deepcopy(doc);baselineBinary=bytes(binary);new,buffer=Read(out/'Model_ScannedHandsGeometry.glb')
oldMeshIndex=next(i for i,m in enumerate(doc['meshes']) if any(doc['materials'][p['material']]['name']=='Material_HanYangSkin' for p in m['primitives']))
oldNode=next(n for n in doc['nodes'] if n.get('mesh')==oldMeshIndex);oldSkin=doc['skins'][oldNode['skin']]
newNode=next(n for n in new['nodes'] if n.get('name')=='Mesh_FpsScannedSkinExport' and 'skin' in n);newSkin=new['skins'][newNode['skin']];newMesh=new['meshes'][newNode['mesh']]
assert len(newMesh['primitives'])==(1 if unified else 3)
normalize=lambda n:''.join(c for c in n.lower() if c.isalnum())
oldNames=[normalize(doc['nodes'][j]['name']) for j in oldSkin['joints']];newNames=[normalize(new['nodes'][j]['name']) for j in newSkin['joints']];jointMap=[oldNames.index(n) for n in newNames]
def Accessor(document,data,index):
 a=document['accessors'][index];v=document['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']];size=struct.calcsize(fmt)*width;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);return a,start,stride,fmt,width
done=set()
for primitive in newMesh['primitives']:
 index=primitive['attributes']['JOINTS_0']
 if index in done:continue
 done.add(index);a,start,stride,fmt,width=Accessor(new,buffer,index)
 for i in range(a['count']):
  values=struct.unpack_from('<'+fmt*width,buffer,start+i*stride);struct.pack_into('<'+fmt*width,buffer,start+i*stride,*[jointMap[j] for j in values])
# Verify exporter kept the intended rest-space basis before replacing any mesh.
restBounds=[]
for p in newMesh['primitives']:
 a,start,stride,fmt,width=Accessor(new,buffer,p['attributes']['POSITION']);restBounds.append([a.get('min'),a.get('max')])
assert min(b[0][0] for b in restBounds)<-.9 and max(b[1][0] for b in restBounds)>.9,restBounds
offset=len(binary);binary+=buffer;viewOffset=len(doc['bufferViews']);accessorOffset=len(doc['accessors']);materialOffset=len(doc['materials']);imageOffset=len(doc.get('images',[]));textureOffset=len(doc.get('textures',[]));samplerOffset=len(doc.get('samplers',[]))
for v in new['bufferViews']:v['buffer']=0;v['byteOffset']=v.get('byteOffset',0)+offset
for a in new['accessors']:a['bufferView']+=viewOffset
for im in new.get('images',[]):im['bufferView']+=viewOffset
for t in new.get('textures',[]):
 if 'source' in t:t['source']+=imageOffset
 if 'sampler' in t:t['sampler']+=samplerOffset
 for ext in t.get('extensions',{}).values():
  if 'source' in ext:ext['source']+=imageOffset
def RemapTextures(value,key=''):
 if isinstance(value,dict):
  if key.endswith('Texture') and 'index' in value:value['index']+=textureOffset
  for k,v in value.items():RemapTextures(v,k)
 elif isinstance(value,list):
  for v in value:RemapTextures(v,key)
for m in new['materials']:RemapTextures(m)
for p in newMesh['primitives']:
 p['indices']+=accessorOffset;p['material']+=materialOffset
 for key in p['attributes']:p['attributes'][key]+=accessorOffset
 for target in p.get('targets',[]):
  for key in target:target[key]+=accessorOffset
for key in ['bufferViews','accessors','images','textures','samplers','materials']:doc.setdefault(key,[]).extend(new.get(key,[]))
doc['meshes'][oldMeshIndex]['primitives']=newMesh['primitives']
# Preserve authored corrective names/defaults when a full surface rebuild is
# requested. Append-only corrective baking uses Script_FpsGripCorrectiveBake.
for key in ['weights','extras']:
 if key in newMesh:doc['meshes'][oldMeshIndex][key]=copy.deepcopy(newMesh[key])
 elif key in doc['meshes'][oldMeshIndex]:del doc['meshes'][oldMeshIndex][key]
for key in ['extensionsUsed','extensionsRequired']:doc[key]=list(dict.fromkeys(doc.get(key,[])+new.get(key,[])))
doc['buffers'][0]['byteLength']=len(binary)
doc['asset'].setdefault('extras',{})['handSurfaceCandidate']={'source':'Artec Group inc., Hand scan','url':'https://www.artec3d.com/3d-models/hand','license':'CC BY 3.0, bundled archive license','modifications':'landmark fit, volume-preserving warp, decimation, rig weights, wrist transitions, texture transfer','sourceBlend':'Model_FpsScannedHandPrototype.blend'}
payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4);binary+=b'\0'*((-len(binary))%4)
output=out/'Model_FpsHanYangHands.glb';output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary)
report={'file':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'newPrimitives':len(newMesh['primitives']),'preservedOriginalSkeleton':True,'preservedOriginalCloth':True,'restBounds':restBounds}
(out/'Data_ExportReport.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))

import json,struct,copy,hashlib
from pathlib import Path
root=out
raw=(root/'Model_FpsHanYangHands.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:];before=copy.deepcopy(doc)
def Select(key,used):
 indices=sorted(set(used));mapping={old:new for new,old in enumerate(indices)};doc[key]=[doc.get(key,[])[i] for i in indices];return mapping
primitives=[p for mesh in doc['meshes'] for p in mesh['primitives']]
assert not any(p.get('extensions') for p in primitives),'Compression extensions require their own reference handler'
materials=Select('materials',(p['material'] for p in primitives if 'material' in p))
for p in primitives:
 if 'material' in p:p['material']=materials[p['material']]
def TextureRefs(value,key=''):
 if isinstance(value,dict):
  if key.endswith('Texture') and 'index' in value:yield value
  for k,v in value.items():yield from TextureRefs(v,k)
 elif isinstance(value,list):
  for v in value:yield from TextureRefs(v,key)
refs=list(TextureRefs(doc['materials']));textures=Select('textures',(r['index'] for r in refs))
for ref in refs:ref['index']=textures[ref['index']]
imageRefs=[]
for texture in doc['textures']:
 if 'source' in texture:imageRefs.append(texture)
 imageRefs.extend(ext for ext in texture.get('extensions',{}).values() if 'source' in ext)
images=Select('images',(r['source'] for r in imageRefs))
for ref in imageRefs:ref['source']=images[ref['source']]
samplers=Select('samplers',(t['sampler'] for t in doc['textures'] if 'sampler' in t))
for t in doc['textures']:
 if 'sampler' in t:t['sampler']=samplers[t['sampler']]
accessorRefs=[]
for p in primitives:
 accessorRefs.extend((p['attributes'],k) for k in p['attributes'])
 if 'indices' in p:accessorRefs.append((p,'indices'))
 for target in p.get('targets',[]):accessorRefs.extend((target,k) for k in target)
accessorRefs.extend((s,'inverseBindMatrices') for s in doc.get('skins',[]) if 'inverseBindMatrices' in s)
for animation in doc.get('animations',[]):
 for sampler in animation['samplers']:accessorRefs.extend([(sampler,'input'),(sampler,'output')])
accessors=Select('accessors',(r[k] for r,k in accessorRefs))
for ref,key in accessorRefs:ref[key]=accessors[ref[key]]
viewRefs=[]
for a in doc['accessors']:
 if 'bufferView' in a:viewRefs.append(a)
 for sparse in a.get('sparse',{}).values():
  if isinstance(sparse,dict) and 'bufferView' in sparse:viewRefs.append(sparse)
viewRefs.extend(i for i in doc['images'] if 'bufferView' in i)
views=Select('bufferViews',(r['bufferView'] for r in viewRefs))
for ref in viewRefs:ref['bufferView']=views[ref['bufferView']]
compact=bytearray()
for view in doc['bufferViews']:
 compact+=b'\0'*((-len(compact))%4);offset=view.get('byteOffset',0);data=binary[offset:offset+view['byteLength']];view['byteOffset']=len(compact);view['buffer']=0;compact+=data
compact+=b'\0'*((-len(compact))%4);doc['buffers'][0]['byteLength']=len(compact)
# Rest rig transforms and skin joint order are exact; IBM payload bytes survive.
assert doc['nodes']==before['nodes']
for newSkin,oldSkin in zip(doc['skins'],before['skins']):
 assert newSkin['joints']==oldSkin['joints']
 oldAccessor=before['accessors'][oldSkin['inverseBindMatrices']];newAccessor=doc['accessors'][newSkin['inverseBindMatrices']]
 oldView=before['bufferViews'][oldAccessor['bufferView']];newView=doc['bufferViews'][newAccessor['bufferView']]
 oldStart=oldView.get('byteOffset',0)+oldAccessor.get('byteOffset',0);newStart=newView.get('byteOffset',0)+newAccessor.get('byteOffset',0);length=64*oldAccessor['count']
 assert binary[oldStart:oldStart+length]==compact[newStart:newStart+length]
payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4)
output=Path(globals().get('FPS_SCAN_OUTPUT',project/'Model/Model_FpsHanYangHands.glb')).resolve();output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(compact))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(compact),0x004e4942)+compact)
report={'beforeBytes':len(raw),'afterBytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'materials':[m['name'] for m in doc['materials']],'rigTransformsExact':True,'inverseBindsExact':True}
(root/'Data_CompactReport.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))


report['sourceBlend']=bpy.data.filepath
def AccessorPayload(document,data,index):
 a=document['accessors'][index];view=document['bufferViews'][a['bufferView']]
 width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size={5121:1,5123:2,5125:4,5126:4}[a['componentType']]*width
 start=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',size)
 return b''.join(data[start+i*stride:start+i*stride+size] for i in range(a['count']))
def ClothPrimitives(document):
 return [p for mesh in document['meshes'] for p in mesh['primitives'] if document['materials'][p['material']]['name']=='Material #1721585337']
def ImagePayload(document,data,reference):
 texture=document['textures'][reference['index']];source=texture.get('source')
 if source is None:source=texture['extensions']['EXT_texture_webp']['source']
 image=document['images'][source];view=document['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
 return image['mimeType'],data[start:start+view['byteLength']]
oldCloth=ClothPrimitives(baselineDoc);newCloth=ClothPrimitives(doc);assert len(oldCloth)==len(newCloth)>0
for oldPart,newPart in zip(oldCloth,newCloth):
 assert oldPart['attributes'].keys()==newPart['attributes'].keys()
 for name in oldPart['attributes']:
  assert AccessorPayload(baselineDoc,baselineBinary,oldPart['attributes'][name])==AccessorPayload(doc,compact,newPart['attributes'][name]),'Cloth attribute changed: '+name
 assert AccessorPayload(baselineDoc,baselineBinary,oldPart['indices'])==AccessorPayload(doc,compact,newPart['indices'])
 oldMaterial=baselineDoc['materials'][oldPart['material']];newMaterial=doc['materials'][newPart['material']]
 assert [ImagePayload(baselineDoc,baselineBinary,r) for r in TextureRefs(oldMaterial)]==[ImagePayload(doc,compact,r) for r in TextureRefs(newMaterial)]
report['clothGeometryExact']=True;report['clothImagesExact']=True
report['baselineSha256']='0668606ced664768f78b244ce2b8d80dd5576900e0d80cc648e97c2b9e178d22'
(sourceFolder/'Data_FpsScannedHandsBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
script=project/'_blender/Script_FpsScannedHandsBake.py'
text=bpy.data.texts.get(script.name) or bpy.data.texts.new(script.name);text.clear();text.write(script.read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
