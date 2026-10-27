"""Independent triangle checks of poses produced by the actual JS runtime."""
from mathutils import Matrix
import json,hashlib,subprocess,shutil
from pathlib import Path


def AuditBowMachineGunWithRuntime(nodes,indices,static,World,Geometry,Bvh,Descendants,Bounds,BoundsOverlap,file,trackFile,reportDir):
    from Script_Type89BowMachineGunAudit import AuditBowMachineGun
    raw=AuditBowMachineGun(nodes,indices,static,World,Geometry,Bvh,Descendants,Bounds,BoundsOverlap)
    linkage=nodes[indices['Node_BowHatch']].get('extras',{}).get('bowGunDoorStow')
    if not linkage:return raw
    here=Path(__file__).resolve().parent;reportDir=Path(reportDir);reportDir.mkdir(parents=True,exist_ok=True);sha=hashlib.sha256(Path(file).read_bytes()).hexdigest();planFile=reportDir/('Data_BowDoorPosePlan_'+sha[:8]+'.json');node=shutil.which('node');assert node,'Node runtime needed for the public-controller pose audit'
    subprocess.run([node,str(here/'Script_Type89DoorPosePlan.mjs'),'--file='+str(file),'--track-path='+str(trackFile),'--out='+str(planFile)],check=True,capture_output=True,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    plan=json.loads(planFile.read_text());assert plan['glbSha256']==sha and plan['poseCount']==1775
    motion=here.parent/'Model/Type89MediumTank/Script_Type89Motion.mjs';assert plan['runtimeScriptSha256']==hashlib.sha256(motion.read_bytes()).hexdigest()
    resolved=AuditResolvedBowDoor(nodes,indices,World,Geometry,Bvh,Bounds,BoundsOverlap,Descendants,plan)
    other=[r for r in raw['coverSweep']['contacts']if r['cover']!='Node_BowHatch'];core=not raw['jacketBallRigidIntersectionPairs']and raw['minimumContinuousBallEnvelopeClearanceM']>=.001 and not raw['intersections'];rawCover=raw['coverSweep']
    raw.update(rawUnconstrainedPass=raw['pass'],rawUnconstrainedCoverSweep=rawCover,resolvedDoorSweep=resolved,mechanismEvidence=linkage,posePlan=str(planFile))
    raw['coverSweep']={'pass':not other and resolved['pass'],'rawCoverPoses':rawCover['coverPoses'],'runtimeDoorInputPoses':resolved['requestedPoses'],'nonDoorContacts':other,'rawBlockedDoorContactRows':len(rawCover['contacts'])-len(other)}
    raw['pass']=core and raw['coverSweep']['pass'];return raw


def AuditResolvedBowDoor(nodes,indices,World,Geometry,Bvh,Bounds,BoundsOverlap,Descendants,plan):
    gun=indices['Node_BowMachineGun'];door=indices['Node_BowHatch'];jacket=indices['Node_BowMgJacket'];ball=indices['Node_BowMgBall'];rest=World({});centre=rest[gun].translation.copy();radius=max((p-centre).length for p in Geometry(ball,rest)[0]);moving=Descendants(gun)|Descendants(door);targets={}
    for i,node in enumerate(nodes):
        if 'mesh'in node and i not in moving:
            geometry=Geometry(i,rest);targets[i]=(Bvh(geometry),Bounds(geometry))
    casing=Geometry(indices['Node_BowMgMount'],rest,True);casingTree=Bvh(casing);casingBounds=Bounds(casing);gunCache={};doorCache={};contacts=[];nearest=1e9;nearby=0
    def Mat(values):return Matrix([values[i:i+4]for i in range(0,16,4)]).transposed()
    for row in plan['rows']:
        gm=tuple(row['gunMatrix']);dm=tuple(row['doorMatrix']);world=World({gun:Mat(gm),door:Mat(dm)})
        if gm not in gunCache:
            geometry=Geometry(jacket,world);tree=Bvh(geometry);bounds=Bounds(geometry);gunCache[gm]=(tree,bounds)
            for target,(fixed,fixedBounds)in targets.items():
                if not BoundsOverlap(bounds,fixedBounds):continue
                pairs=tree.overlap(fixed)
                if pairs:contacts.append({'requested':row['requestedDegrees'],'effective':row['effectiveDegrees'],'target':nodes[target]['name'],'moving':'Jacket','trianglePairs':len(pairs)})
        if dm not in doorCache:
            geometry=Geometry(door,world);tree=Bvh(geometry);bounds=Bounds(geometry);doorCache[dm]=(tree,bounds);hit=tree.find_nearest(centre);clearance=hit[3]-radius;nearest=min(nearest,clearance)
            if clearance<.001:contacts.append({'requested':row['requestedDegrees'],'moving':'Door','target':'FullBallEnvelope','clearanceM':clearance})
            if BoundsOverlap(bounds,casingBounds):
                pairs=tree.overlap(casingTree)
                if pairs:contacts.append({'requested':row['requestedDegrees'],'moving':'Door','target':'FixedCasing','trianglePairs':len(pairs)})
        jt,jb=gunCache[gm];dt,db=doorCache[dm]
        if BoundsOverlap(jb,db):
            nearby+=1;pairs=jt.overlap(dt)
            if pairs:contacts.append({'requested':row['requestedDegrees'],'effective':row['effectiveDegrees'],'moving':'Jacket','target':'Door','trianglePairs':len(pairs)})
    return {'pass':not contacts,'method':plan['method'],'runtimeScriptSha256':plan['runtimeScriptSha256'],'requestedPoses':len(plan['rows']),'uniqueGunPoses':len(gunCache),'uniqueDoorPoses':len(doorCache),'nearbyJacketDoorPairs':nearby,'minimumDoorBallEnvelopeClearanceM':nearest,'contacts':contacts,'scope':'Public JS SetPose matrices, checked against actual exported triangles by an independent Python BVH pass. Raw unconstrained contacts remain recorded separately. Linkage is explicitly a display-clearance reconstruction.'}
