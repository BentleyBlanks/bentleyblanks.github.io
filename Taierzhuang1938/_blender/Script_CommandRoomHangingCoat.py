"""Reference drape: an empty, side-hung wool coat with long gravity folds.

The former cloth cache tangled the front opening into a loop. This authored
sewn surface keeps material courses ordered, and bridges both sleeves into
real armholes. Broad folds are geometry; wear follows cuffs, seams and hem.
"""
import bmesh
from mathutils import noise

coatx=-.57;coatTop=2.73
NU=96;NV=100
verts=[];faces=[];uvs=[];seams=[];wear=[]

def CoatProfile(t,points):
    for (a,x),(b,y) in zip(points,points[1:]):
        if t<=b:
            q=max(0,min(1,(t-a)/(b-a)));q=q*q*(3-2*q)
            return x+(y-x)*q
    return points[-1][1]

def CoatBodyPoint(i,j):
    u=i/NU;t=j/NV;a=-math.pi/2+.045+u*(math.tau-.09)
    width=CoatProfile(t,[(0,.028),(.13,.13),(.25,.183),(.55,.193),(1,.213)])
    depth=CoatProfile(t,[(0,.021),(.18,.048),(.4,.043),(1,.046)])
    # Narrow at the peg, with unequal long folds; no horizontal solver knots.
    fade=math.sin(min(1,t/.20)*math.pi/2)
    wave=(.029*math.sin(a*5+.6+t*1.6)+.011*math.sin(a*9-.7-t*.75))*fade
    x=width*math.cos(a)+wave*math.cos(a)*.40-.028*t+.012*math.sin(t*5)*t
    y=depth*math.sin(a)+wave+.009*math.sin(a*3+t*2)*fade
    z=-1.285*t-.070*(1-math.sin(a))*.5*math.sin(math.pi*t)+.059*math.sin(a+.4)*t**7+.008*math.cos(a)*(1-t)**4
    return Vector((x,y,z))

def CoatId(i,j):return j*(NU+1)+i
for j in range(NV+1):
    for i in range(NU+1):
        u=i/NU;t=j/NV
        verts.append(CoatBodyPoint(i,j));uvs.append((u*1.06,t*1.285))
        edge=max(math.exp(-u*180),math.exp(-(1-u)*180),math.exp(-(1-t)*110))
        wear.append(edge)

# Holes are part of the torso topology; sleeves share their exact boundary.
holes=[(18,30,13,28),(66,78,13,28)]
for j in range(NV):
    for i in range(NU):
        if any(a<=i<b and c<=j<d for a,b,c,d in holes):continue
        faces.append((CoatId(i,j),CoatId(i,j+1),CoatId(i+1,j+1),CoatId(i+1,j)))
seams.extend([[CoatId(0,j) for j in range(NV+1)],
              [CoatId(NU,j) for j in range(NV+1)],
              [CoatId(i,NV) for i in range(NU+1)]])
cuffPaths=[]
for a,b,c,d in holes:
    boundary=([CoatId(i,c) for i in range(a,b)]+[CoatId(b,j) for j in range(c,d)]
             +[CoatId(i,d) for i in range(b,a,-1)]+[CoatId(a,j) for j in range(d,c,-1)])
    side=1 if a<NU/2 else -1
    center=sum((verts[k] for k in boundary),Vector())/len(boundary)
    count=len(boundary);previous=boundary
    length=.55 if side>0 else .63
    for row in range(1,49):
        t=row/48;ring=[]
        axis=Vector((side*(.083*t+.012*math.sin(t*math.pi)),
                     -.098*t-.021*math.sin(t*math.pi),-length*t))
        radius=.078*(1-t)+.054*t
        for k,old in enumerate(boundary):
            source=verts[old]-center
            angle=math.atan2(source.z,source.y)
            # Flattened empty sleeve, with a shallow elbow crease and an open cuff.
            section=Vector((math.sin(angle)*radius,
                            math.cos(angle)*radius*.34,-.016*math.sin(angle+.7)))
            section.y+=.005*math.sin(angle*3+t*1.7)*math.sin(t*math.pi)
            blend=min(1,t/.25);blend=blend*blend*(3-2*blend)
            p=center+axis+source.lerp(section,blend)
            ring.append(len(verts));verts.append(p);uvs.append((k/count*.39,1.5+t*length))
            wear.append(math.exp(-(1-t)*100))
        faces.extend((previous[k],ring[k],ring[(k+1)%count],previous[(k+1)%count]) for k in range(count))
        previous=ring
    cuffPaths.append(ring+[ring[0]]);seams.append(ring+[ring[0]])

# A soft rolled collar falls over the gathered neck, rather than a dangling loop.
neck=[CoatId(i,0) for i in range(NU+1)];previous=neck
for row in range(1,11):
    t=row/10;ring=[]
    for i,k in enumerate(neck):
        a=-math.pi/2+.045+i/NU*(math.tau-.09)
        p=verts[k].copy()
        p+=Vector((math.cos(a)*.041*t,math.sin(a)*.031*t,
                   .024*math.sin(math.pi*t)-(.064+.018*math.sin(a+.7))*t*t))
        ring.append(len(verts));verts.append(p);uvs.append((i/NU*.30,-t*.075));wear.append(t**8*.65)
    faces.extend((previous[i],previous[i+1],ring[i+1],ring[i]) for i in range(NU))
    previous=ring
seams.append(previous)

used=sorted({k for f in faces for k in f});remap={old:new for new,old in enumerate(used)}
verts=[verts[k] for k in used];uvs=[uvs[k] for k in used];wear=[wear[k] for k in used]
faces=[tuple(remap[k] for k in f) for f in faces];seams=[[remap[k] for k in p] for p in seams]
turn=Matrix.Rotation(math.radians(-45),3,'Z')
localPoints=[turn@p for p in verts]
coaty=1.415-max(p.y for p in localPoints)
points=[p+Vector((coatx,coaty,coatTop)) for p in localPoints]
coat=Mesh('CoatLongGravityFolds',points,faces,cloth,uvs,True)
Recalculate(coat)
restPoints=[p.copy() for p in points]
relaxPath=GAME/'_blender/Script_RelaxCommandRoomCoat.py'
exec(compile(relaxPath.read_text(encoding='utf-8'),str(relaxPath),'exec'),globals())
# Keep the gravity creases while guiding sleeves down. The transient solver
# motion otherwise swings one empty cuff sideways like a raised arm.
for i,(rest,p,uv) in enumerate(zip(restPoints,points,uvs)):
    if uv[1]<0:amount=.90
    elif uv[1]>=1.5:
        along=min(1,(uv[1]-1.5)/.16);amount=.55-.33*along
    else:amount=.55+.35*max(0,1-uv[1]/.12)
    points[i]=rest.lerp(p,amount);coat.data.vertices[i].co=points[i]
coat.data.update()
color=coat.data.color_attributes.new(name='GarmentWear',type='FLOAT_COLOR',domain='POINT')
for i,p in enumerate(verts):
    # Faded nap and rubbed edges, with faint low-frequency dye variation.
    uneven=noise.noise_vector(p*19+Vector((3,7,2)))[0]
    rubbed=wear[i]*(.62+.38*max(0,noise.noise_vector(p*155)[0]))
    fade=.63+.11*uneven+.38*rubbed
    color.data[i].color=(fade*.95,fade*.982,fade*1.04,1)
Shell(coat,.0022)

# Blender and the game both consume the same vertex-dye multiplier.
nodes=cloth.node_tree.nodes;links=cloth.node_tree.links
base=next(n for n in nodes if n.type=='TEX_IMAGE' and 'Base' in n.image.name)
attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='GarmentWear'
mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
links.new(base.outputs['Color'],mix.inputs[1]);links.new(attr.outputs['Color'],mix.inputs[2])
links.new(mix.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color'])

Cube('CoatRack',(coatx,1.405,coatTop-.009),(.48,.036,.072),wood,.006)
# Short wooden peg, hidden behind the collar except for its rounded tip.
Rod('CoatPeg',(coatx,1.39,coatTop-.020),(coatx,coaty-.002,coatTop+.014),.011,wood,20)
for x in [coatx-.18,coatx+.18]:
    Rod('CoatRackNail',(x,1.383,coatTop-.01),(x,1.389,coatTop-.01),.003,iron,16)
    Rod('CoatUnusedPeg',(x,1.39,coatTop-.022),(x,1.325,coatTop+.030),.010,wood,20)
for index,path in enumerate(seams):
    Curve('CoatBoundSeam',[points[k] for k in path],.00055 if index<3 else .00045,thread)

# Short, sparse broken fibres at exposed hems and cuffs, below silhouette scale.
rng=random.Random(19381007)
for path in seams[2:5]:
    for j in range(2,len(path)-2,5):
        if rng.random()>.52:continue
        p=points[path[j]];length=rng.uniform(.0013,.0045)
        Curve('CoatFrayedEdge',[p,p+Vector((rng.uniform(-.001,.001),-.001,-length*.6)),
              p+Vector((rng.uniform(-.002,.002),-.0015,-length))],.00012,thread)

frontPath=seams[0]
for t in [.30,.43,.56,.69]:
    j=int(t*(len(frontPath)-1));p=points[frontPath[j]]
    tangent=(points[frontPath[j+1]]-points[frontPath[j-1]]).normalized()
    across=(points[frontPath[j]+1]-p).normalized();normal=tangent.cross(across).normalized()
    Button('CoatHornButton',p+across*.01+normal*.002,.008,normal)
