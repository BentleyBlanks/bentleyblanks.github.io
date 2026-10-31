"""Authored masonry maintenance: peeled old wash, patch brushing and runoff.

The thin mineral/slurry layers are creative appearance choices requested for
this candidate, not evidence of the lost bridge's maintenance or paint history.
Each support gets its own deterministic mask. Existing stone joints stay open.
"""
import math
import random
from mathutils import Vector


def BuildMasonryMaintenance(geometryClass, faces, seed, spec):
    layers = [geometryClass(), geometryClass()]
    area = [0.0, 0.0]
    configurations = {}
    thickness = spec["masonryCoatingThicknessM"]
    cell = spec["masonryCoatingCellM"]

    def Smooth(a, b, value):
        t = max(0.0, min(1.0, (value-a)/(b-a)))
        return t*t*(3-2*t)

    def Noise(u, v, phase):
        return (math.sin(u*12.7+v*8.3+phase)
                + .55*math.sin(u*27.1-v*19.7+phase*1.7)
                + .25*math.cos(u*43.7+v*33.1-phase*.7))/1.8

    def Configuration(face):
        group = face["group"]
        if group not in configurations:
            rng = random.Random(seed+group*3019)
            short = face.get("short", False)
            scale = .57 if short else 1.0
            u = rng.uniform(-.35,.35)*scale
            configurations[group] = dict(phase=rng.uniform(0,30), scale=scale,
                old=[(u,-2.65+rng.uniform(-.18,.18),.98*scale,.52),
                     (u-.45*scale,-3.82+rng.uniform(-.12,.12),.73*scale,.35)],
                new=(u+.28*scale,-2.37+rng.uniform(-.10,.10),.41*scale,.26),
                drips=[(-1.65 if not short else -.46)+rng.uniform(-.1,.1),
                       (1.67 if not short else .45)+rng.uniform(-.1,.1)])
        return configurations[group]

    def Fields(point, face):
        cfg = Configuration(face)
        u = (Vector(point)-face.get("origin", Vector())).dot(face["uAxis"])-face.get("uMid",0)
        v = point[1]
        phase = cfg["phase"]
        def Remnant(rect):
            x,y,rx,ry=rect
            # Curved, multiscale remnants instead of rectangle-shaped cards.
            du=(u-x+.075*rx*Noise(u*.7,v*.9,phase+7))/rx
            dv=(v-y+.06*ry*Noise(u*.9,v*.8,phase+11))/ry
            return 1-math.hypot(du,dv)+.22*Noise(u*1.4,v*1.5,phase)+.045*Noise(u*3.2,v*3.4,phase+9)
        paint = min(max(Remnant(r) for r in cfg["old"]), .32-Noise(u*1.7,v*2.3,phase+4))
        new = Remnant(cfg["new"])+.025*Noise(u*2.8,v*2.4,phase+2)
        drips=[]
        for k,x in enumerate(cfg["drips"]):
            center=x+.025*math.sin(v*5+phase+k)
            drips.append(min(.045+.012*math.sin(v*13+phase)-abs(u-center),
                             (-1.25-v)*.12,(v+3.65)*.12))
        drip=max(drips)
        return dict(old=max(paint,drip),new=new,paint=paint,drip=drip,u=u,v=v,phase=phase)

    def Snap(point):
        return tuple(round(float(v),4) for v in point)

    def Intersect(a,b,key):
        if tuple(a[0])>tuple(b[0]):a,b=b,a
        denominator=a[1][key]-b[1][key]
        t=round(a[1][key]/denominator,10) if abs(denominator)>1e-14 else .5
        point=a[0].lerp(b[0],t)
        values={name:a[1][name]+(b[1][name]-a[1][name])*t for name in ["old","new"]}
        return point,values

    def Clip(polygon,key,positive):
        out=[]
        if not polygon:return out
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            insideA=(a[1][key]>=0) if positive else (a[1][key]<=0)
            insideB=(b[1][key]>=0) if positive else (b[1][key]<=0)
            if insideA:out.append(a)
            if insideA!=insideB:out.append(Intersect(a,b,key))
        return out

    for face in faces:
        points=face["points"];normal=face["normal"]
        nu=max(1,math.ceil(max((points[1]-points[0]).length,(points[2]-points[3]).length)/cell))
        nv=max(1,math.ceil(max((points[3]-points[0]).length,(points[2]-points[1]).length)/cell))
        grid={}
        for i in range(nu+1):
            for j in range(nv+1):
                u,v=i/nu,j/nv
                p=points[0]*(1-u)*(1-v)+points[1]*u*(1-v)+points[2]*u*v+points[3]*(1-u)*v
                field=Fields(p,face);grid[i,j]=(p,{key:field[key] for key in ["old","new"]})
        polygons=[[],[]]
        for i in range(nu):
            for j in range(nv):
                a,b,c,d=grid[i,j],grid[i+1,j],grid[i+1,j+1],grid[i,j+1]
                for triangle in [[a,b,c],[a,c,d]]:
                    fresh=Clip(triangle,"new",True)
                    remainder=Clip(triangle,"new",False)
                    old=Clip(remainder,"old",True)
                    for kind,poly in enumerate([old,fresh]):
                        if len(poly)<3:continue
                        vertices=[]
                        for vertex,_ in poly:
                            p=Snap(vertex)
                            if not vertices or p!=vertices[-1]:vertices.append(p)
                        if len(vertices)>1 and vertices[0]==vertices[-1]:vertices.pop()
                        if len(vertices)<3:continue
                        center=sum((Vector(p) for p in vertices),Vector())/len(vertices)
                        winding=sum(((Vector(vertices[k])-center).cross(Vector(vertices[(k+1)%len(vertices)])-center) for k in range(len(vertices))),Vector())
                        polygonArea=abs(winding.dot(normal))/2
                        # Sub-millimetre slivers can snap onto each other and
                        # create non-manifold paint edges. They are omitted as
                        # peeled pinholes before the boundary walls are built.
                        shortest=min((Vector(a)-Vector(b)).length for a,b in zip(vertices,vertices[1:]+vertices[:1]))
                        if polygonArea<1e-6 or shortest<.0003:continue
                        if winding.dot(normal)<0:vertices.reverse()
                        polygons[kind].append(vertices);area[kind]+=polygonArea
        for kind,polys in enumerate(polygons):
            geometry=layers[kind];edges={}
            # Open a sub-millimetre peeled pinhole where quantized patch
            # islands touch at one point. Otherwise extruding that point
            # creates a four-face, non-manifold vertical edge.
            for _ in range(2):
                planarEdges={}
                for polygon in polys:
                    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                        key=tuple(sorted([a,b]));planarEdges[key]=planarEdges.get(key,0)+1
                degrees={}
                for (a,b),count in planarEdges.items():
                    if count==1:
                        degrees[a]=degrees.get(a,0)+1;degrees[b]=degrees.get(b,0)+1
                junctions={p for p,n in degrees.items() if n>2}
                if not junctions:break
                fixed=[]
                for polygon in polys:
                    clipped=[]
                    for index,p in enumerate(polygon):
                        if p not in junctions:clipped.append(p);continue
                        for neighbor in (polygon[index-1],polygon[(index+1)%len(polygon)]):
                            delta=Vector(neighbor)-Vector(p)
                            clipped.append(Snap(Vector(p)+delta.normalized()*min(.0004,delta.length*.4)))
                    unique=[]
                    for p in clipped:
                        if not unique or unique[-1]!=p:unique.append(p)
                    if len(unique)>1 and unique[0]==unique[-1]:unique.pop()
                    if len(unique)>=3:fixed.append(unique)
                polys=fixed
            def Tint(point):
                base=face["tint"](point) if callable(face["tint"]) else face["tint"]
                f=Fields(point,face)
                substrate=face.get("substrateCompensation",spec["masonrySubstrateCompensation"])
                # Damp stone has a darker albedo in addition to vertex stain.
                # Its boundary must return to that actual substrate, including
                # the reduced reflectance of wet mineral-wash remnants.
                relative=[c/d for c,d in zip(substrate,spec["masonrySubstrateCompensation"])]
                oldTint=[v*r for v,r in zip(spec["masonryOldWashTintGain"],relative)]
                newTint=[v*r for v,r in zip(spec["masonryRewashTintGain"],relative)]
                if kind==0:
                    # The exposed boundary must match the substrate. The old
                    # -0.09..+0.09 ramp was already half-painted at the cut,
                    # making every coarse clipped triangle read as a decal.
                    paint=Smooth(0,.30,f["paint"])
                    drip=Smooth(0,.045,f["drip"])
                    gains=[(c+(v-c)*paint)*(1-.08*drip) for c,v in zip(substrate,oldTint)]
                else:
                    strength=Smooth(0,.30,f["new"])
                    brush=1-strength*(.008-.008*math.sin(f["u"]*29+f["v"]*.8+f["phase"]))
                    paint=Smooth(0,.30,f["paint"])
                    edge=[c+(v-c)*paint for c,v in zip(substrate,oldTint)]
                    gains=[(c+(v-c)*strength)*brush for c,v in zip(edge,newTint)]
                return tuple(max(.08,min(1,float(base[i])*gains[i])) for i in range(3))+(1,)
            kwargs=dict(uvOffset=face["uvOffset"],uvTurn=face["uvTurn"],tint=Tint)
            def LayerPoint(p,top):return tuple(Vector(p)+normal*(thickness if top else 0))
            for polygon in polys:
                center=tuple(sum((Vector(p) for p in polygon),Vector())/len(polygon))
                if len(polygon)==3:
                    geometry.Polygon([LayerPoint(p,True) for p in polygon],**kwargs)
                    geometry.Polygon([LayerPoint(p,False) for p in reversed(polygon)],**kwargs)
                for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                    if (Vector(a)-Vector(b)).length<.00005:continue
                    if len(polygon)>3:
                        geometry.Polygon([LayerPoint(center,True),LayerPoint(a,True),LayerPoint(b,True)],**kwargs)
                        geometry.Polygon([LayerPoint(center,False),LayerPoint(b,False),LayerPoint(a,False)],**kwargs)
                    key=tuple(sorted([a,b]));entry=edges.setdefault(key,[0,a,b]);entry[0]+=1
            for count,a,b in edges.values():
                if count==1:geometry.Polygon([LayerPoint(a,True),LayerPoint(a,False),LayerPoint(b,False),LayerPoint(b,True)],**kwargs)
    return layers,dict(oldWashAreaM2=area[0],rewashAreaM2=area[1],seed=seed)
