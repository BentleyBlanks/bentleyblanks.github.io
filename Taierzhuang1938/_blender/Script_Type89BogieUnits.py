"""Inboard four-wheel-unit covers and shared leaf packs, working reconstruction."""
import math
from mathutils import Vector


def PeriodicProfile(points,steps):
    result=[];count=len(points)
    for i in range(count):
        a,b,c,d=[Vector(points[j%count])for j in [i-1,i,i+1,i+2]]
        for j in range(steps):
            t=j/steps
            result.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
    return result


def BuildBogieUnits(quality,side,parent,settings,armor,Node,Mesh,PolygonPrism,HexBolt):
    label='Left'if side<0 else'Right';data=settings['bogieUnits'];segments=24 if quality=='High'else 6
    profile=PeriodicProfile(data['shieldOutlineOffsetYZ'],8 if quality=='High'else 3)
    def AnalyticNormals(obj):
        normals=[]
        for face in obj.data.polygons:
            for at in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[at].vertex_index].co
                if abs(face.normal.x)>.7:n=Vector((1 if face.normal.x>0 else-1,0,0))
                elif abs(face.normal.y)>.7 and abs(face.normal.z)<.3:n=Vector((0,1 if face.normal.y>0 else-1,0))
                else:
                    slope=2*data['leafRiseM']*p.y/(data['leafLengthM']/2)**2;n=Vector((0,-slope,1)).normalized()*(1 if face.normal.z>0 else-1)
                normals.append(tuple(n))
        obj.data.normals_split_custom_set(normals)
    def Leaf(unit,index):
        length=data['leafLengthM']-index*data['leafLengthStepM'];centerZ=data['leafCenterZ']-index*data['leafSpacingM'];halfWidth=data['leafWidthM']/2;halfThickness=data['leafThicknessM']/2
        vertices=[];faces=[]
        for j in range(segments+1):
            y=-length/2+length*j/segments;z=centerZ+data['leafRiseM']*(y/(data['leafLengthM']/2))**2
            vertices.extend([(side*data['leafAbsX']+x,y,z+dz)for dz in [-halfThickness,halfThickness]for x in [-halfWidth,halfWidth]])
        for j in range(segments):
            a=j*4;b=a+4;faces.extend([(a+2,b+2,b+3,a+3),(a,a+1,b+1,b),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
        faces.extend([(0,2,3,1),tuple(range(segments*4,segments*4+4))])
        obj=Mesh('SharedLeafSpring',vertices,faces,armor,unit,0,smooth=True);AnalyticNormals(obj)
        if quality=='High':
            bevel=obj.modifiers.new('LeafEdgeRadius','BEVEL');bevel.width=.0006;bevel.segments=2;bevel.harden_normals=True
    def LeafPackSkin(unit):
        # Contacting leaves have no visible internal top/bottom faces. Keep
        # every outside step and the same six-segment top/bottom curvature.
        assert abs(data['leafSpacingM']-data['leafThicknessM'])<1e-9
        count=data['leafCountWorking'];halves=[(data['leafLengthM']-i*data['leafLengthStepM'])/2 for i in range(count)];h0=halves[0];th=data['leafThicknessM']/2
        def Curve(y):return data['leafCenterZ']+data['leafRiseM']*(y/h0)**2
        top=[(-h0+2*h0*j/segments,Curve(-h0+2*h0*j/segments)+th)for j in range(segments+1)]
        bottom=[(h0,Curve(h0)-th)]
        for i in range(count-1):
            y=halves[i+1];bottom.extend([(y,Curve(y)-i*data['leafSpacingM']-th),(y,Curve(y)-(i+1)*data['leafSpacingM']-th)])
        for j in range(1,segments+1):
            y=halves[-1]-2*halves[-1]*j/segments;bottom.append((y,Curve(y)-(count-1)*data['leafSpacingM']-th))
        for i in reversed(range(count-1)):
            y=-halves[i+1];bottom.extend([(y,Curve(y)-i*data['leafSpacingM']-th),(-halves[i],Curve(-halves[i])-i*data['leafSpacingM']-th)])
        obj=PolygonPrism('SharedLeafPackOuterSkin',top+bottom,'X',data['leafWidthM'],(side*data['leafAbsX'],0,0),armor,unit,0);AnalyticNormals(obj)
    def Clamp(unit,y):
        z=data['leafCenterZ']-(data['leafCountWorking']-1)*data['leafSpacingM']/2+data['leafRiseM']*(y/(data['leafLengthM']/2))**2
        outer=[(-.042,-.024),(.042,-.024),(.042,.024),(-.042,.024)];inner=[(-.036,-.018),(.036,-.018),(.036,.018),(-.036,.018)];vertices=[]
        for dy in [-.0075,.0075]:
            for ring in [outer,inner]:vertices.extend((side*data['leafAbsX']+x,y+dy,z+dz)for x,dz in ring)
        faces=[]
        for i in range(4):
            j=(i+1)%4;faces.extend([(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)])
        Mesh('SharedSpringClamp',vertices,faces,armor,unit,.0007 if quality=='High'else 0)
    for i,centerY in enumerate(data['unitCenterY']):
        unit=Node('Node_BogieSpringUnit%s%02d'%(label,i+1),(0,centerY,0),parent,geometryRole='inboard running-gear cover and shared spring rest assembly',constructionEvidence='Same-car low photographs35/36; visible silhouette inferred in metres, hidden coupling/leaf count and outer fittings unverified')
        PolygonPrism('InboardBogieUnitCover',profile,'X',data['shieldThicknessM'],(side*data['shieldAbsX'],0,0),armor,unit,.002 if quality=='High'else 0)
        if quality=='Game'and data.get('contactLeafOuterSkin'):LeafPackSkin(unit)
        else:
            for leaf in range(data['leafCountWorking']):Leaf(unit,leaf)
        for y in [-.18,.18]:Clamp(unit,y)
        # The inward face shows a small central fixing. Do not mirror the
        # outer2007 circular/end-fastener pattern onto this inward surface.
        HexBolt((side*(data['shieldAbsX']-data['shieldThicknessM']/2),0,.325),(-side,0,0),unit,.006,.004)
