"""Layered quiet courtyard seen through the existing window aperture."""
for ob in list(scene.objects):
    if ob.name.startswith(('DistantCourtyard','BareBranch')):bpy.data.objects.remove(ob,do_unlink=True)
Cube('CourtyardSky',(-2,13,4),(17,.15,10),outside,0)
courtyardWall=Material('CommandRoomCourtyardWall',(.42,.395,.33),.96)
roofMat=Material('CommandRoomRoofTile',(.11,.125,.13),.94)
roofEdge=Material('CommandRoomRoofEdge',(.17,.18,.17),.96)
Cube('CourtyardBoundary',(-2.8,5.8,.57),(6,.24,1.15),courtyardWall,.008)
for x in [-5.0,-3.05,-1.1]:Cube('CourtyardPier',(x,5.75,.64),(.25,.35,1.29),courtyardWall,.01)
for row,(x,y,width,depth,eave,ridge) in enumerate([(-2.9,7.0,3.2,1.6,1.27,2.03),(-.4,10.2,3.8,2.0,1.7,2.65)]):
    Cube('CourtyardHouse',(x,y+.3,eave*.5),(width,depth,eave),courtyardWall,.007)
    # Overlapping, bowed clay tile strips. Real depth preserves parallax.
    for side in [-1,1]:
        for col in range(int(width/.085)+2):
            xx=x-width/2+col*.085
            for course in range(5):
                verts=[];uv=[];faces=[]
                for j in range(3):
                    v=(course+j*.54)/5
                    yy=y+side*v*(depth/2+.14);zz=ridge+(eave-ridge)*v+.055*v*v+.008*(1-j/2)
                    for i in range(7):
                        u=i/6
                        verts.append((xx+(u-.5)*.090,yy,zz+.016*math.sin(math.pi*u)))
                        uv.append((u,v))
                for j in range(2):
                    for i in range(6):
                        a=j*7+i;faces.append((a,a+1,a+8,a+7) if side==1 else (a+7,a+8,a+1,a))
                # Each clay tile has its own overlapping end, not an endless flute.
                Mesh('CourtyardRoofTile',verts,faces,roofMat,uv,True)
    Rod('CourtyardRidge',(x-width*.52,y,ridge+.018),(x+width*.52,y,ridge+.018),.044,roofEdge,12)
    Cube('CourtyardWindow',(x-.33,y-depth/2-.009,eave*.60),(.39,.035,.45),iron,.002)
# A slightly off-centre trunk and unequal branch fans give a believable silhouette.
Curve('CourtyardTreeTrunk',[(-2.35,5.3,0),(-2.33,5.3,1.18),(-2.42,5.3,2.0),(-2.39,5.3,2.68)],.036,wood)
for point,direction,length,radius,depth in [((-2.36,5.3,1.5),(-.58,.07,.81),.75,.018,3),((-2.41,5.3,2.02),(.67,.02,.58),.78,.015,3),((-2.40,5.3,2.48),(-.30,0,.89),.54,.010,3)]:
    Branch(point,direction,length,radius,depth)
