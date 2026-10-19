"""A full-size civilian jacket pattern, quarter-folded inside the blanket."""
import math
from mathutils import Vector


def BuildCivilianJacket(CreateMesh,material,parent):
    verts=[];uvs=[];faces=[];lookup={}

    def Fold(u,v,back=False,sleeve=False):
        across=math.copysign(1,u)*(.52-abs(u)) if sleeve else u
        folded=across if abs(across)<=.14 else math.copysign(1,across)*(.28-abs(across))
        radius=.0015
        x=.015+folded
        z=.136-.28+math.sqrt((v-.28)**2+radius*radius)-radius
        leftLayer=.5-.5*math.tanh((u+.14)/.004)
        rightLayer=.5+.5*math.tanh((u-.14)/.004)
        hemLayer=.5-.5*math.tanh((v-.28)/.004)
        sleeveLayer=max(0,min(1,(abs(u)-.26)/.01)) if sleeve else 0
        y=-.096+(.0009 if back else 0)+.003*leftLayer+.006*rightLayer+.009*hemLayer+.0016*sleeveLayer
        if abs(folded)>.125 and (z>.120 or z<-.129):
            edge=.120 if z>0 else -.129
            delta=Vector((abs(folded)-.125,abs(z-edge)))
            if delta.length>.015:
                delta*=.015/delta.length;x=.015+math.copysign(.125+delta.x,folded);z=edge+math.copysign(delta.y,z-edge)
        return Vector((x,y,z))

    def Vertex(point,uv):
        key=tuple(round(value,8) for value in (*point,*uv))
        if key not in lookup:
            lookup[key]=len(verts);verts.append(tuple(point));uvs.append(tuple(uv))
        return lookup[key]

    def Clip(points,axis,bound,greater):
        result=[]
        for a,b in zip(points,points[1:]+points[:1]):
            insideA=a[axis]>=bound-1e-10 if greater else a[axis]<=bound+1e-10
            insideB=b[axis]>=bound-1e-10 if greater else b[axis]<=bound+1e-10
            if insideA:result.append(a)
            if insideA!=insideB:
                t=(bound-a[axis])/(b[axis]-a[axis]);result.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(2)))
        compact=[]
        for point in result:
            if not compact or sum((point[k]-compact[-1][k])**2 for k in range(2))>1e-16:compact.append(point)
        if len(compact)>2 and sum((compact[0][k]-compact[-1][k])**2 for k in range(2))<1e-16:compact.pop()
        return compact

    def Polygon(points,back=False,sleeve=False):
        # Cut in pattern space before folding, preserving the cloth's metric
        # surface area rather than shrinking an unfolded shirt into the pack.
        pieces=[list(points)]
        for axis,bound in ((0,-.14),(0,.14),(1,.28)):
            nextPieces=[]
            for piece in pieces:
                if min(p[axis] for p in piece)<bound-1e-9 and max(p[axis] for p in piece)>bound+1e-9:
                    nextPieces.extend([Clip(piece,axis,bound,True),Clip(piece,axis,bound,False)])
                else:nextPieces.append(piece)
            pieces=nextPieces
        for piece in pieces:
            if len(piece)<3:continue
            area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(piece,piece[1:]+piece[:1])))*.5
            if area<1e-10:continue
            face=[Vertex(Fold(u,v,back,sleeve),((u+.62)/1.24,v/.56)) for u,v in piece]
            central=not back and not sleeve and min(v for _,v in piece)>=.28-1e-8 and min(u for u,_ in piece)>=-.14-1e-8 and max(u for u,_ in piece)<=.14+1e-8
            if central:
                u=sum(point[0] for point in piece)/len(piece);v=sum(point[1] for point in piece)/len(piece)
                center=Fold(u,v);center.y-=.0038
                middle=Vertex(center,((u+.62)/1.24,v/.56))
                for a,b in zip(face,face[1:]+face[:1]):faces.append((a,b,middle))
            else:faces.append(tuple(reversed(face)) if back else tuple(face))

    def Seam(a,b,sleeve=False):
        points=[Fold(*a,False,sleeve),Fold(*b,False,sleeve),Fold(*b,True,sleeve),Fold(*a,True,sleeve)]
        faces.append(tuple(Vertex(point,uv) for point,uv in zip(points,((.18,.22),(.82,.22),(.82,.26),(.18,.26)))))

    left=[(-.26,0),(-.004,0),(-.004,.530),(-.028,.534),(-.045,.545),(-.052,.56),(-.20,.56),(-.26,.50),(-.26,.30)]
    right=[(-u,v) for u,v in reversed(left)]
    Polygon(left);Polygon(right)
    back=[(-.26,0),(.26,0),(.26,.30),(.26,.50),(.20,.56),(.052,.56),(.035,.550),(0,.548),(-.035,.550),(-.052,.56),(-.20,.56),(-.26,.50),(-.26,.30)]
    Polygon(back,True)
    for sign in (-1,1):
        for a,b in (((sign*.26,0),(sign*.26,.28)),((sign*.26,.28),(sign*.26,.30)),
                    ((sign*.26,.50),(sign*.20,.56)),((sign*.20,.56),(sign*.052,.56)),
                    ((sign*.26,0),(sign*.004,0))):Seam(a,b)

        def Limits(u):
            amount=(u-.26)/.36
            return .50-.12*amount,.30-.09*amount
        rings=(.26,.34,.38,.62)
        for first,second in zip(rings,rings[1:]):
            topA,bottomA=Limits(first);topB,bottomB=Limits(second)
            points=[(sign*first,topA),(sign*second,topB),(sign*second,bottomB),(sign*first,bottomA)]
            if sign>0:points.reverse()
            Polygon(points,sleeve=True);Polygon(points,back=True,sleeve=True)
            Seam((sign*first,topA),(sign*second,topB),True)
            Seam((sign*first,bottomA),(sign*second,bottomB),True)
        top,bottom=Limits(.62);Seam((sign*.62,top),(sign*.62,bottom),True)

    # A narrow overlapping civilian placket, without pockets or hardware.
    for bottom,top in ((0,.28),(.28,.530)):
        points=[]
        for u,v in ((-.006,bottom),(.014,bottom),(.014,top),(-.006,top)):
            point=Fold(u,v);point.y-=.0008;points.append(Vertex(point,((u+.62)/1.24,v/.56)))
        faces.append(tuple(points))

    neck=[(-.004,.530),(-.028,.534),(-.045,.545),(-.052,.560),(-.035,.550),(0,.548),(.035,.550),(.052,.560),(.045,.545),(.028,.534),(.004,.530)]
    collar=[]
    for index,(u,v) in enumerate(neck):
        row=[]
        for height in (0,1):
            point=Fold(u,v,back=3<index<7)
            point.y-=height*.006;point.z-=height*.006
            row.append(Vertex(point,(index/(len(neck)-1),.80+.04*height)))
        collar.append(row)
    for a,b in zip(collar,collar[1:]):faces.append((a[0],a[1],b[1],b[0]))

    # Preserve the already-approved exposed corner and knot-button placement.
    anchorA=Vertex(Fold(.20,.56),(.66,1));anchorB=Vertex(Fold(.26,.50),(.71,.89))
    corner=[Vertex(Vector(point),(.65+(point[0]-.120)/1.24,.90+(point[2]-.144)/.56)) for point in ((.120,-.1195,.144),(.178,-.1195,.141),(.171,-.1195,.085))]
    cornerFaces=((anchorA,corner[0],corner[1]),(anchorA,corner[1],corner[2]),(anchorA,corner[2],anchorB),tuple(corner))
    faces.extend(tuple(reversed(face)) for face in cornerFaces)
    obj=CreateMesh('Pack_IndigoShortJacket',verts,faces,uvs,material,parent)
    obj.data.set_sharp_from_angle(angle=math.radians(55));obj.data.update()
    parent['PatternDimensionsM']=[1.24,.56]
    parent['TorsoWidthM']=.52
    parent['Construction']='Full-size long-sleeved civilian jacket pattern; sleeves and side panels folded inward, hem folded underneath, central placket and collar preserved'
    return obj
