"""Reopen the projected source, bind actual surfaces, and retest real motion."""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV70')));acc=root/'Acceptance';verification=root/'Verification';(verification/'Exports').mkdir(parents=True,exist_ok=True);(verification/'Acceptance').mkdir(exist_ok=True)
high=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV68.json').read_text());low=json.loads((acc/'Data_GamePbrV70.json').read_text());geometry=json.loads((acc/'Data_GameGeometryV70.json').read_text());assert not bpy.data.filepath
def Module(name):
    file=repo/'Taierzhuang1938/_blender'/name;spec=importlib.util.spec_from_file_location('Audit'+file.stem,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
exporter=Module('Script_Type94Export.py');scope=dict(bpy=bpy,bmesh=bmesh,np=np,math=math,Vector=Vector,BVHTree=BVHTree,CERT_LIMIT=.002998,hashlib=hashlib)
for file,names in [('Script_Type94GameTrial.py',['Count','Surface','Certify','LooseParts']),('Script_Type94GameFeatures.py',['State','Make','Restore','Split']),('Script_Type94GameGeometryV70.py',['Signature'])]:
    tree=ast.parse((repo/'Taierzhuang1938/_blender'/file).read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),'<independent reopened-source functions>','exec'),scope)
Count=scope['Count'];State=scope['State'];Restore=scope['Restore'];Split=scope['Split'];Certify=scope['Certify'];LooseParts=scope['LooseParts'];Signature=scope['Signature']
checks=[];bindings=[]
def Check(value,label,detail=None):checks.append(dict(check=label,passed=bool(value),detail=detail))
for label,manifest in [('High',high),('Low',low)]:
    file=Path(manifest['sourceBlend']);assert hashlib.sha256(file.read_bytes()).hexdigest()==manifest['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(file));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';asset=bpy.data.objects['Type94Tankette'];meshes=sorted([o for o in asset.children_recursive if o.type=='MESH'],key=lambda o:o.name);arrays={};rows=[]
    for index,obj in enumerate(meshes):
        mesh=exporter.TriangulatedCopy(obj.data);points=np.array([tuple(v.co)for v in mesh.vertices],dtype=np.float64);points=points[:,[0,2,1]]*np.array([1,1,-1]);triangles=np.array([tuple(face.vertices)for face in mesh.polygons],dtype=np.int64);assert triangles.shape[1]==3;arrays['points'+str(index)]=points;arrays['triangles'+str(index)]=triangles;rows.append(dict(index=index,name=obj.name,triangles=len(triangles)));bpy.data.meshes.remove(mesh)
    np.savez_compressed(acc/('Data_'+label+'SourceArraysV70.npz'),**arrays);(acc/('Data_'+label+'SourceArraysV70.json')).write_text(json.dumps(dict(source=str(file),sourceBlendSha256=manifest['sourceBlendSha256'],rows=rows,scope='Exact exporter triangulation and local Blender-to-glTF axis permutation; no resampling'),indent=2)+'\n')
    Check(len(meshes)==237,label+'reopened source has237meshowners')
    if label=='High':
        sourceHull=State(exporter.TriangulatedCopy(bpy.data.objects['Geometry_Hull_Paint'].data));continue
    Check(sum(Count(o.data)for o in meshes)==low['triangles']<80000,'Actual reopened low geometry remains below80000triangles')
    Check(scene.get('GameUvGenerationMode')=='Fresh'and scene.get('GamePbrProjectionCompleted'),'Fresh UV and actual high-to-low projection provenance retained')
    Check(all(o.data.uv_layers and len(o.data.uv_layers.active.data)==len(o.data.loops)for o in meshes),'All source low corners have active UVs')
    Check(scene.unit_settings.system=='METRIC'and abs(scene.unit_settings.scale_length-1)<1e-9,'Metre author units')
    Check(not any(o.name.startswith('Temporary_')for o in scene.objects),'No bake staging objects in final source')
    for role,size in [('Paint',4096),('Track',2048),('Steel',2048),('Rubber',1024)]:
        material=bpy.data.materials['Material_Type94'+role];tree=material.node_tree;images={c:tree.nodes['Baked '+c].image for c in ['Base','Orm','Normal']};Check(all(i.packed_file and list(i.size)==[size,size]for i in images.values()),role+'complete packed maps at declared resolution');Check(images['Base'].colorspace_settings.name=='sRGB'and all(images[c].colorspace_settings.name=='Non-Color'for c in ['Orm','Normal']),role+'color/data encodings');Check(abs(tree.nodes['Tangent normal, OpenGL +Y'].inputs['Strength'].default_value-1)<1e-8,role+'normal response is not applied twice');bindings.append(dict(role=role,images={c:dict(name=i.name,size=list(i.size),packedSha256=hashlib.sha256(i.packed_file.data).hexdigest())for c,i in images.items()}))
    Check(all(sum(o.name.startswith('TrackLink_'+side+'_')for o in meshes)==80 for side in ['Left','Right']),'Both belts retain80independent links')
    Check(bpy.data.objects['MachineGunPitch'].parent==bpy.data.objects['MachineGunYaw']and bpy.data.objects['MachineGunYaw'].parent==bpy.data.objects['TurretYaw'],'Independent gun and turret hierarchy')
    # Re-evaluate all Hull parts against the saved low source, independently of
    # the producer's in-memory certificate. Counts alone do not prove pairing.
    source=Restore(sourceHull);target=exporter.TriangulatedCopy(bpy.data.objects['Geometry_Hull_Paint'].data);record=next(r for r in geometry['records']if r['mesh']=='Geometry_Hull_Paint');parts=LooseParts(source);assert len(parts)==len(record['parts'])==202;offset=0;hullRows=[]
    for index,(ids,prior)in enumerate(zip(parts,record['parts'])):
        a=Split(source,ids);b=Split(target,list(range(offset,offset+prior['candidateTriangles'])));offset+=prior['candidateTriangles'];identity=Signature(a)==prior['sourceSignature']and Signature(b)==prior['lowSignature'];f=Certify(a,b);r=Certify(b,a);hullRows.append(dict(index=index,sourceTriangles=Count(a),candidateTriangles=Count(b),identityVerified=identity,forward=f,reverse=r,passed=bool(identity and f['certified']and r['certified'])));print('TYPE94_V70_REOPENED_HULL',index,hullRows[-1]['passed'],flush=True)
    assert offset==len(target.polygons)==Count(target)
    hullReport=dict(highBlendSha256=high['sourceBlendSha256'],lowBlendSha256=low['sourceBlendSha256'],sourceGlbSha256=high['sha256'],sha256=low['sha256'],rows=hullRows,parts=len(hullRows),passed=all(r['passed']for r in hullRows),maximumUpperM=max(max(r['forward'].get('certifiedUpperM')or 0,r['reverse'].get('certifiedUpperM')or 0)for r in hullRows),scope='All202current Hull parts re-certified against fresh saved-source reconstruction, with exact per-part surface signatures; no old face-offset inheritance')
    (acc/'Data_ReopenedHullCertificateV70.json').write_text(json.dumps(hullReport,indent=2)+'\n');Check(hullReport['passed'],'Saved-source Hull correspondence and continuous bounds')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [asset]+list(asset.children_recursive):obj.select_set(True)
    reexport=verification/'Exports/Model_Type94TanketteGameSourceReexportV70.glb';exporter.ExportGltf(reexport);(acc/'Data_GameSourceReexportV70.json').write_text(json.dumps(dict(sourceBlendSha256=low['sourceBlendSha256'],referenceSha256=low['sha256'],sha256=hashlib.sha256(reexport.read_bytes()).hexdigest(),file=str(reexport)),indent=2)+'\n')
report=dict(sourceBlendSha256=low['sourceBlendSha256'],sha256=low['sha256'],checks=checks,bindings=bindings,passed=all(c['passed']for c in checks),scope='Fresh source reopen, independently reconstructed Hull certificate, packed map bindings, and source reexport. Appearance and motion remain separate requirements.')
(acc/'Data_GameSourceReopenV70.json').write_text(json.dumps(report,indent=2)+'\n');assert report['passed']
# Use actual import geometry for articulation, rather than the author scene.
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';scene['SourceGltfSha256']=low['sha256'];bpy.ops.import_scene.gltf(filepath=low['sourceGlb']);bpy.context.view_layer.update();body=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text());driver=body['driver'];envelope=dict(xRangeM=[driver['centerXM']-driver['widthM']/2-.10,driver['centerXM']+driver['widthM']/2+.10],forwardRangeM=[driver['topForwardM']-.283-.10,driver['bottomForwardM']+.10],minimumHeightM=driver['bottomZM']-.015);path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path']
module=Module('Script_VerifyType94Sweep.py');motion=module.VerifyScene(scene,path,{'DriverRoof':dict(gunElevationDegrees=12,basis='Retained inferred author interlock; actual latest reduced surfaces retested')},cabinEnvelope=envelope);(acc/'Data_ActualGameMotionV70.json').write_text(json.dumps(motion,indent=2)+'\n');print(json.dumps(dict(sourcePassed=report['passed'],motionPassed=motion['passed'],motionChecks=len(motion['checks']),failed=[r for r in motion['checks']if not r['passed']]),indent=2),flush=True);assert motion['passed']
