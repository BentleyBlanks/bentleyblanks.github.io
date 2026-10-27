"""Non-overlapping mechanical AO charts, preserving primaryUV and geometry.

Coils use actual free-helix phase/wire angle and separate planar end caps.
Other projected charts split only polygon pairs with strict interior overlap.
Pack all disconnected charts together; never change vertices or UV0.
"""
import bpy,math,numpy as np,hashlib,os
from mathutils import Vector

def RepairHardwareAoUv(objects,helper):
    primary={obj.name:helper['AoUvHash'](obj.data) for obj in objects};area3=area2=0.
    for obj in objects:
        mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers['GeometryAO']
        for t in mesh.loop_triangles:
            p=[obj.matrix_world@mesh.vertices[i].co for i in t.vertices];a=np.array([uv.data[k].uv[:] for k in t.loops]);area3+=(p[1]-p[0]).cross(p[2]-p[0]).length/2;area2+=abs(np.linalg.det(a[1:]-a[0]))/2
    scale=math.sqrt(area3/max(area2,1e-12));reports=[]
    def Centre(name):
        obj=bpy.data.objects[name];values={tuple(round(v,7) for v in obj.matrix_world@p.co) for p in obj.data.vertices};return sum((Vector(v) for v in values),Vector())/len(values)
    for obj in objects:
        mesh=obj.data;uv=mesh.uv_layers['GeometryAO'];name=obj.get('sourceDeltaPart',obj.name).removeprefix('GameHardware_');coil=name.startswith('Oleo_CoilSpring');caps=0
        if coil:
            label='Left' if name.endswith('Left') else 'Right';upper=Centre('Oleo_UpperPin'+label);lower=Centre('Oleo_LowerPin'+label);direction=(lower-upper).normalized();axis=(Centre('LandingGear_BodyPinFore'+label)-Centre('LandingGear_BodyPinAft'+label)).normalized();basis=(axis-direction*axis.dot(direction)).normalized();cross=direction.cross(basis);turns=9;total=2*math.pi*turns;radius=.036;wire=.0085
            lo,hi=0.,.2388
            for _ in range(45):
                span=(lo+hi)/2;extent=wire/math.sqrt(1+(span/(total*radius))**2)
                if span+2*extent>.2388:hi=span
                else:lo=span
            span=(lo+hi)/2;start=.048+(.2388-span)/2;length=math.hypot(total*radius,span);data=[]
            def Frame(t):
                radial=basis*math.cos(t)+cross*math.sin(t);azimuth=cross*math.cos(t)-basis*math.sin(t);tangent=(azimuth*radius+direction*(span/total)).normalized();across=tangent.cross(radial).normalized();center=upper+direction*(start+span*t/total)+radial*radius;return radial,across,tangent,center
            for vertex in mesh.vertices:
                point=obj.matrix_world@vertex.co;rel=point-upper;angle=math.atan2(rel.dot(cross),rel.dot(basis));turn=round(((rel.dot(direction)-start)/span*total-angle)/(2*math.pi));t=max(0,min(total,angle+turn*2*math.pi))
                for _ in range(12):
                    radial,across,tangent,center=Frame(t);first=(cross*math.cos(t)-basis*math.sin(t))*radius+direction*(span/total);second=(basis*(-math.cos(t))+cross*(-math.sin(t)))*radius;delta=center-point;den=first.length_squared+delta.dot(second)
                    if abs(den)<1e-12:break
                    step=delta.dot(first)/den;t=max(0,min(total,t-step))
                    if abs(step)<1e-12:break
                radial,across,tangent,center=Frame(t);res=point-center;a=res.dot(radial);b=res.dot(across);phi=math.atan2(b,a)%(2*math.pi);data.append((t,phi,a,b))
            for polygon in mesh.polygons:
                values=[data[mesh.loops[k].vertex_index] for k in polygon.loop_indices];ts=[v[0] for v in values];cap=0 if max(ts)<.003 else 1 if min(ts)>total-.003 else None
                if cap is not None:
                    caps+=1
                    for k,v in zip(polygon.loop_indices,values):uv.data[k].uv=(length+.05+cap*.05+v[2],.02+v[3])
                else:
                    phis=[v[1] for v in values]
                    if max(phis)-min(phis)>math.pi:phis=[p+2*math.pi if p<math.pi else p for p in phis]
                    for k,v,phi in zip(polygon.loop_indices,values,phis):uv.data[k].uv=(length*v[0]/total,wire*phi)
        else:
            for item in uv.data:item.uv*=scale
        mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles)
        # UV-degenerate polygons are isolated planar physical charts.
        degenerate={t.polygon_index for t in triangles if abs(np.linalg.det(np.array([uv.data[k].uv[:] for k in t.loops])[1:]-np.array(uv.data[t.loops[0]].uv)))<1e-12}
        isolated={};nextColour=1
        for pi in degenerate:
            polygon=mesh.polygons[pi];ps=[obj.matrix_world@mesh.vertices[mesh.loops[k].vertex_index].co for k in polygon.loop_indices];first=max((p-ps[0] for p in ps[1:]),key=lambda v:v.length_squared).normalized();normal=(obj.matrix_world.to_3x3().inverted().transposed()@polygon.normal).normalized();second=normal.cross(first).normalized();isolated[pi]=nextColour;nextColour+=1
            for k,p in zip(polygon.loop_indices,ps):uv.data[k].uv=((p-ps[0]).dot(first),(p-ps[0]).dot(second))
        triUv=[np.array([uv.data[k].uv[:] for k in t.loops],float) for t in triangles];valid=[i for i,t in enumerate(triangles) if t.polygon_index not in isolated];allPoints=np.concatenate([triUv[i] for i in valid]);mn=allPoints.min(0);extent=np.maximum(allPoints.max(0)-mn,1e-7);grid={};pairs=set();graph={};overlapPairs=0
        def Overlap(a,b):
            edges=np.r_[np.roll(a,-1,axis=0)-a,np.roll(b,-1,axis=0)-b];axes=np.column_stack([-edges[:,1],edges[:,0]]);norm=np.linalg.norm(axes,axis=1);axes=axes[norm>1e-12]/norm[norm>1e-12,None];pa=a@axes.T;pb=b@axes.T
            return bool(np.all(np.minimum(pa.max(0),pb.max(0))-np.maximum(pa.min(0),pb.min(0))>1e-9))
        for i in valid:
            a=triUv[i];lo=np.clip(np.floor((a.min(0)-mn)/extent*48).astype(int),0,47);hi=np.clip(np.floor((a.max(0)-mn)/extent*48).astype(int),0,47);candidates=set()
            for x in range(lo[0],hi[0]+1):
                for y in range(lo[1],hi[1]+1):candidates.update(grid.get((x,y),[]))
            for j in candidates:
                if triangles[i].polygon_index==triangles[j].polygon_index:continue
                b=triUv[j]
                if np.any(a.max(0)<=b.min(0)+1e-9) or np.any(b.max(0)<=a.min(0)+1e-9):continue
                if Overlap(a,b):
                    p,q=triangles[i].polygon_index,triangles[j].polygon_index;graph.setdefault(p,set()).add(q);graph.setdefault(q,set()).add(p);overlapPairs+=1
            for x in range(lo[0],hi[0]+1):
                for y in range(lo[1],hi[1]+1):grid.setdefault((x,y),[]).append(i)
        colours=dict(isolated)
        for pi in sorted(graph,key=lambda i:len(graph[i]),reverse=True):
            unavailable={colours[q] for q in graph[pi] if q in colours}|set(isolated.values());colour=0
            while colour in unavailable:colour+=1
            colours[pi]=colour
        for polygon in mesh.polygons:
            colour=colours.get(polygon.index,0)
            if colour:
                for k in polygon.loop_indices:uv.data[k].uv.x+=8*colour
        assert all(colours[p]!=colours[q] for p in graph for q in graph[p])
        reports.append({'part':name,'coilAnalytic':coil,'capPolygons':caps,'overlappingTrianglePairsSplit':overlapPairs,'polygonsRecharted':sum(v!=0 for v in colours.values()),'degeneratePolygonsReprojected':len(degenerate),'maxColour':max(colours.values(),default=0)})
    proxy,mapping=helper['AoProxy'](objects,'Temp_OverlapFreeAoPack',True);layer=proxy.data.uv_layers['GeometryAO'];proxy.data.uv_layers.active=layer
    for item in layer.data:item.pin_uv=False
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION',shape_method='CONCAVE');bpy.ops.object.mode_set(mode='OBJECT')
    for i,(obj,k) in enumerate(mapping):obj.data.uv_layers['GeometryAO'].data[k].uv=proxy.data.uv_layers['GeometryAO'].data[i].uv
    helper['RemoveAoProxy'](proxy)
    for obj in objects:obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True;assert helper['AoUvHash'](obj.data)==primary[obj.name]
    minimum=float(os.environ.get('KI4_AO_MIN_CHART_PIXELS','4'));sampling=EnsureMinimumAoCharts(objects,minimum) if minimum>0 else None
    return {'method':'Analytic free-helix tube/caps plus strict triangleSAT overlap graph split; shared atlas repack','primaryUv0Exact':True,'oldProjectedUvToMetresScale':scale,'parts':reports,'minimumChartSampling':sampling}

def EnsureMinimumAoCharts(objects,minimum=4,size=2048):
    reports=[]
    for obj in objects:
        mesh=obj.data;layer=mesh.uv_layers['GeometryAO'];uf=list(range(len(mesh.polygons)));edges={}
        def Find(i):
            while uf[i]!=i:uf[i]=uf[uf[i]];i=uf[i]
            return i
        for p in mesh.polygons:
            loops=list(p.loop_indices)
            for a,b in zip(loops,loops[1:]+loops[:1]):
                key=tuple(sorted((mesh.loops[k].vertex_index,round(layer.data[k].uv.x,7),round(layer.data[k].uv.y,7)) for k in [a,b]))
                if key in edges:uf[Find(p.index)]=Find(edges[key])
                else:edges[key]=p.index
        charts={}
        for p in mesh.polygons:charts.setdefault(Find(p.index),[]).extend(p.loop_indices)
        changed=[]
        for indices in charts.values():
            uv=np.array([layer.data[k].uv[:] for k in indices]);lo=uv.min(0);hi=uv.max(0);extent=hi-lo
            if min(extent*size)>=minimum:continue
            centre=(lo+hi)/2;collapsed=bool(min(extent)<=1e-12)
            if collapsed:
                points=np.array([obj.matrix_world@mesh.vertices[mesh.loops[k].vertex_index].co for k in indices]);local=points-points.mean(0);_,singular,axes=np.linalg.svd(local,full_matrices=False);assert singular[1]>1e-12,('Physically degenerate chart',obj.name);planar=local@axes[:2].T;span=np.ptp(planar,axis=0);assert min(span)>1e-12;expanded=(planar-(planar.min(0)+planar.max(0))/2)/span*(minimum/size)+centre
            else:
                factor=np.maximum(1,minimum/(extent*size));expanded=(uv-centre)*factor+centre
            assert expanded.min()>=0 and expanded.max()<=1,('UV chart outside atlas',obj.name)
            for k,value in zip(indices,expanded):layer.data[k].uv=value
            changed.append({'loops':len(indices),'collapsedChartReprojected':collapsed,'beforeBBoxPixels':(extent*size).tolist(),'afterBBoxPixels':(np.ptp(expanded,axis=0)*size).tolist()})
        reports.append({'part':obj.get('sourceDeltaPart',obj.name).removeprefix('GameHardware_'),'charts':len(charts),'expandedCharts':changed})
    return {'minimumBBoxPixels':minimum,'parts':reports,'scope':'AO UV1 only; charts expanded within existing6px packing margin. Actual emitted interior overlap audit must still pass. No geometry/primaryUV/normal or fabricated AO value.'}
