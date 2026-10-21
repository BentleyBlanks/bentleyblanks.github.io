"""Reference-led lower cannon, carpus/hock, fetlock, pastern and single hoof.

Replace the donor's furry bell-shaped feet. Each leg remains connected to the
original upper skin; horn wall and concave sole are real editable surfaces.
"""
import bpy,bmesh,math,json,random,heapq
from mathutils import Vector
from mathutils.noise import noise

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def ProfileValue(profiles,z,column):
    """Shape-preserving Hermite sampling rounds joints without overshoot."""
    xs=[row[0] for row in profiles];ys=[row[column] for row in profiles]
    slopes=[(b-a)/(xb-xa) for a,b,xa,xb in zip(ys,ys[1:],xs,xs[1:])]
    tangents=[slopes[0]]
    for left,right in zip(slopes,slopes[1:]):
        tangents.append(0 if left*right<=0 else 2*left*right/(left+right))
    tangents.append(slopes[-1])
    index=next((i for i in range(len(xs)-1) if xs[i]<=z<=xs[i+1]),len(xs)-2)
    span=xs[index+1]-xs[index];t=(z-xs[index])/span
    return ((2*t**3-3*t*t+1)*ys[index]+(t**3-2*t*t+t)*span*tangents[index]
        +(-2*t**3+3*t*t)*ys[index+1]+(t**3-t*t)*span*tangents[index+1])

def HornMaterial():
    mat=bpy.data.materials.get('DonkeyHoofHorn') or bpy.data.materials.new('DonkeyHoofHorn');mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');links.new(shader.outputs[0],out.inputs[0])
    shader.inputs['Roughness'].default_value=.80;shader.inputs['Specular IOR Level'].default_value=.24
    coord=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(500,500,14)
    links.new(coord.outputs['Object'],stretch.inputs[0]);noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=3
    links.new(stretch.outputs[0],noise.inputs['Vector']);ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=(.045,.043,.036,1)
    ramp.color_ramp.elements[1].position=.86;ramp.color_ramp.elements[1].color=(.145,.132,.108,1)
    links.new(noise.outputs['Fac'],ramp.inputs[0])
    dirt=nodes.new('ShaderNodeTexNoise');dirt.inputs['Scale'].default_value=95;dirt.inputs['Detail'].default_value=2
    links.new(coord.outputs['Object'],dirt.inputs['Vector'])
    dirtRamp=nodes.new('ShaderNodeValToRGB');dirtRamp.color_ramp.elements[0].position=.36;dirtRamp.color_ramp.elements[0].color=(.32,.29,.23,1)
    dirtRamp.color_ramp.elements[1].position=.68;dirtRamp.color_ramp.elements[1].color=(1,1,1,1)
    links.new(dirt.outputs['Fac'],dirtRamp.inputs[0])
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=.62
    links.new(ramp.outputs['Color'],multiply.inputs[1]);links.new(dirtRamp.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coord.outputs['Object'],separate.inputs[0])
    phase=nodes.new('ShaderNodeMath');phase.operation='MULTIPLY';phase.inputs[1].default_value=2*math.pi*210;links.new(separate.outputs['Z'],phase.inputs[0])
    wave=nodes.new('ShaderNodeMath');wave.operation='SINE';links.new(phase.outputs[0],wave.inputs[0])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.00035
    links.new(wave.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    grain=nodes.new('ShaderNodeBump');grain.inputs['Strength'].default_value=.20;grain.inputs['Distance'].default_value=.00035
    links.new(noise.outputs['Fac'],grain.inputs['Height']);links.new(bump.outputs['Normal'],grain.inputs['Normal']);links.new(grain.outputs['Normal'],shader.inputs['Normal'])
    return mat

def RebuildLowerLegs(skin,rig,coat):
    cutZ=.54;sections=24;rng=random.Random(19381021)
    lower=coat.copy();lower.name='DonkeyLowerLegShortFur'
    for node in list(lower.node_tree.nodes):
        if node.type=='NORMAL_MAP' or (node.type=='TEX_IMAGE' and node.image and node.image.colorspace_settings.name=='Non-Color'):lower.node_tree.nodes.remove(node)
    horn=HornMaterial()
    sole=bpy.data.materials.get('DonkeyHoofSole') or bpy.data.materials.new('DonkeyHoofSole');sole.use_nodes=True
    sole.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.072,.065,.053,1);sole.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
    indices=[]
    for mat in (lower,horn,sole):skin.data.materials.append(mat);indices.append(len(skin.data.materials)-1)
    lowerIndex,hornIndex,soleIndex=indices
    bm=bmesh.new();bm.from_mesh(skin.data)
    surface=bm.verts.layers.int.get('FootSurface') or bm.verts.layers.int.new('FootSurface')
    owner=bm.verts.layers.int.get('FootOwner') or bm.verts.layers.int.new('FootOwner')
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,cutZ),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
    boundary=[edge for edge in bm.edges if edge.is_boundary and all(abs(v.co.z-cutZ)<1e-5 for v in edge.verts)]
    remaining=set(vertex for edge in boundary for vertex in edge.verts);loops=[]
    while remaining:
        seed=next(iter(remaining));stack=[seed];component=set()
        while stack:
            vertex=stack.pop()
            if vertex in component:continue
            component.add(vertex)
            stack.extend(other for edge in vertex.link_edges if edge in boundary for other in edge.verts if other!=vertex)
        remaining-=component;loops.append(list(component))
    if len(loops)!=4:raise RuntimeError('Expected four leg cut loops, found '+str(len(loops)))
    origins={bone.name:bone.head_local.copy() for bone in rig.data.bones}
    profiles=[
        (.0004,.040,.055,.050),(.005,.041,.055,.050),(.018,.0385,.051,.047),
        (.040,.034,.042,.040),(.060,.0295,.034,.035),(.067,.0295,.033,.033),
        (.075,.030,.032,.029),(.095,.0275,.028,.021),(.120,.027,.027,.010),
        (.140,.033,.032,.001),(.157,.036,.036,-.004),(.176,.0315,.032,-.006),
        (.203,.023,.025,-.004),(.245,.0205,.023,0),(.300,.020,.022,0),
        (.360,.021,.024,0),(.410,.023,.028,0),(.442,.028,.034,0),
        (.466,.034,.040,0),(.485,.034,.039,0),(.506,.030,.034,0),(.527,.030,.032,0)]
    heights=[.0004,.005,.018,.035,.050,.061,.067,.075,.095,.120,.132,.145,.157,.170,.183,.203,.225,.255,.300,.360,.410,.430,.449,.466,.479,.492,.510,.527]
    profiles=[(z,*[ProfileValue(profiles,z,column) for column in (1,2,3)]) for z in heights]
    records=[]
    for loop in loops:
        centre=sum((v.co for v in loop),Vector())/len(loop)
        front=centre.y>.30;side='Left' if centre.x<0 else 'Right';stem='Donkey'+('Front' if front else 'Rear')+side
        joint=origins[stem+'HoofPivot'];knee=origins[stem+'KneePivot'];elbow=origins[stem+'ElbowPivot']
        ownerId=1+['FrontLeft','FrontRight','RearLeft','RearRight'].index(('Front' if front else 'Rear')+side)
        for vertex in loop:vertex[surface]=1;vertex[owner]=ownerId
        loop.sort(key=lambda vertex:math.atan2(vertex.co.x-centre.x,vertex.co.y-centre.y)%(2*math.pi))
        rings=[]
        for z,rx,ry,yOffset in profiles:
            if not front:
                if .44<z<.50:ry*=1.15
                if z<.075:rx*=.93
            if z<=joint.z:cy=joint.y+yOffset
            elif z<=knee.z:cy=joint.y+(knee.y-joint.y)*(z-joint.z)/(knee.z-joint.z)+yOffset
            else:cy=knee.y+(elbow.y-knee.y)*(z-knee.z)/(elbow.z-knee.z)+yOffset
            blend=Smooth(.49,cutZ,z);cy=cy*(1-blend)+centre.y*blend
            cx=joint.x+(knee.x-joint.x)*max(0,min(1,(z-joint.z)/(knee.z-joint.z)))
            cx=cx*(1-blend)+centre.x*blend
            ring=[]
            for j in range(sections):
                theta=2*math.pi*j/sections;cs,sn=math.cos(theta),math.sin(theta)
                hornBand=z<=.067
                xx=rx*sn*(.90+.10*cs if hornBand else 1)
                yy=ry*(cs if not hornBand or cs>=0 else cs*.70)
                if hornBand and cs<-.60:yy+=.006*math.exp(-(sn/.27)**2)
                if .12<z<.19 and cs<0:yy-=.005*(-cs)*math.sin(math.pi*min(1,max(0,(z-.12)/.07)))
                if .21<z<.44:
                    tendon=.0012*math.exp(-((abs(theta-math.pi)-.40)/.23)**2)
                    yy-=tendon
                    crest=.0014*math.exp(-((abs(math.atan2(sn,cs))-.54)/.24)**2)
                    yy+=crest;xx+=crest*sn*.35
                relief=(.0007*math.sin(theta*3+z*31)+.00035*math.sin(theta*7-z*63))*Smooth(.075,.18,z)
                xx+=sn*relief;yy+=cs*relief
                zz=z+.0045*cs*Smooth(.035,.060,z)*(1-Smooth(.074,.100,z))
                # Hair meets the coronet along a shallow irregular edge.
                zz+=.0020*(math.sin(theta*7+.8)+.35*math.sin(theta*11))*Smooth(.050,.067,z)*(1-Smooth(.075,.095,z))
                vertex=bm.verts.new((cx+xx,cy+yy,zz));vertex[surface]=1;vertex[owner]=ownerId;ring.append(vertex)
            rings.append(ring)
        for row in range(1,len(rings)):
            for j in range(sections):
                face=bm.faces.new((rings[row-1][j],rings[row-1][(j+1)%sections],rings[row][(j+1)%sections],rings[row][j]))
                face.material_index=hornIndex if profiles[row][0]<=.067 else lowerIndex;face.smooth=True
        # A raised sole bowl leaves the real rim as the only standing contact.
        inner=[]
        baseCentre=sum((v.co for v in rings[0]),Vector())/sections
        for vertex in rings[0]:
            p=baseCentre+(vertex.co-baseCentre)*.72;p.z=.0045
            item=bm.verts.new(p);item[surface]=1;item[owner]=rings[0][0][owner];inner.append(item)
        soleCentre=bm.verts.new((baseCentre.x,baseCentre.y,.007));soleCentre[surface]=1;soleCentre[owner]=rings[0][0][owner]
        for j in range(sections):
            face=bm.faces.new((rings[0][j],inner[j],inner[(j+1)%sections],rings[0][(j+1)%sections]));face.material_index=soleIndex
            face=bm.faces.new((inner[j],soleCentre,inner[(j+1)%sections]));face.material_index=soleIndex
        # Bridge a donor cut loop of any valence to the measured new section.
        upper=rings[-1];i=j=0;n=len(loop)
        while i<n or j<sections:
            if j>=sections or (i<n and (i+1)/n<(j+1)/sections):
                vertices=(loop[i%n],loop[(i+1)%n],upper[j%sections]);i+=1
            else:vertices=(loop[i%n],upper[(j+1)%sections],upper[j%sections]);j+=1
            face=bm.faces.new(vertices);face.material_index=lowerIndex;face.smooth=True
        # Sparse short feathering behind the fetlock, with roots inside the
        # real skin. Closed triangular tufts retain shape in the PBR batch.
        for tuft in range(24):
            theta=math.pi+rng.uniform(-.85,.85);z=rng.uniform(.118,.157)
            cy=joint.y+ProfileValue(profiles,z,3)
            rx=ProfileValue(profiles,z,1);ry=ProfileValue(profiles,z,2)
            normal=Vector((math.sin(theta),math.cos(theta),0))
            root=Vector((joint.x+rx*math.sin(theta),cy+ry*math.cos(theta)-.002,z))-normal*.0015
            tangent=Vector((math.cos(theta),-math.sin(theta),0));width=rng.uniform(.0004,.0009)
            axis=Vector((normal.x*.18,normal.y*.32,-1)).normalized()
            across=axis.cross(tangent).normalized();ring=[]
            for angle in (0,2*math.pi/3,4*math.pi/3):
                point=root+width*(math.cos(angle)*tangent+math.sin(angle)*across)
                vertex=bm.verts.new(point);vertex[surface]=1;vertex[owner]=rings[0][0][owner];ring.append(vertex)
            tip=bm.verts.new(root+axis*rng.uniform(.007,.016));tip[surface]=1;tip[owner]=rings[0][0][owner]
            for j in range(3):
                face=bm.faces.new((ring[j],ring[(j+1)%3],tip));face.material_index=lowerIndex;face.smooth=True
            face=bm.faces.new(tuple(reversed(ring)));face.material_index=lowerIndex
        records.append({'leg':stem,'cutVertices':n,'sections':sections,'hoofHeightM':.067,'hoofWidthM':.080 if front else .0744,'hoofLengthM':.0935})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update()
    colors=skin.data.color_attributes.get('CoatColor');tag=skin.data.attributes['FootSurface']
    for vertex in skin.data.vertices:
        if tag.data[vertex.index].value:
            stem='Donkey'+['FrontLeft','FrontRight','RearLeft','RearRight'][skin.data.attributes['FootOwner'].data[vertex.index].value-1]
            centre=origins[stem+'HoofPivot'];knee=origins[stem+'KneePivot']
            frontFacing=max(0,min(1,(vertex.co.y-centre.y)/.025))
            crest=math.exp(-((vertex.co.x-centre.x)/.016)**2)*frontFacing
            bonePatch=math.exp(-((vertex.co.z-knee.z)/.043)**2)+.70*math.exp(-((vertex.co.z-.155)/.042)**2)
            patch=noise(vertex.co*38)+.45*noise(vertex.co*97)
            shade=.039+.013*patch+.014*crest+.018*bonePatch*(.45+.55*crest)
            colors.data[vertex.index].color=(shade,shade*.96,shade*.89,1)
    skin['footConstruction']='continuous measured lower legs; separate single-toe horn wall, coronet and concave sole'
    skin['footProfileJson']=json.dumps(records)
    print(json.dumps({'rebuiltFeet':records,'skinVertices':len(skin.data.vertices)}))
    return records

def BindLowerLegs(skin,rig):
    owners=skin.data.attributes.get('FootOwner')
    if owners is None:return
    stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']
    # Blend by distance along the connected skin, rather than a spatial mask
    # that would leave abrupt weight steps across adjacent upper-arm vertices.
    adjacency=[[] for vertex in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;length=(skin.data.vertices[a].co-skin.data.vertices[b].co).length
        adjacency[a].append((b,length));adjacency[b].append((a,length))
    distances=[math.inf]*len(adjacency);nearest=[0]*len(adjacency);queue=[]
    for vertex in skin.data.vertices:
        value=owners.data[vertex.index].value
        if value:
            distances[vertex.index]=0;nearest[vertex.index]=value;heapq.heappush(queue,(0,vertex.index,value))
    while queue:
        distance,index,value=heapq.heappop(queue)
        if distance>distances[index] or distance>=.24:continue
        for other,length in adjacency[index]:
            candidate=distance+length
            if candidate<distances[other] and candidate<.24:
                distances[other]=candidate;nearest[other]=value;heapq.heappush(queue,(candidate,other,value))
    for vertex in skin.data.vertices:
        value=owners.data[vertex.index].value
        existing={skin.vertex_groups[item.group].name:item.weight for item in vertex.groups if item.weight>1e-8}
        blend=1
        if value:
            stem=stems[value-1]
        else:
            if not nearest[vertex.index]:continue
            stem=stems[nearest[vertex.index]-1]
            blend=1-Smooth(.06,.24,distances[vertex.index])
        jointZ=rig.data.bones[stem+'KneePivot'].head_local.z
        foot=1-Smooth(.17,.24,vertex.co.z)
        upper=Smooth(jointZ-.035,jointZ+.040,vertex.co.z)
        row={stem+'HoofPivot':foot,stem+'KneePivot':(1-foot)*(1-upper),stem+'ElbowPivot':(1-foot)*upper}
        if vertex.co.z>.54:
            shoulder=Smooth(rig.data.bones[stem+'ElbowPivot'].head_local.z-.055,rig.data.bones[stem+'ElbowPivot'].head_local.z+.055,vertex.co.z)
            row={stem+'ElbowPivot':1-shoulder,stem+'Pivot':shoulder}
        row={name:existing.get(name,0)*(1-blend)+row.get(name,0)*blend for name in set(existing)|set(row)}
        row=dict(sorted(row.items(),key=lambda item:-item[1])[:4]);total=sum(row.values())
        for item in list(vertex.groups):skin.vertex_groups[item.group].remove([vertex.index])
        for name,weight in row.items():
            if weight<1e-8:continue
            group=skin.vertex_groups.get(name) or skin.vertex_groups.new(name=name);group.add([vertex.index],weight/total,'REPLACE')
