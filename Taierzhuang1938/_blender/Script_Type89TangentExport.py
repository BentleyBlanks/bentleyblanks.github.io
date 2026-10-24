"""Re-export retained Type89 PBR sources with the baker's authored tangent basis."""
import bpy,os,sys,json,hashlib,struct
from pathlib import Path
here=Path(__file__).resolve().parent;repo=here.parents[1]
os.environ['TYPE89_PBR_REVISION']='SurfaceV4GeometryV30'
sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
reportFile=bake.reviewDir/'Data_PbrSurfaceV4GeometryV30Build.json'
report=json.loads(reportFile.read_text(encoding='utf8'));assert report['geometryVersion']=='20261024GeometryV30' and not report['probe']
rows=[]
for quality in ['Game','High']:
 file=bake.sourceDir/f'Scene_Type89MediumTank{quality}Pbr.blend'
 bpy.ops.wm.open_mainfile(filepath=str(file));root=bpy.data.objects['Model_Type89MediumTank']
 assert root['geometryVersion']==report['geometryVersion'] and root['geometryRecipeSha256']==report['geometryRecipeSha256']
 assert bpy.context.scene.get('Type89Stage')=='Pbr' and bpy.context.scene.get('Type89Quality')==quality
 target=bake.reviewDir/f'Model_Type89MediumTank{quality}Pbr.glb'
 bake.Export(root,target)
 data=target.read_bytes();length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length])
 mapped=[p for m in g['meshes']for p in m['primitives']if g['materials'][p['material']].get('normalTexture')]
 assert mapped and all('TANGENT'in p['attributes']for p in mapped),'Missing authored tangents on a normal-mapped primitive'
 if quality=='Game':(bake.assetDir/'Model_Type89MediumTank.glb').write_bytes(data)
 (bake.sourceDir/'Exports'/target.name).write_bytes(data)
 rows.append({'quality':quality,'file':str(target),'sha256':hashlib.sha256(data).hexdigest(),'normalMappedPrimitivesWithTangents':len(mapped),'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest()})
report['exportRefinement']={'method':'ExplicitBlenderMikkTangents','exportScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'currentBuilderSha256':hashlib.sha256((here/'Script_Type89PbrBake.py').read_bytes()).hexdigest(),'exports':rows,'scope':'Re-export only; packed source geometry, UVs, normal maps and all material channels retained'}
reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report['exportRefinement']))
