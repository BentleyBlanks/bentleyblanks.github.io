"""Full-turn front-idler clearance against the actual fixed front assemblies."""
import math
from mathutils import Matrix


def AuditFrontFixedSweep(indicesByName,static,World,Geometry,Bvh):
    world0=World({});rows=[];poses=0;nearby=0;maximum=0.0
    tolerance=.001;bearingRadius=.080
    for side in ['Left','Right']:
        wheel=indicesByName['Node_FrontIdler'+side];origin=world0[wheel].translation
        fixed=[]
        names=['Node_Suspension'+side,'Node_InboardIdlerSupport'+side]
        names += [name for name in indicesByName if name.startswith('Node_SuspensionCover'+side)or name.startswith('Node_VerticalSkirt'+side)]
        for name in names:
            geometry=Geometry(indicesByName[name],world0,True)
            fixed.append((name,geometry,Bvh(geometry)))
        for frame in range(36):
            pose={wheel:static[wheel]@Matrix.Rotation(frame*math.tau/36,4,'X')}
            world=World(pose);geometry=Geometry(wheel,world);tree=Bvh(geometry);poses+=1
            for name,target,targetTree in fixed:
                nearby+=1;outside=0;depth=0.0;deepest=None
                for a,b in tree.overlap(targetTree):
                    wp=[geometry[0][i]for i in geometry[1][a]]
                    fp=[target[0][i]for i in target[1][b]]
                    # Only rotating faces wholly inside the central bearing
                    # are intentional contacts. Broad static plate corners do
                    # not alter the radius of that exclusion.
                    if max(math.hypot(p.y-origin.y,p.z-origin.z)for p in wp)<bearingRadius:continue
                    outside+=1
                    for points,otherTree in [(wp,targetTree),(fp,tree)]:
                        for point in points:
                            near,normal,_,_=otherTree.find_nearest(point)
                            if near is not None:
                                signed=-(point-near).dot(normal)
                                if signed>depth:depth=signed;deepest=list(point)
                if outside:
                    rows.append({'side':side,'frame':frame,'degrees':frame*10,'target':name,'trianglePairs':outside,'maximumVertexPenetrationM':depth,'deepestWorld':deepest})
                    maximum=max(maximum,depth)
    return {'pass':maximum<tolerance,'sampledPoses':poses,'posesPerSide':36,'testedNearbyPairs':nearby,'bearingExclusionRadiusM':bearingRadius,'toleranceM':tolerance,'maximumVertexPenetrationM':maximum,'contacts':rows,'blockingContacts':[r for r in rows if r['maximumVertexPenetrationM']>=tolerance],'scope':'Every actual front-idler triangle against both fixed front faces and all upper/lower cover sheets at rest over a full turn. Only the central80mm bearing faces are excluded; retain the existing1mm penetration policy and record all other surface crossings.'}
