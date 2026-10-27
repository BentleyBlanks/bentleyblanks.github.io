"""Continuous all-angle wheel clearance from the actual exported rest surfaces."""
from mathutils import Vector


def AuditRunningGearWheelSweep(nodes,indicesByName,world,Geometry,wheels):
    rows=[];outer=[i for name,i in indicesByName.items()if name.startswith('Node_OuterBogieCheek')];cache={}
    def Data(index):
        if index not in cache:cache[index]=Geometry(index,world)
        return cache[index]
    def ProjectedDistance(centre,points):
        point=Vector((centre.y,centre.z));a,b,c=[Vector((p.y,p.z))for p in points]
        cross=lambda u,v:u.x*v.y-u.y*v.x
        area=cross(b-a,c-a);signs=[cross(q-p,point-p)for p,q in [(a,b),(b,c),(c,a)]]
        if abs(area)>1e-12 and(all(s>=0 for s in signs)or all(s<=0 for s in signs)):return 0.0
        distances=[]
        for p,q in [(a,b),(b,c),(c,a)]:
            delta=q-p;t=max(0,min(1,(point-p).dot(delta)/delta.length_squared))if delta.length_squared else 0
            distances.append((point-p-delta*t).length)
        return min(distances)
    for index in wheels:
        name=nodes[index]['name'];side='Left'if'Left'in name else'Right';axis=(world[index].to_3x3()@Vector((1,0,0))).normalized();assert abs(abs(axis.x)-1)<1e-6
        vertices,faces=Data(index);centre=world[index].translation
        wheelX=(min(p.x for p in vertices),max(p.x for p in vertices));radius=max(((p.y-centre.y)**2+(p.z-centre.z)**2)**.5 for p in vertices)
        inner=[indicesByName['Node_BogieSpringUnit'+side+str(i).zfill(2)]for i in [1,2]]
        inner.append(indicesByName['Node_UnderfloorDetail'])
        for unit in inner:
            points,_=Data(unit);bounds=[(min(p[a]for p in points),max(p[a]for p in points))for a in range(3)]
            axial=max(0,bounds[0][0]-wheelX[1],wheelX[0]-bounds[0][1]);radialMinimum=sum(max(0,low-centre[a],centre[a]-high)**2 for a,(low,high)in enumerate(bounds)if a in [1,2])**.5
            clearance=(axial**2+max(0,radialMinimum-radius)**2)**.5
            assert clearance>.001,(name,nodes[unit]['name'],clearance)
            rows.append({'wheel':name,'unit':nodes[unit]['name'],'continuousClearanceLowerBoundM':clearance,'method':'Whole wheel swept cylinder versus complete unit AABB'})
        bands={}
        for face in faces:
            points=[vertices[i]for i in face];key=(min(p.x for p in points),max(p.x for p in points));r=max(((p.y-centre.y)**2+(p.z-centre.z)**2)**.5 for p in points);bands[key]=max(bands.get(key,0),r)
        for unit in outer:
            points,triangles=Data(unit);minimum=1e10
            for face in triangles:
                triangle=[points[i]for i in face];low=min(p.x for p in triangle);high=max(p.x for p in triangle);radialMinimum=None
                for(x0,x1),r in bands.items():
                    axial=max(0,low-x1,x0-high)
                    if axial>.001:minimum=min(minimum,axial);continue
                    if radialMinimum is None:radialMinimum=ProjectedDistance(centre,triangle)
                    clearance=(axial**2+max(0,radialMinimum-r)**2)**.5
                    assert clearance>.001,(name,nodes[unit]['name'],clearance)
                    minimum=min(minimum,clearance)
            rows.append({'wheel':name,'unit':nodes[unit]['name'],'continuousClearanceLowerBoundM':minimum,'wheelAxialBands':len(bands),'method':'Every unit triangle versus conservative wheel axial-band sweep cylinders'})
    assert len(wheels)==30 and len(outer)==4 and len(rows)==210
    return {'pass':True,'wheelGroups':len(wheels),'wheelUnitPairs':len(rows),'minimumContinuousClearanceM':min(r['continuousClearanceLowerBoundM']for r in rows),'rows':rows,'toleranceM':.001,'scope':'Every exported wheel face is bounded by an invariant global-X interval and radial maximum about its verified axis. Target AABB or exact YZ triangle-distance lower bounds prove separation for every wheel rotation angle at the authored suspension rest pose. Track sweep is checked separately.'}
