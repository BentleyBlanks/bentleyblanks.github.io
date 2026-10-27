"""Align V47 before-pocket area metadata using independent source envelopes."""
import bpy, pathlib, json, hashlib, ast, array, struct, shutil
import numpy as np
from mathutils import Vector
scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4AirframeMetadata.py')).resolve()
repo = scriptPath.parents[2]; asset = repo/'tmp/NakajimaKi4/ReferenceV47_AirframeJoint'
recordPath = asset/'Evidence/Data_WholeAirframeAuthor.json'; record = json.loads(recordPath.read_text(encoding='utf8'))
source = pathlib.Path(record['sourcePath']); old = pathlib.Path(record['inputSourcePath'])
assert hashlib.sha256(source.read_bytes()).hexdigest() == record['sourceSha256']
assert hashlib.sha256(old.read_bytes()).hexdigest() == record['inputSourceSha256']
parameters = json.loads((asset/'Data_AirframeParameters.json').read_text(encoding='utf8')); shared = parameters['shared']
hinge = np.array(shared['originalRudderHingeCenterGltfM']); axis = np.array(shared['originalRudderHingeAxisGltf']); aft = np.array(shared['rudderChordAftDirectionGltf'])
C = np.array([[1,0,0],[0,0,1],[0,-1,0]], float)
def ReadRudder():
    obj=bpy.data.objects['Rudder'];points=np.array([list(obj.matrix_world@v.co)for v in obj.data.vertices])@C.T
    return points,np.array([list(e.vertices)for e in obj.data.edges]),float(obj['referenceSideAreaBeforePocketM2'])
bpy.ops.wm.open_mainfile(filepath=str(old)); before,edges,beforeArea=ReadRudder()
bpy.ops.wm.open_mainfile(filepath=str(source)); after,otherEdges,approxArea=ReadRudder(); assert np.array_equal(edges,otherEdges)
ys=np.unique(np.round(before[:,1],6));ys=np.clip(ys,float(before[:,1].min())+2e-6,float(before[:,1].max())-2e-6)
def Envelope(points):
    line=hinge+(points[:,1,None]-hinge[1])/axis[1]*axis;q=np.c_[(points-line)@aft,points[:,1]];a=q[edges[:,0]];d=q[edges[:,1]]-a;result=[]
    for y in ys:
        mask=(np.minimum(a[:,1],a[:,1]+d[:,1])<=y)&(np.maximum(a[:,1],a[:,1]+d[:,1])>=y)&(abs(d[:,1])>1e-10)
        values=a[:,0]+(y-a[:,1])/np.where(abs(d[:,1])>1e-10,d[:,1],1)*d[:,0];result.append(float(max(values[mask])))
    return np.array(result)
delta=float(np.trapezoid(Envelope(after)-Envelope(before),ys));correct=beforeArea+delta
rudder=bpy.data.objects['Rudder'];rudder.data.calc_loop_triangles();area=sum(abs((rudder.data.vertices[t.vertices[1]].co-rudder.data.vertices[t.vertices[0]].co).cross(rudder.data.vertices[t.vertices[2]].co-rudder.data.vertices[t.vertices[0]].co).x)/2 for t in rudder.data.loop_triangles)/2
assert area>=correct*.98
archive=source.parent/'Archive_BeforeAreaMetadata';assert not archive.exists();archive.mkdir();shutil.copy2(source,archive/source.name)
rudder['referenceSideAreaBeforePocketM2']=correct
bpy.data.objects['NakajimaKi4']['cowlInnerScope']='V47 unprinted forward ring profile; original548mm engine bay/case/cap retained. Actual rocker-cover/cylinder clearance checked separately.'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
newSha=hashlib.sha256(source.read_bytes()).hexdigest();exports=[]
for key,shaKey in [('pbrExportPath','pbrExportSha256'),('grayExportPath','grayExportSha256')]:
    path=pathlib.Path(record[key]);payload=path.read_bytes();assert hashlib.sha256(payload).hexdigest()==record[shaKey]
    shutil.copy2(path,archive/path.name);size=struct.unpack_from('<I',payload,12)[0];g=json.loads(payload[20:20+size]);binary=payload[28+size:]
    node=next(n for n in g['nodes']if n.get('name')=='Rudder');node['extras']['referenceSideAreaBeforePocketM2']=correct
    root=next(n for n in g['nodes']if n.get('name')=='NakajimaKi4');root['extras']['cowlInnerScope']=bpy.data.objects['NakajimaKi4']['cowlInnerScope']
    encoded=json.dumps(g,ensure_ascii=False,separators=(',',':')).encode('utf8');encoded+=b' '*((-len(encoded))%4)
    output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(output);record[shaKey]=hashlib.sha256(output).hexdigest();exports.append({'path':str(path),'oldSha256':hashlib.sha256(payload).hexdigest(),'newSha256':record[shaKey],'binaryPayloadByteIdentical':True})
record['sourceSha256BeforeAreaMetadata']=record['sourceSha256'];record['sourceSha256']=newSha;record['rudderSideAreaRetention']=area/correct
record['rudderIndependentEnvelopeAreaDeltaM2']=delta;record['rudderBeforePocketAreaM2']=correct
for path in [recordPath,asset/'Evidence/Data_PropellerSectionAuthor.json',source.parent/'Evidence/Data_WholeAirframeAuthor.json',source.parent/'Evidence/Data_PropellerSectionAuthor.json']:path.write_text(json.dumps(record,indent=2),encoding='utf8')
proof={'state':'IndependentRudderEnvelopeMetadataAligned','oldApproximateAreaM2':approxArea,'originalBeforePocketAreaM2':beforeArea,'independentEnvelopeDeltaM2':delta,'newBeforePocketAreaM2':correct,'actualSideAreaM2':area,'retention':area/correct,'sourceSha256':newSha,'exports':exports,'scope':'Metadata only. Source mesh data and all GLB binary payloads unchanged; original98percent retention gate preserved.'}
(asset/'Evidence/Data_AirframeAreaMetadata.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
