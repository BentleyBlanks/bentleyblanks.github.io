"""Three sloping sheets above two curved vertical skirts, per same-car photos."""
import math
import bmesh
from mathutils import Vector
from Script_Type89DetailedParts import RefineTensionerRail


def BuildSkirtAssembly(quality,side,parent,settings,armor,Node,Mesh,Box,Tube,Rivet):
    data=settings['skirtAssembly'];label='Left'if side<0 else'Right'
    height=data['innerHeightM'];drop=data['slopeDropM'];width=data['outerWidthM'];inner=data['innerAbsX'];foldZ=height-drop
    normal=Vector((side*drop,0,width)).normalized();angle=side*math.atan2(drop,width)
    top=data['topY'];fold=data['foldY'];gap=data['upperSeamGapM']/2;upper=[]
    def Surface(y,z):return Vector((side*(inner+width*(height-z)/drop),y,z))
    def Local(point,node):return Vector(point)-node.location
    def Sheet(name,points,node,thickness):
        obj=Mesh(name,[tuple(Local(p,node))for p in points],[tuple(range(len(points)))],armor,node,0)
        desired=normal if name.startswith('Sloping')else Vector((side,0,0))
        if obj.data.polygons[0].normal.dot(desired)<0:
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
        solid=obj.modifiers.new('ArmorSheetThickness','SOLIDIFY');solid.thickness=thickness
        return obj
    for i in range(3):
        node=Node('Node_SuspensionCover%s%02d'%(label,i+1),(side*inner,data['pivotY'][i],height),parent,axis='localY',rangeDegrees=[0,45],constructionEvidence='Upper-sheet authoring pivot retained; exact maintenance travel/sequence unverified')
        tf=top[i]-(gap if i else 0);tr=top[i+1]+(gap if i<2 else 0);ff=fold[i]-(gap if i else 0);fr=fold[i+1]+(gap if i<2 else 0)
        Sheet('SlopingSuspensionCover',[Surface(tf,height),Surface(tr,height),Surface(fr,foldZ),Surface(ff,foldZ)],node,.008)
        upper.append(node)
        for front,y0,y1 in [(True,tf,ff),(False,tr,fr)]:
            offset=-.014 if front else .014
            if(i==0 and front)or(i==2 and not front):offset=-.04 if front else .04
            for t in [0,.25,.5,.75,1]:
                y=y0+(y1-y0)*t+offset;z=height-drop*t
                point=Surface(y,z)+normal*.0006
                Rivet(Local(point,node),normal,node,.007)
    # Narrow backing laps keep the bolted seams closed without coincident faces.
    for i in [1,2]:
        points=[Surface(top[i]+.012,height),Surface(top[i]-.012,height),Surface(fold[i]-.012,foldZ),Surface(fold[i]+.012,foldZ)]
        points=[p-normal*.004 for p in points]
        Sheet('SlopingCoverSeamBacking',points,parent,.002)
    def UpperFor(y,z):
        t=max(0,min(1,(height-z)/drop));bounds=[top[i]*(1-t)+fold[i]*t for i in range(4)]
        return next((upper[i]for i in range(3)if bounds[i]+.10>=y>=bounds[i+1]-.10),upper[-1])
    for hinge in data['middleHinges']:
        y,z=hinge['y'],hinge['z'];node=UpperFor(y,z);surface=Surface(y,z);center=surface+normal*.0015
        leaf=Box('SuspensionMiddleHingeLeaf',Local(center,node),(.073,.073,.002),armor,node,.0008 if quality=='High'else 0);leaf.rotation_euler.y=angle
        pin=surface+normal*.008
        Tube('SuspensionMiddleHinge',Local(pin+Vector((0,-.038,0)),node),Local(pin+Vector((0,.038,0)),node),.0065,armor,node,12 if quality=='High'else 6)
        for delta in [-.026,.026]:
            point=surface+Vector((side*normal.z*delta,0,-abs(normal.x)*delta))+normal*.0026
            Rivet(Local(point,node),normal,node,.0045)
    curve=RefineTensionerRail(data['lowerBottomControlsYZ'],6 if quality=='High'else 3)
    def BottomAt(y):
        for a,b in zip(curve,curve[1:]):
            if a[0]>=y>=b[0]:return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0])
        return curve[0][1]if y>curve[0][0]else curve[-1][1]
    lower=[];bounds=data['lowerSectionY'];lowerGap=data['lowerSeamGapM']/2
    for i,name in enumerate(['Front','Rear']):
        front=bounds[i]-(lowerGap if i else 0);rear=bounds[i+1]+(lowerGap if i==0 else 0)
        node=Node('Node_VerticalSkirt'+label+name,(side*(inner+width),bounds[i],foldZ),parent,axis='localY',rangeDegrees=[0,45],constructionEvidence='Photo-visible lower sheet and hinge line; travel/maintenance coupling inferred')
        lower.append(node)
        bottom=[(front,BottomAt(front))]+[p for p in curve if rear<p[0]<front]+[(rear,BottomAt(rear))]
        points=[Vector((side*(inner+width),front,foldZ)),Vector((side*(inner+width),rear,foldZ))]+[Vector((side*(inner+width),y,z))for y,z in reversed(bottom)]
        Sheet('CurvedVerticalSkirt',points,node,.008)
    for hinge in data['foldHinges']:
        y=hinge['y'];upperNode=UpperFor(y,foldZ);lowerNode=lower[0 if y>bounds[1]else 1]
        Tube('SkirtHinge',Local((side*(inner+width+.008),y-.032,foldZ),upperNode),Local((side*(inner+width+.008),y+.032,foldZ),upperNode),.007,armor,upperNode,12 if quality=='High'else 6)
        Box('SkirtHingeLeaf',Local((side*(inner+width+.002),y,foldZ-.017),lowerNode),(.002,.070,.034),armor,lowerNode,.0008 if quality=='High'else 0)
        for dy in [-.023,.023]:Rivet(Local((side*(inner+width+.0032),y+dy,foldZ-.029),lowerNode),(side,0,0),lowerNode,.0045)
    for y,z in settings.get('lowerJoinMovingHeadsYZ',[]):Rivet(Local((side*(inner+width+.0005),y,z),lower[0]),(side,0,0),lower[0],.006)
    for y,z in data['lowerSeamHeadsYZ']:
        for i,offset in [(0,.014),(1,-.014)]:Rivet(Local((side*(inner+width+.0005),y+offset,z),lower[i]),(side,0,0),lower[i],.006)
    for oldDrop in [.059,.132,.205]:
        y=bounds[-1]+.023;z=max(foldZ-oldDrop,BottomAt(y)+.016)
        Rivet(Local((side*(inner+width+.0005),y,z),lower[1]),(side,0,0),lower[1],.006)
    # A backing strip lies behind the single vertical sheet junction.
    y=bounds[1];x=side*(inner+width-.006)
    points=[Vector((x,y+.014,foldZ)),Vector((x,y-.014,foldZ)),Vector((x,y-.014,BottomAt(y-.014))),Vector((x,y+.014,BottomAt(y+.014)))]
    Sheet('VerticalSkirtSeamBacking',points,parent,.002)
    return BottomAt(bounds[-1])
