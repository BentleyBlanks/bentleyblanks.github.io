"""Solid timber construction, rounded edge profiles and integral edge wear.

Executed in the room authoring context. There are no floating scratch/debris
meshes: small nicks remove material from the perimeter of the timber itself.
"""
from mathutils import noise

def Timber(name,loc,size,bevel=.014,seed=0):
    sx,sy,sz=size;verts=[];uv=[];faces=[];colors=[]
    # A seven-ring cross section includes the broad upper shoulder, edge face
    # and lower roundover. Extra samples along straight runs keep nicks local.
    profiles=[(-sz/2,bevel),(-sz/2+bevel*.3,bevel*.3),(-sz/2+bevel,0),
              (sz/2-bevel,0),(sz/2-bevel*.38,bevel*.20),
              (sz/2-bevel*.08,bevel*.62),(sz/2,bevel)]
    corners=[(1,1,0),(-1,1,math.pi/2),(-1,-1,math.pi),(1,-1,math.pi*1.5)]
    outline=[];cornerRadius=max(.017,bevel*1.6)
    for k,(cx,cy,a0) in enumerate(corners):
        center=Vector((cx*(sx/2-cornerRadius),cy*(sy/2-cornerRadius)))
        arc=[center+Vector((math.cos(a0+j*math.pi/16),math.sin(a0+j*math.pi/16)))*cornerRadius for j in range(9)]
        outline.extend(arc)
        nx,ny,na=corners[(k+1)%4]
        nxt=Vector((nx*(sx/2-cornerRadius),ny*(sy/2-cornerRadius)))+Vector((math.cos(na),math.sin(na)))*cornerRadius
        steps=max(4,int((nxt-arc[-1]).length/.025))
        outline.extend(arc[-1].lerp(nxt,j/steps) for j in range(1,steps))
    count=len(outline)
    for ring,(z,inset) in enumerate(profiles):
        for i,q in enumerate(outline):
            outward=Vector((q.x/(sx/2),q.y/(sy/2),0)).normalized()
            # Sparse softened impacts cut INTO a chamfer, never white chips.
            n=noise.noise_vector(Vector((q.x*17+seed,q.y*23-seed,seed*.71)))[0]
            nick=max(0,n-.21)**2*.073
            shoulder=(.22,.25,.45,.85,1,1,.8)[ring]
            p=Vector((q.x,q.y,z))-outward*(inset+nick*shoulder)
            p.z-=nick*.4*max(0,ring-3)/3
            verts.append(tuple(p+Vector(loc)));uv.append((p.y/1.4+seed*.173,p.x/1.4+seed*.219))
            wear=(.91,.98,1.02,1.09,1.25,1.27,1.06)[ring]+n*.10
            colors.append((wear,wear*.987,wear*.955,1))
    for j in range(len(profiles)-1):
        for i in range(count):faces.append((j*count+i,j*count+(i+1)%count,(j+1)*count+(i+1)%count,(j+1)*count+i))
    faces.extend([tuple(reversed(range(count))),tuple((len(profiles)-1)*count+i for i in range(count))])
    ob=Mesh(name,verts,faces,wood,uv,True)
    # Edge grain is physically projected instead of stretched from the top.
    uvLayer=ob.data.uv_layers.active
    for poly in ob.data.polygons:
        if abs(poly.normal.z)>.85:continue
        for li in poly.loop_indices:
            co=ob.data.vertices[ob.data.loops[li].vertex_index].co-Vector(loc)
            uvLayer.data[li].uv=(co.z/1.4+seed*.173,(co.x if abs(poly.normal.y)>.5 else co.y)/1.4+seed*.219)
    attr=ob.data.color_attributes.new(name='TimberWear',type='FLOAT_COLOR',domain='POINT')
    for i,c in enumerate(colors):attr.data[i].color=c
    bpy.context.view_layer.objects.active=ob
    m=ob.modifiers.new('Flat board and rounded shoulders','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=35
    bpy.ops.object.modifier_apply(modifier=m.name)
    return ob

tx=.250;ty=.462;tz=.84;tw=3.10;td=2.30
for i in range(5):
    Timber('TablePlank',(tx,ty+(i-2)*td/5,tz),(tw,td/5-.004,.09),.014,i+2)
for x in [tx-tw/2+.12,tx+tw/2-.12]:
    for y in [ty-td/2+.13,ty+td/2-.13]:
        leg=Cube('TableLeg',(x,y,.405),(.145,.145,.81),wood,.017)
        for v in leg.data.vertices:
            taper=.78+.22*(v.co.z+.405)/.81;v.co.x*=taper;v.co.y*=taper
        # Flush joinery pegs, dark old end grain, not decorative metal studs.
        Rod('TableJoineryPeg',(x,y-.073,.737),(x,y-.074,.737),.008,wood,16)
for y in [ty-td/2+.12,ty+td/2-.12]:
    Cube('TableLongApron',(tx,y,.697),(tw-.17,.075,.2),wood,.014)
    Cube('TableApronLowerLip',(tx,y-.006,.605),(tw-.22,.080,.025),wood,.009)
for x in [tx-tw/2+.15,tx+tw/2-.15]:Cube('TableShortApron',(x,ty,.697),(.08,td-.24,.2),wood,.012)

# Small utilitarian cabinet: structural stiles, real recessed drawers, a
# stepped solid timber top and restrained curved iron pulls.
cabx=-1.33;caby=1.03
Cube('CabinetCarcass',(cabx,caby+.014,.68),(.86,.49,1.27),wood,.014)
Timber('CabinetTop',(cabx,caby,1.363),(1.08,.66,.082),.020,12)
Cube('CabinetTopUnderLip',(cabx,caby,1.307),(1.015,.602,.034),wood,.010)
Cube('CabinetBasePlinth',(cabx,caby,.105),(1.00,.60,.075),wood,.016)
for side in [-1,1]:
    Cube('CabinetFrontStile',(cabx+side*.433,caby-.280,.707),(.073,.080,1.23),wood,.014)
    Cube('CabinetFoot',(cabx+side*.398,caby-.19,.049),(.13,.32,.095),wood,.012)
    Cube('CabinetSideInset',(cabx+side*.439,caby+.018,.728),(.022,.338,.96),wood,.008)
for z in [1.147,.856,.565,.274]:
    Cube('CabinetDrawerRecess',(cabx,caby-.269,z),(.777,.035,.262),wood,.012)
    # Frame surrounds a center panel sitting 12 mm further back.
    Cube('CabinetDrawerCenter',(cabx,caby-.302,z),(.628,.028,.157),wood,.010)
    for side in [-1,1]:
        Cube('CabinetDrawerStile',(cabx+side*.354,caby-.316,z),(.068,.048,.249),wood,.010)
        Cube('CabinetDrawerRail',(cabx,caby-.316,z+side*.100),(.68,.048,.052),wood,.010)
    for dx in [-.059,.059]:
        Rod('CabinetPullRosette',(cabx+dx,caby-.342,z+.006),(cabx+dx,caby-.349,z+.006),.017,iron,24)
        Rod('CabinetPullMount',(cabx+dx,caby-.350,z+.006),(cabx+dx,caby-.379,z-.004),.007,iron,12)
    Curve('CabinetIronBail',[(cabx+.059*math.cos(i/24*math.pi),caby-.382,z+.006-.041*math.sin(i/24*math.pi)) for i in range(25)],.006,iron)
