"""Exported V53 ball envelope and complete jacket aiming sweep."""
import math
from mathutils import Vector,Matrix


def AuditBowMachineGun(nodes,indicesByName,static,World,Geometry,Bvh,Descendants,Bounds,BoundsOverlap):
    gunIndex=indicesByName['Node_BowMachineGun'];ballIndex=indicesByName['Node_BowMgBall'];jacketIndex=indicesByName['Node_BowMgJacket']
    parts=Descendants(gunIndex);rest=World({});centre=rest[gunIndex].translation.copy();ball=Geometry(ballIndex,rest);jacket=Geometry(jacketIndex,rest)
    radius=max((p-centre).length for p in ball[0]);expectedRadius=nodes[ballIndex].get('extras',{}).get('outerRadiusM',.125);assert abs(radius-expectedRadius)<1e-5
    ownPairs=Bvh(ball).overlap(Bvh(jacket));targets={};envelope=[]
    for index,node in enumerate(nodes):
        if 'mesh'not in node or index in parts:continue
        geometry=Geometry(index,rest);tree=Bvh(geometry);bounds=Bounds(geometry);targets[index]=(tree,bounds)
        nearest=tree.find_nearest(centre)
        if nearest[0]is not None:
            clearance=nearest[3]-radius
            if clearance<.05:envelope.append({'target':node['name'],'continuousFullSphereClearanceLowerBoundM':clearance})
    minimum=min((r['continuousFullSphereClearanceLowerBoundM']for r in envelope),default=1)
    contacts=[];nearby=poses=0;jacketVariants=[]
    for yaw in [-10,-5,0,5,10]:
        for pitch in [-8,-4,0,4,8]:
            pose={gunIndex:static[gunIndex]@Matrix.Rotation(math.radians(yaw),4,'Y')@Matrix.Rotation(math.radians(pitch),4,'X')}
            world=World(pose);geometry=Geometry(jacketIndex,world);tree=Bvh(geometry);bounds=Bounds(geometry);poses+=1
            jacketVariants.append((yaw,pitch,tree,bounds))
            assert (world[gunIndex].translation-centre).length<1e-7
            for target,(fixed,fixedBounds)in targets.items():
                if not BoundsOverlap(bounds,fixedBounds):continue
                nearby+=1;pairs=tree.overlap(fixed)
                if pairs:contacts.append({'yaw':yaw,'pitch':pitch,'target':nodes[target]['name'],'trianglePairs':len(pairs)})
    casing=Geometry(indicesByName['Node_BowMgMount'],rest,True);casingTree=Bvh(casing);casingBounds=Bounds(casing);coverContacts=[];coverPoses=0;coverBallMinimum=1e9;coverJacketPairs=0
    for name,axis,angles in [('Node_BowHatch','Y',range(0,71,5)),('Node_BowRoundPortCover','X',range(0,181,5)),('Node_DriverVisionFlap','X',range(0,106,5))]:
        index=indicesByName[name]
        for angle in angles:
            world=World({index:static[index]@Matrix.Rotation(math.radians(angle),4,axis)});geometry=Geometry(index,world);tree=Bvh(geometry);bounds=Bounds(geometry);coverPoses+=1
            nearest=tree.find_nearest(centre);clearance=nearest[3]-radius;coverBallMinimum=min(coverBallMinimum,clearance)
            if clearance<.001:coverContacts.append({'cover':name,'angle':angle,'target':'FullMovingBallEnvelope','clearanceM':clearance})
            if BoundsOverlap(bounds,casingBounds):
                pairs=tree.overlap(casingTree)
                if pairs:coverContacts.append({'cover':name,'angle':angle,'target':'FixedHoodAndFlange','trianglePairs':len(pairs)})
            for yaw,pitch,jacketTree,jacketBounds in jacketVariants:
                if not BoundsOverlap(bounds,jacketBounds):continue
                coverJacketPairs+=1;pairs=tree.overlap(jacketTree)
                if pairs:coverContacts.append({'cover':name,'angle':angle,'yaw':yaw,'pitch':pitch,'target':'MovingJacket','trianglePairs':len(pairs)})
    return {'pass':not ownPairs and minimum>=.001 and not contacts and not coverContacts,'sampledPoses':poses,'fixedTargetMeshes':len(targets),'testedNearbyPairs':nearby,'jacketBallRigidIntersectionPairs':len(ownPairs),'actualExportedBallRadiusUpperBoundM':radius,'minimumContinuousBallEnvelopeClearanceM':minimum,'continuousBallEnvelope':envelope,'intersections':contacts,'coverSweep':{'pass':not coverContacts,'coverPoses':coverPoses,'minimumBallEnvelopeClearanceM':coverBallMinimum,'nearbyJacketPairs':coverJacketPairs,'contacts':coverContacts},'scope':'Actual exported complete jacket versus every other fixed mesh at25aims, using the runtime yaw/pitch order. The complete ball is bounded by an invariant sphere about the verified aiming origin; nearest-triangle bounds prove ball clearance for every rotation angle, including between samples. Jacket and ball are checked in their invariant relative frame. Three front covers are also swept against the ball envelope, fixed hood/flange, and all25jacket aims. The limits and internal bore remain display reconstruction parameters.'}
