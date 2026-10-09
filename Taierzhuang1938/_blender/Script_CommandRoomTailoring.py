"""Reference-driven cap, tailored coat and thick amber ink bottle.
Executed by the command-room authoring script; dimensions are metres.
"""
from mathutils import noise

def SmoothProfile(t, stops):
    for i in range(len(stops)-1):
        a,x=stops[i];b,y=stops[i+1]
        if t<=b:
            f=max(0,min(1,(t-a)/(b-a)));f=f*f*(3-2*f)
            return x+(y-x)*f
    return stops[-1][1]

def AngleDistance(a,b):return (a-b+math.pi)%math.tau-math.pi

def Ridge(x,w):
    # A compressed cloth crease: narrow raised ridge and adjacent shallow valley.
    return math.exp(-(x/w)**2)-.48*math.exp(-((x-w*1.4)/(w*1.5))**2)

# Bottle follows the square body / circular neck proportions of the turnaround.
ix,iy,iz=physical['inkBottle']['position']
glass=inkGlass.node_tree.nodes.get('Principled BSDF')
glass.inputs['Base Color'].default_value=(.62,.29,.065,1)
glass.inputs['Roughness'].default_value=.16
glass.inputs['IOR'].default_value=1.51
glass.inputs['Transmission Weight'].default_value=.92
glass.inputs['Specular IOR Level'].default_value=.5
inkGlass.diffuse_color=(.62,.29,.065,1)
inkLiquid=Material('CommandRoomInkLiquid',(.003,.002,.001),.14)
lidMat=Material('CommandRoomInkLid',(.037,.025,.015),.39)
labelMat=Material('CommandRoomInkLabel',(.56,.44,.29),.97,'CommandRoomInkLabel',True)
profiles=[(0,.022,4),(.001,.027,4.8),(.003,.0295,5),(.006,.030,5),
 (.039,.030,5),(.043,.0285,4.5),(.046,.026,4),(.049,.020,2.7),
 (.051,.0165,2),(.054,.0165,2),(.055,.020,2),(.058,.020,2),(.059,.017,2)]
def BottleRing(z,r,power):
    return [(ix+r*math.copysign(abs(math.cos(i/96*math.tau))**(2/power),math.cos(i/96*math.tau)),
             iy+r*math.copysign(abs(math.sin(i/96*math.tau))**(2/power),math.sin(i/96*math.tau)),iz+z) for i in range(97)]
# Closed shell with an inner cavity and a real 3 mm glass foot.
inner=[(z,max(.001,r-.0018),p) for z,r,p in reversed(profiles[3:])]
inner.extend([(.004,.026,5),(.004,0,2)])
allProfiles=profiles+inner
verts=[p for z,r,power in allProfiles for p in BottleRing(z,r,power)]
uv=[(i/96,z*12) for z,r,power in allProfiles for i in range(97)]
faces=[(j*97+i,j*97+i+1,(j+1)*97+i+1,(j+1)*97+i) for j in range(len(allProfiles)-1) for i in range(96)]
faces.append(tuple(reversed(range(96))))
Mesh('InkBottleGlass',verts,faces,inkGlass,uv,True)
liquid=Cube('InkBottleLiquid',(ix,iy,iz+.022),(.055,.055,.034),inkLiquid,.005)
def Lid(u,v):
    a=u*math.tau
    r=.0188+.0008*math.sin(v*math.pi)**.3+.00032*math.cos(a*64)*math.sin(v*math.pi)**.2
    return (ix+r*math.cos(a),iy+r*math.sin(a),iz+.058+.013*v)
Surface('InkBottleLid',256,8,Lid,lidMat)
Surface('InkBottleLidTop',96,8,lambda u,v:(ix+.0188*(1-v)*math.cos(u*math.tau),iy+.0188*(1-v)*math.sin(u*math.tau),iz+.071+.0004*math.sin(v*math.pi/2)),lidMat)
for z in [.0588,.0702]:
    Curve('InkBottleLidLip',[(ix+.0194*math.cos(i/96*math.tau),iy+.0194*math.sin(i/96*math.tau),iz+z) for i in range(97)],.00025,lidMat)
def Label(u,v):
    x=(u-.5)*.045+.00035*math.sin(v*57)*(abs(u-.5)*2)**12
    z=.011+v*.028+.00025*math.sin(u*89)*(abs(v-.5)*2)**12
    # Conform to the fifth-power rounded square, including the curved corners.
    y=-.030*(1-(abs(x)/.030)**5)**.2-.00015
    return (ix+x,iy+y,iz+z)
Surface('InkBottleLabel',48,24,Label,labelMat,lambda u,v:(.022+.956*u,.025+.95*v))

drapePath=GAME/'_blender/Script_CommandRoomDrape.py'
exec(compile(drapePath.read_text(encoding='utf-8'),str(drapePath),'exec'),globals())

# Diffuse wear is stored in vertex colour, independent of light/shadow baking.
# This gives each panel broad irregular fading without repeating painted folds.
for ob in list(scene.objects):
    if ob.type!='MESH' or not ob.name.startswith(('Cap','Coat')) or ob.data.materials[0] not in (cloth,capCloth):continue
    # The coat already has a seam-aware dye layer used by both Blender and glTF.
    if ob.data.color_attributes.get('GarmentWear'):continue
    colors=ob.data.color_attributes.new(name='ClothWear',type='FLOAT_COLOR',domain='POINT')
    # Exposed fold ridges lose dye through rubbing. This belongs to albedo,
    # whereas directional shadow is kept exclusively in the lightmap.
    neighbors=[[] for v in ob.data.vertices]
    for e in ob.data.edges:
        a,b=e.vertices;neighbors[a].append(b);neighbors[b].append(a)
    for v in ob.data.vertices:
        p=ob.matrix_world@v.co
        n=noise.multi_fractal(p*19,1.0,2.1,3)
        small=noise.noise_vector(p*155)[0]
        adjoining=neighbors[v.index]
        curvature=0
        if adjoining:
            deltas=[v.co-ob.data.vertices[i].co for i in adjoining]
            edge2=sum(d.length_squared for d in deltas)/len(deltas)
            curvature=sum(d.dot(v.normal) for d in deltas)/len(deltas)/max(.000001,edge2)
        fade=.82+.34*n+.04*small+.17*max(0,math.tanh(curvature*.012))
        colors.data[v.index].color=(fade,fade,fade,1)
