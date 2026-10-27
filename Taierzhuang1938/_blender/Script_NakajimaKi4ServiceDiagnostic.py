"""Locate the actual retained skin obstructing service rays; never modify it."""
import bpy,pathlib,json,hashlib
from mathutils import Vector
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4ServiceDiagnostic.py')).resolve();repo=scriptPath.parents[2];asset=repo/'tmp/NakajimaKi4/ReferenceV47_AirframeJoint';new=json.loads((asset/'Evidence/Data_WholeAirframeAuthor.json').read_text(encoding='utf8'));old=json.loads((repo/'tmp/NakajimaKi4/ReferenceV46_FullBladeOutline/Evidence/Data_PropellerSectionAuthor.json').read_text(encoding='utf8'));helper=scriptPath.with_name('Script_NakajimaKi4ServiceAudit.py');ns={'__file__':str(helper)};exec(compile(helper.read_text(encoding='utf8'),str(helper),'exec'),ns);reports=[]
for label,record in [('V46',old),('V47',new)]:
    path=pathlib.Path(record['sourcePath']);assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sourceSha256'];bpy.ops.wm.open_mainfile(filepath=str(path));root=bpy.data.objects['NakajimaKi4'];skins={name:ns['ServiceAuditTree']([bpy.data.objects[name]])for name in['Fuselage_Monocoque','Engine_AdapterPanels','EngineServicePanel1','EngineServicePanel-1']};blocked=[];samples=0
    for side in[-1,1]:
        names=['ExhaustCollectorCavity'+str(side)]+['EngineLouvre'+kind+row+'Backing'+str(side)for row in['Upper','Lower']for kind in['Bank','Single']]
        for name in names:
            obj=bpy.data.objects[name];obj.data.calc_loop_triangles()
            for tri in obj.data.loop_triangles:
                points=[obj.matrix_world@obj.data.vertices[i].co for i in tri.vertices];center=sum(points,Vector())/3;outward=Vector((side,0,0))if name.startswith('Exhaust')else Vector((center.x,0,center.z-root['bodyLongitudinalAxisHeightM'])).normalized();samples+=1
                for skin,tree in skins.items():
                    hit,normal,index,distance=tree.ray_cast(center+outward*.0005,outward,.10)
                    if hit is not None:blocked.append({'part':name,'triangle':tri.index,'skin':skin,'origin':list(center),'direction':list(outward),'hit':list(hit),'distanceM':distance})
    reports.append({'version':label,'sourceSha256':record['sourceSha256'],'sourceSamples':samples,'blockedRays':len(blocked),'rows':blocked});assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sourceSha256']
proof={'state':'ActualRetainedServiceSkinBlockersLocated_ReadOnly','reports':reports};(asset/'Evidence/Data_ServiceBlockerDiagnostic.json').write_text(json.dumps(proof,indent=2),encoding='utf8');result={r['version']:{'samples':r['sourceSamples'],'blocked':r['blockedRays'],'first':r['rows'][:3]}for r in reports};print(json.dumps(result))
