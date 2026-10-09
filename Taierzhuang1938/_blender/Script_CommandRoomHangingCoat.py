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
    u=i/NU;t=j/NV
    opening=CoatProfile(t,[(0,.10),(.17,.15),(.48,.09),(1,.17)])
    a=-math.pi/2+opening+u*(math.tau-2*opening)
    width=CoatProfile(t,[(0,.044),(.055,.082),(.16,.194),(.28,.244),(.55,.238),(1,.258)])
    depth=CoatProfile(t,[(0,.027),(.18,.078),(.4,.071),(1,.067)])
    # Narrow at the peg, with unequal long folds; no horizontal solver knots.
    fade=math.sin(min(1,t/.20)*math.pi/2)
    wave=(.020*math.sin(a*4+.55+t*.85)+.027*math.sin(a*9-.3-t*.8)
          +.007*math.sin(a*15+.8+t*.6))*fade
    x=width*math.cos(a)+wave*math.cos(a)*.42-.036*t+.014*math.sin(t*4)*t-.028*(1-t)**2
    y=depth*math.sin(a)+wave+.007*math.sin(a*3+t*2)*fade
    # Two long irregular garment panels; soft diagonal tension near the peg.
    y+=.007*math.sin(t*29+a*2)*math.exp(-((t-.22)/.16)**2)
    z=-1.23*t-.042*(1-math.sin(a))*.5*math.sin(math.pi*t)+.092*math.sin(a+.4)*t**7+.010*math.sin(a*7)*t**10+.008*math.cos(a)*(1-t)**4
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
    length=.59 if side>0 else .66
    for row in range(1,49):
        t=row/48;ring=[]
        axis=Vector((side*(.091*t+.020*math.sin(t*math.pi)),
                     -.078*t-.027*math.sin(t*math.pi),-length*t))
        radius=.084*(1-t)+.063*t
        for k,old in enumerate(boundary):
            source=verts[old]-center
            angle=math.atan2(source.z,source.y)
            # Flattened empty sleeve, with a shallow elbow crease and an open cuff.
            section=Vector((math.sin(angle)*radius,
                            math.cos(angle)*radius*.40,-.016*math.sin(angle+.7)))
            section.y+=.009*math.sin(angle*3+t*1.7)*math.sin(t*math.pi)
            section.y+=.007*math.sin(t*32+angle)*math.exp(-((t-.53)/.14)**2)
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
        a=-math.pi/2+.10+i/NU*(math.tau-.20)
        p=verts[k].copy()
        p+=Vector((math.cos(a)*.032*t,math.sin(a)*.025*t,
                   .024*math.sin(math.pi*t)-(.064+.018*math.sin(a+.7))*t*t))
        ring.append(len(verts));verts.append(p);uvs.append((i/NU*.30,-t*.075));wear.append(t**8*.65)
    faces.extend((previous[i],previous[i+1],ring[i+1],ring[i]) for i in range(NU))
    previous=ring
seams.append(previous)

used=sorted({k for f in faces for k in f});remap={old:new for new,old in enumerate(used)}
verts=[verts[k] for k in used];uvs=[uvs[k] for k in used];wear=[wear[k] for k in used]
faces=[tuple(remap[k] for k in f) for f in faces];seams=[[remap[k] for k in p] for p in seams]
turn=Matrix.Rotation(math.radians(-38),3,'Z')
localPoints=[turn@p for p in verts]
coaty=1.415-max(p.y for p in localPoints)
points=[p+Vector((coatx,coaty,coatTop)) for p in localPoints]
coat=Mesh('CoatLongGravityFolds',points,faces,cloth,uvs,True)
Recalculate(coat)
# Local surface relaxation softens armhole transitions without changing sewn
# lengths, the peg constraint or broad gravity folds. An unbounded cloth solve
# previously tangled the opening and lifted the hem by more than half a metre.
neighbors=[set() for p in points]
for face in faces:
    for a,b in zip(face,face[1:]+face[:1]):neighbors[a].add(b);neighbors[b].add(a)
boundary={k for path in seams for k in path}
for iteration in range(3):
    relaxed=[]
    for i,p in enumerate(points):
        if i in boundary or not neighbors[i]:relaxed.append(p);continue
        average=sum((points[j] for j in neighbors[i]),Vector())/len(neighbors[i])
        relaxed.append(p.lerp(average,.18))
    points=relaxed
for i,p in enumerate(points):coat.data.vertices[i].co=p
coat.data.update()
color=coat.data.color_attributes.new(name='GarmentWear',type='FLOAT_COLOR',domain='POINT')
for i,p in enumerate(verts):
    # Faded nap and rubbed edges, with faint low-frequency dye variation.
    uneven=noise.noise_vector(p*19+Vector((3,7,2)))[0]
    rubbed=wear[i]*(.62+.38*max(0,noise.noise_vector(p*155)[0]))
    fade=.76+.10*uneven+.23*rubbed
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
