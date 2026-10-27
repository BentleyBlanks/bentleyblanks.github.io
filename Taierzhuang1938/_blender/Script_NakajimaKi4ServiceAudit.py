"""Independent geometric checks for true service apertures and their LOD.

Source probes must pass the cut skin, then actual runtime geometry must retain
every unobstructed source exit ray. Material darkness cannot satisfy this test.
"""
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri


def ServiceTrianglesPenetrate(a,b):
    epsilon=.0000002
    na=(a[1]-a[0]).cross(a[2]-a[0]);nb=(b[1]-b[0]).cross(b[2]-b[0])
    if na.length<epsilon*epsilon or nb.length<epsilon*epsilon:return False
    na.normalize();nb.normalize()
    da=[(p-b[0]).dot(nb) for p in a];db=[(p-a[0]).dot(na) for p in b]
    if min(da)>epsilon or max(da)<-epsilon or min(db)>epsilon or max(db)<-epsilon:return False
    if max(abs(d) for d in da)<epsilon and max(abs(d) for d in db)<epsilon:
        for tri in [a,b]:
            for i in range(3):
                axis=na.cross(tri[(i+1)%3]-tri[i]);axis.normalize();pa=[p.dot(axis) for p in a];pb=[p.dot(axis) for p in b]
                if min(max(pa),max(pb))-max(min(pa),min(pb))<=epsilon:return False
        return True
    for edges,tri in [(a,b),(b,a)]:
        for i in range(3):
            start=edges[i];delta=edges[(i+1)%3]-start
            if delta.length_squared<epsilon*epsilon:continue
            hit=intersect_ray_tri(tri[0],tri[1],tri[2],delta,start,True)
            if hit is not None and epsilon<(hit-start).dot(delta)/delta.length_squared<1-epsilon:return True
    return False


def AuditServiceComponents(objects):
    cache={};pairs=[]
    def Triangles(name):
        if name not in cache:
            obj=objects[name];assert obj.type=='MESH','Audit the actual converted service geometry'
            obj.data.calc_loop_triangles();vertices=[obj.matrix_world@v.co for v in obj.data.vertices];faces=[tuple(t.vertices) for t in obj.data.loop_triangles]
            cache[name]={'vertices':vertices,'faces':faces,'bvh':BVHTree.FromPolygons(vertices,faces,all_triangles=True,epsilon=0)}
        return cache[name]
    for side in [-1,1]:
        outlets=[name+str(side) for name in ['ExhaustCollectorHood','ExhaustCollectorLip','ExhaustCollectorCavity']];louvres=[]
        for row,count in [('Upper',6),('Lower',7)]:
            louvres.extend('EngineLouvreBank'+row+part+str(side) for part in ['Backing','Rim'])
            louvres.extend('EngineLouvreSingle'+row+part+str(side) for part in ['Backing','Rim','Hood'])
            louvres.extend('EngineLouvreBank'+row+'Slat'+str(side)+'_'+str(i) for i in range(count))
        for outlet in outlets:
            for louvre in louvres:
                a,b=Triangles(outlet),Triangles(louvre);candidates=a['bvh'].overlap(b['bvh'])
                crossings=sum(ServiceTrianglesPenetrate([a['vertices'][k] for k in a['faces'][i]],[b['vertices'][k] for k in b['faces'][j]]) for i,j in candidates)
                assert crossings==0,'Outlet intersects a separate actual louvre component: '+outlet+' / '+louvre
                pairs.append({'outlet':outlet,'louvre':louvre,'trueTriangleIntersections':crossings,'bvhCandidates':len(candidates)})
    assert len(pairs)==138
    return {'actualSourceTriangles':True,'pairs':138,'trueTriangleIntersections':0,'scope':'Each actual outlet hood/lip/backing against all same-side louvre rims/backings/slats/hoods; shared edges alone are not penetration.'}


def ServiceAuditTree(objects):
    vertices=[];faces=[]
    for obj in objects:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles();offset=len(vertices)
        vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        faces.extend(tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    assert vertices and faces
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True)


def AuditServiceSource(root,objects):
    assert root['servicePanelProfile']=='Photo02RecessedBanks'
    assert root['serviceApertureCount']==10 and root['serviceRecessDepthM']==.020 and root['outletRecessDepthM']==.025
    cuts=json.loads(root['serviceSkinCutAuditJson']);assert len(cuts)==4
    assert all(row['removedSkinAreaM2']>.001 and row['cutOriginalTriangles']>0 for row in cuts)
    skin=ServiceAuditTree([objects[name] for name in ['Fuselage_Monocoque','Engine_AdapterPanels','EngineServicePanel1','EngineServicePanel-1']])
    full=ServiceAuditTree(root.children_recursive);records=[];probes=[]
    for side in [-1,1]:
        names=['ExhaustCollectorCavity'+str(side)]
        for row,count in [('Upper',6),('Lower',7)]:
            assert all(objects.get('EngineLouvreBank'+row+'Slat'+str(side)+'_'+str(i)) for i in range(count))
            names+=['EngineLouvreBank'+row+'Backing'+str(side),'EngineLouvreSingle'+row+'Backing'+str(side)]
        for name in names:
            obj=objects[name];obj.data.calc_loop_triangles();samples=0;clear=0;nearest=[];normalDots=[]
            for tri in obj.data.loop_triangles:
                points=[obj.matrix_world@obj.data.vertices[i].co for i in tri.vertices];center=sum(points,Vector())/3
                outward=Vector((side,0,0)) if name.startswith('Exhaust') else Vector((center.x,0,center.z-root['bodyLongitudinalAxisHeightM'])).normalized()
                normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized();normalDots.append(normal.dot(outward))
                assert normalDots[-1]>.5,'Recess backing must face the actual mouth: '+name
                assert skin.ray_cast(center+outward*.0005,outward,.10)[0] is None,'Retained skin blocks an actual opening: '+name
                distance=skin.find_nearest(center)[3];assert distance is not None and distance>.012,'Backing must lie in a real cavity away from the retained skin: '+name
                nearest.append(distance);samples+=1
                if full.ray_cast(center+outward*.0005,outward,.09)[0] is None:
                    clear+=1;probes.append((name,center,outward))
            assert clear>=5,'Actual source hood must leave a visible exit: '+name
            records.append({'name':name,'triangleCentroidSamples':samples,'unobstructedSourceExitRays':clear,'minNearestSkinDistanceM':min(nearest),'minOutwardNormalDot':min(normalDots)})
    record={'profile':'Photo02RecessedBanks','cutSkinLayers':cuts,'actualApertures':10,'parts':records,'samples':sum(row['triangleCentroidSamples'] for row in records),'unobstructedSourceExitRays':len(probes),'retainedSkinObstructions':0,'scope':'Actual backing triangle centroids and cut body/adapter/cover triangles; source clear exit rays are separately tested against the actual imported runtime.'}
    if root.get('servicePhotoCameraProfile')=='Photo02VisibleArcCamera':record['componentClearance']=AuditServiceComponents(objects)
    return record,probes


def AuditServiceRuntime(objects,probes):
    tree=ServiceAuditTree(objects);blocked=[]
    for name,center,outward in probes:
        hit=tree.ray_cast(center+outward*.0005,outward,.09)[0]
        if hit is not None:blocked.append({'part':name,'origin':list(center),'hit':list(hit)})
    assert not blocked,'Runtime LOD obstructs a source aperture: '+str(blocked[:3])
    return {'actualGlbReimport':True,'sourceExitRaySamples':len(probes),'runtimeObstructions':0,'scope':'Every actual source clear exit ray remains clear in actual imported game geometry, including cut skins, rims and hoods. No material-factor substitution.'}
