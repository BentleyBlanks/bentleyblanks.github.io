"""External belly details from same-car photographs, with inferred metre layout.

The small bolt heads exist in High and project onto the Game floor. Larger
joining straps and cover plates retain their silhouettes in both qualities.
No unseen engine, interior or factory drawing dimensions are implied.
"""
from mathutils import Vector


def BuildUnderfloor(quality,hull,settings,armor,Node,Mesh,HexBolt):
    data=settings['underfloor'];slope=(.60-.44)/(1.69+1.74)
    normal=Vector((0,slope,-1)).normalized()
    unit=Node('Node_UnderfloorDetail',parent=hull,geometryRole='external belly joints and inspection cover rest assembly',constructionEvidence='Same-car photographs35/36; external details only; metre layout, exact fastener count and cover dimensions inferred')
    def Floor(y):return .44+(y+1.74)*slope
    def Plate(name,x,y,width,length,depth):
        points=[]
        for offset in [-.0002,depth]:
            for px,py in [(x-width/2,y-length/2),(x+width/2,y-length/2),(x+width/2,y+length/2),(x-width/2,y+length/2)]:
                points.append((px,py,Floor(py)-offset))
        # The inward face is buried in the existing lower hull. Keep its
        # exterior cap and all four edge faces, including both ends.
        faces=[(4,7,6,5),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        obj=Mesh(name,points,faces,armor,unit,.0007 if quality=='High'else 0)
        cap=obj.data.polygons[0]
        assert cap.normal.dot(normal)>.999,(name,tuple(cap.normal))
        return obj
    def Head(x,y,depth=0):
        HexBolt((x,y,Floor(y)-depth),normal,unit,data['boltRadiusM'],data['boltDepthM'],armor)
    Plate('BellyLongitudinalJoiningStrap',0,data['strapCenterY'],data['strapWidthM'],data['strapLengthM'],data['strapDepthM'])
    for y in data['transverseJointY']:
        for side in [-1,1]:Plate('BellyTransverseJoiningStrip',side*.335,y,.620,data['jointWidthM'],data['jointDepthM'])
    for i,cover in enumerate(data['accessCovers']):
        Plate('BellyInspectionCover%02d'%(i+1),*cover,data['coverDepthM'])
    if quality=='High':
        for y in data['perimeterBoltY']:
            for x in [-.620,.620]:Head(x,y)
            for x in [-data['strapWidthM']*.24,data['strapWidthM']*.24]:Head(x,y,data['strapDepthM'])
        for y in data['transverseJointY']:
            for x in data['crossJointBoltX']:Head(x,y,data['jointDepthM'])
        for x,y,width,length in data['accessCovers']:
            for dx in [-width*.38,0,width*.38]:
                for dy in [-length*.39,length*.39]:Head(x+dx,y+dy,data['coverDepthM'])
    unit['smallFastenersHighOnly']=True
    unit['fastenerCountFactoryVerified']=False
    return unit
