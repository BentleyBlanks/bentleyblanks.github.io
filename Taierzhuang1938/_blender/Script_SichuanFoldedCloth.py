"""A continuous folded cotton sheet, with exposed soft cross-section edges."""
import math
import bmesh
from mathutils import Vector


def BuildFoldedCloth(CreateMesh,FrontDepth,clothMaterial,backMaterial,foldMaterial,parent):
    profile=[]
    frontZ=[.145,.135,.11,.063,.037,-.015,-.047,-.06,-.073,-.10,-.133,-.143]
    for z in frontZ:profile.append((-.119,z,.011,'front'))
    sections=[
        [(-.116,-.138),(-.095,-.140),(-.052,-.139),(-.023,-.135),(-.013,-.128)],
        [(-.011,-.125),(-.011,-.02),(-.011,.095),(-.011,.125)],
        [(-.022,.139),(-.043,.140),(-.068,.141),(-.087,.124),(-.092,.103)],
        [(-.093,.074),(-.087,.020),(-.092,-.060),(-.086,-.111)],
        [(-.077,-.126),(-.058,-.130),(-.040,-.116),(-.035,-.098)],
        [(-.039,-.030),(-.033,.051),(-.037,.087)],
        [(-.046,.106),(-.058,.108),(-.069,.097),(-.071,.079)],
        [(-.067,.022),(-.072,-.047),(-.066,-.088)],
        [(-.061,-.105),(-.051,-.107),(-.049,-.085)],
        [(-.053,-.020),(-.053,.046),(-.054,.066)],
    ]
    for sectionIndex,points in enumerate(sections):
        half=.011 if sectionIndex<2 else .009 if sectionIndex<6 else .007
        kind='back' if sectionIndex==1 else 'fold'
        for y,z in points:profile.append((y,z,half,kind))
    xDetailed=[-.184,-.166,-.13,-.116,-.09,-.056,-.012,.04,.076,.102,.13,.166,.184]
    verts=[];uvs=[];faces=[];roles=[];rows=[];outerEdges=[];innerEdges=[]
    for index,(y,z,half,kind) in enumerate(profile):
        previous=Vector(profile[max(0,index-1)][:2]);following=Vector(profile[min(len(profile)-1,index+1)][:2])
        tangent=(following-previous).normalized()
        normal=Vector((-tangent.y,tangent.x))
        if kind=='back':normal=Vector((-1,0))
        outer=Vector((y,z))-normal*half;inner=Vector((y,z))+normal*half
        xValues=xDetailed if kind=='front' else [-.184,0,.184] if index<26 and kind!='back' else [-.184,.184]
        row=[]
        edgeZ=outer.y
        pressure=sum(math.exp(-((edgeZ-band)/.021)**2) for band in (.050,-.060))
        boundary=.184+.0017*math.sin(edgeZ*47+outer.x*29)-.002*pressure-.0045*max(0,(abs(edgeZ)-.121)/.03)**2
        for x in xValues:
            x=x*(1-.020*max(0,(abs(z)-.123)/.022)**2) if kind=='front' else x*boundary/.184
            point=outer.copy()
            if kind=='front':point.x=FrontDepth(x,z)
            elif kind!='back':
                point.y+=.0011*math.sin(x*29+index*.7)*max(0,1-(abs(x)/.184)**2)
            row.append((x,len(verts)));verts.append((x,point.x,point.y));uvs.append(((x+.19)/.38,(point.y+.15)/.30))
        rows.append(row)
        edgeOuter=outer.copy();edgeInner=inner.copy()
        if kind=='front':
            edgeX=.184*(1-.020*max(0,(abs(z)-.123)/.022)**2)
            edgeOuter.x=FrontDepth(edgeX,z);edgeInner.x=edgeOuter.x+half*2
        outerEdges.append(edgeOuter);innerEdges.append(edgeInner)
    for index in range(len(rows)-1):
        a,b=rows[index],rows[index+1];i=j=0
        while i<len(a)-1 or j<len(b)-1:
            if i==len(a)-1:
                faces.append((a[i][1],b[j+1][1],b[j][1]));j+=1
            elif j==len(b)-1:
                faces.append((a[i][1],a[i+1][1],b[j][1]));i+=1
            elif abs(a[i+1][0]-b[j+1][0])<1e-8:
                faces.append((a[i][1],a[i+1][1],b[j+1][1],b[j][1]));i+=1;j+=1
            elif a[i+1][0]<b[j+1][0]:
                faces.append((a[i][1],a[i+1][1],b[j][1]));i+=1
            else:
                faces.append((a[i][1],b[j+1][1],b[j][1]));j+=1
            role='back' if profile[index][3]==profile[index+1][3]=='back' else 'front' if profile[index][3]==profile[index+1][3]=='front' else 'fold'
            roles.append(role)
    # The cut ends reveal one continuous nested fold, rather than separate
    # cosmetic tubes on a solid rectangular board.
    for sign in (-1,1):
        crossValues=(0,.5,1) if sign<0 else (0,.33,.67,1)
        capRows=[]
        for index,(outer,inner) in enumerate(zip(outerEdges,innerEdges)):
            boundaryVertex=verts[rows[index][0 if sign<0 else -1][1]]
            outer=Vector((boundaryVertex[1],boundaryVertex[2]))
            row=[]
            for across in crossValues:
                point=outer.lerp(inner,across)
                x=boundaryVertex[0]+sign*.0055*math.sin(across*math.pi)
                row.append(len(verts));verts.append((x,point.x,point.y));uvs.append(((point.x+.13)/.13,(point.y+.15)/.30))
            capRows.append(row)
        for index in range(len(capRows)-1):
            for across in range(len(crossValues)-1):
                a,b=capRows[index],capRows[index+1]
                faces.append((a[across],a[across+1],b[across+1],b[across]));roles.append('fold')
        # Soft inner cloth remains visible deep in compressed fold gaps.
        # It is recessed, so the cut sheet edges still carry the silhouette.
        grid=[]
        for z in (-.137,0,.137):
            row=[]
            for y in (-.116,-.061,-.006):
                row.append(len(verts));verts.append((sign*(.178+.0015*math.cos(z*19)*math.cos(y*24)),y,z));uvs.append(((y+.13)/.13,(z+.15)/.30))
            grid.append(row)
        for z in range(2):
            for y in range(2):faces.append((grid[z][y],grid[z][y+1],grid[z+1][y+1],grid[z+1][y]));roles.append('fold')
    rounded=[]
    for x,y,z in verts:
        z=max(-.1498,min(.1498,z))
        if abs(x)>.165 and abs(z)>.125:
            delta=Vector((abs(x)-.165,abs(z)-.125))
            if delta.length>.025:
                delta*=.025/delta.length
                x=math.copysign(.165+delta.x,x);z=math.copysign(.125+delta.y,z)
        rounded.append((x,y,z))
    verts=rounded
    obj=CreateMesh('Pack_Bundle',verts,faces,uvs,clothMaterial,parent)
    # The exposed cut edge and main cloth share normals at their seam.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:
        center=face.calc_center_median()
        if all(abs(v.co.y)<1e-7 for v in face.verts):
            if face.normal.y<0:face.normal_flip()
        elif abs(center.x)>.174 and abs(face.normal.x)>.35:
            if face.normal.x*center.x<0:face.normal_flip()
        elif center.y<-.1 and face.normal.y>0:face.normal_flip()
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    obj.data.materials.append(backMaterial);obj.data.materials.append(foldMaterial)
    for polygon in obj.data.polygons:
        points=[obj.data.vertices[index].co for index in polygon.vertices]
        if all(abs(point.y)<1e-6 for point in points):polygon.material_index=1;polygon.use_smooth=False
        elif abs(polygon.normal.x)>.35 or all(abs(point.x)>.183 for point in points):polygon.material_index=2
    obj['Construction']='One folded sheet with a continuous nested cross section and a flat contact leaf'
    obj['NominalDimensionsM']=[.38,.30,.13]
    return obj
