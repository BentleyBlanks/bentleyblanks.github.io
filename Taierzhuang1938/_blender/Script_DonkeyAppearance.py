"""Reference-led V2 refinement of the bare donkey; no cart or gait edits."""
import bpy,math,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Shape(point):
    p=point.copy();x,y,z=point
    # More upright poll and a longer muzzle, blended continuously into the neck.
    head=Smooth(.74,1.02,y)*Smooth(.84,1.10,z)
    muzzle=Smooth(1.09,1.23,y)*(1-Smooth(1.12,1.27,z))
    p.y+=-.035*head+.077*muzzle
    p.z+=.055*head-.010*muzzle
    # Restore the rounded belly below the lean rib cage; keep limb joints fixed.
    belly=math.exp(-((y-.25)/.29)**4)*(1-Smooth(.66,.90,z))*Smooth(.53,.59,z)
    p.z-=.043*belly
    p.x*=1+.10*math.exp(-((y-.27)/.35)**4)*Smooth(.55,.70,z)*(1-Smooth(.88,1.04,z))
    # Recess the abrupt front-of-chest block into a continuous brisket.
    brisket=Smooth(.67,.77,y)*(1-Smooth(.84,.94,y))*Smooth(.63,.78,z)*(1-Smooth(.94,1.04,z))
    p.y-=.035*brisket
    p.x*=1-.10*brisket
    return p

def CoatColor(point,row=None):
    x,y,z=point;row=row or {}
    leg=sum(w for name,w in row.items() if name.startswith(('DonkeyFront','DonkeyRear')))
    base=Vector((.042,.040,.035));light=Vector((.235,.225,.202))
    along=max(0,min(1,(y+.16)/.84))
    bellyLine=.63+.08*math.sin(math.pi*along)
    belly=(1-Smooth(bellyLine-.025,bellyLine+.065,z))*Smooth(-.28,-.12,y)*(1-Smooth(.61,.74,y))*Smooth(.50,.62,z)
    belly*=1-Smooth(.40,.90,leg)
    muzzle=Smooth(1.17,1.29,y)*(1-Smooth(1.09,1.21,z))
    throat=math.exp(-((y-1.02)/.15)**2-((z-.99)/.09)**2)*.10
    mask=max(belly,muzzle,throat)
    color=base.lerp(light,mask)
    # Quiet longitudinal flank variation, no large mottled paint islands.
    variation=1+.035*math.sin(y*17+z*8)+.018*math.sin(y*43-z*14)
    return (*[v*variation for v in color],1)

def RefineLegContours(skin):
    # One continuous spatial field avoids folds where heat weights overlap.
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        thigh=(1-Smooth(.10,.28,y))*Smooth(.28,.48,z)*(1-Smooth(.79,.93,z))
        vertex.co.y+=.052*math.exp(-((z-.65)/.16)**2)*thigh
    skin.data.update()

def RefineTail(tail):
    controls=[Vector(v) for v in ((0,-.13,.99),(.004,-.22,.91),(.008,-.28,.80),(.010,-.29,.65),(.010,-.29,.49),(.010,-.30,.38))]
    vertices=[];faces=[];rings=16;sides=8
    for i in range(rings):
        t=i/(rings-1);position=t*(len(controls)-1);j=min(len(controls)-2,int(position));u=position-j
        a,b,c,d=[controls[max(0,min(len(controls)-1,k))] for k in (j-1,j,j+1,j+2)]
        centre=.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
        tangent=(c-b).normalized();cross=tangent.cross(Vector((1,0,0))).normalized();radius=.014*(1-t)+.005*t
        for k in range(sides):
            angle=2*math.pi*k/sides;vertices.append(centre+radius*(Vector((1,0,0))*math.cos(angle)+cross*math.sin(angle)))
        if i:
            for k in range(sides):faces.append(((i-1)*sides+k,(i-1)*sides+(k+1)%sides,i*sides+(k+1)%sides,i*sides+k))
    faces.extend([tuple(reversed(range(sides))),tuple((rings-1)*sides+k for k in range(sides))])
    mesh=bpy.data.meshes.new('DonkeyRefinedTail');mesh.from_pydata(vertices,[],faces);mesh.update()
    for face in mesh.polygons:face.use_smooth=True
    tail.data=mesh
    group=tail.vertex_groups.get('DonkeyTailPivot') or tail.vertex_groups.new(name='DonkeyTailPivot')
    group.add(list(range(len(vertices))),1,'REPLACE')

def CoatMaterial(material,image,sculpt=None):
    material.use_nodes=True;nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.86;shader.inputs['Specular IOR Level'].default_value=.18
    output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs[0],output.inputs[0])
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='CoatFlowUV'
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;links.new(uv.outputs[0],texture.inputs['Vector'])
    value=nodes.new('ShaderNodeRGBToBW');links.new(texture.outputs['Color'],value.inputs[0])
    detail=nodes.new('ShaderNodeMapRange');detail.clamp=True
    for name,v in [('From Min',.009),('From Max',.13),('To Min',.52),('To Max',1.35)]:detail.inputs[name].default_value=v
    links.new(value.outputs[0],detail.inputs['Value'])
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links.new(paint.outputs[0],multiply.inputs[1]);links.new(detail.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    height=nodes.new('ShaderNodeMapRange');height.clamp=True;height.inputs['From Min'].default_value=.009;height.inputs['From Max'].default_value=.13
    links.new(value.outputs[0],height.inputs['Value'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.32;bump.inputs['Distance'].default_value=.0008
    links.new(height.outputs[0],bump.inputs['Height']);links.new(bump.outputs[0],shader.inputs['Normal'])
    if sculpt:
        sourceUv=nodes.new('ShaderNodeUVMap');sourceUv.uv_map='UVMap'
        normalTexture=nodes.new('ShaderNodeTexImage');normalTexture.image=sculpt;links.new(sourceUv.outputs[0],normalTexture.inputs['Vector'])
        normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.10
        links.new(normalTexture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bump.inputs['Normal'])

def RefineAppearance(skin,rig,collection,base):
    if skin.get('standaloneAppearanceRevision'):raise RuntimeError('Load the preserved V3 parent before applying the appearance recipe')
    inverseRig=rig.matrix_world.inverted();objects=[o for o in collection.all_objects if o.type=='MESH']
    originalSkin=[v.co.copy() for v in skin.data.vertices]
    # Preserve the horn, soles and skin weights. The same smooth field
    # carries eyes, ear rims and short coat roots with the underlying body.
    for obj in objects:
        transform=inverseRig@obj.matrix_world;inverse=transform.inverted()
        for vertex in obj.data.vertices:
            p=transform@vertex.co;result=Shape(p)
            row={obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
            for front in ('Front','Rear'):
                mass=sum(w for name,w in row.items() if name.startswith('Donkey'+front))
                knee=.48 if front=='Front' else .47
                result.z-=.09*Smooth(.18,knee,p.z)*(1-Smooth(knee,.72 if front=='Front' else .73,p.z))*mass
            if obj.name.startswith(('DonkeyPinna','DonkeyRolledEarRim')):
                side=-1 if 'Left' in obj.name else 1;t=max(0,min(1,(p.z-1.28)/.28))
                centreY=1.08-.001+.105*t+side*.015*t
                result.x-=side*.050*t
                result.y+=(p.y-centreY)*.35+(.012 if side<0 else -.018)*t
                result.z-=.025*t
            vertex.co=inverse@result
        obj.data.update()
    # Relax the old shoulder/chest remap folds. Hooves, muzzle and limb pivots
    # lie outside this spatial window; the body remains a continuous surface.
    adjacency=[set() for v in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    strength=[]
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        zone=max(math.exp(-((y-.66)/.13)**2-((z-.83)/.18)**2),math.exp(-((y+.08)/.16)**2-((z-.80)/.19)**2))
        strength.append(zone*Smooth(.53,.66,z)*(1-Smooth(1.02,1.16,z)))
    for iteration in range(60):
        for factor in (.34,):
            points=[v.co.copy() for v in skin.data.vertices]
            for vertex,weight in zip(skin.data.vertices,strength):
                if weight<.01 or not adjacency[vertex.index]:continue
                mean=sum((points[i] for i in adjacency[vertex.index]),Vector())/len(adjacency[vertex.index])
                delta=(mean-points[vertex.index])*factor*weight
                if delta.length>.006:delta*=.006/delta.length
                vertex.co=points[vertex.index]+delta
    skin.data.update()
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in rig.data.edit_bones:
        if bone.name.endswith('KneePivot'):bone.head.z-=.09;bone.tail.z-=.09
    bpy.ops.object.mode_set(mode='OBJECT')
    RefineLegContours(skin)
    # Shallow ribs live in the surface normal, not in a painted shadow stripe.
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        flank=Smooth(-.03,.06,y)*(1-Smooth(.48,.59,y))*Smooth(.70,.82,z)*(1-Smooth(.98,1.06,z))*Smooth(.07,.15,abs(x))
        vertex.co.x+=math.copysign(.0035*math.cos(55*(y+.12*(z-.85)))*flank,x or 1)
    skin.data.update()
    groom=bpy.data.objects['DonkeyShortCoatSilhouette']
    groomVertices=list(groom.data.vertices)
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    for start in range(0,len(groom.data.vertices),4):
        group=groomVertices[start:start+4];root=sum((v.co for v in group[:3]),Vector())/3
        point,normal,_,_=tree.find_nearest(root);delta=point-normal*.0005-root
        for vertex in group:vertex.co+=delta
    groom.data.update()
    # Embed the tail root in the croup and taper it smoothly into the brush.
    tail=bpy.data.objects['DonkeyThinTail']
    RefineTail(tail)
    for obj in objects:
        if obj.name.startswith('DonkeyTailFibre'):
            for vertex in obj.data.vertices:vertex.co.y-=.047
            obj.data.update()
    # A shorter, fuller bristle crest instead of evenly spaced long needles.
    for obj in objects:
        if not obj.name.startswith('DonkeyStiffMane'):continue
        points=[v.co.copy() for v in obj.data.vertices]
        root=sum(points[:4],Vector())/4
        for vertex in obj.data.vertices:
            delta=vertex.co-root;vertex.co=root+Vector((delta.x*1.30,delta.y,delta.z*.72))
        obj.data.update()
    fur=next(image for image in bpy.data.images if image.name.startswith('Texture_DonkeyWeatheredCoatSourceV3'))
    coatMaterials={m for obj in objects for m in obj.data.materials if m and m.name.startswith(('DonkeyCartGreyCoat','DonkeyCartFaceFur','DonkeyLowerLegShortFur','DonkeyCartEarInterior'))}
    for material in coatMaterials:
        sculpt=next((n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name=='Non-Color'),None) if material.name.startswith('DonkeyCartGreyCoat') else None
        CoatMaterial(material,fur,sculpt)
    tail.data.materials.clear();tail.data.materials.append(next(m for m in coatMaterials if m.name.startswith('DonkeyCartFaceFur')))
    tail.data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
    for obj in objects:
        transform=inverseRig@obj.matrix_world
        colors=obj.data.color_attributes.get('CoatColor')
        if colors:
            for vertex in obj.data.vertices:
                p=transform@vertex.co;row={obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
                if obj.name.startswith('DonkeyPaleEyeRing'):
                    old=Vector(colors.data[vertex.index].color[:3]);colors.data[vertex.index].color=(*[min(.24,v*.78) for v in old],1)
                elif obj.name.startswith('DonkeyPinna'):
                    colors.data[vertex.index].color=(.068,.063,.052,1)
                else:colors.data[vertex.index].color=CoatColor(p,row)
        if not any(m in coatMaterials for m in obj.data.materials):continue
        uv=obj.data.uv_layers.get('CoatFlowUV') or obj.data.uv_layers.new(name='CoatFlowUV')
        for face in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]))
            for loop in face.loop_indices:
                p=transform@obj.data.vertices[obj.data.loops[loop].vertex_index].co
                a,b=(p.y-.30*p.z,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)
                uv.data[loop].uv=(a/.105,b/.105)
    # Ear interiors and crest use neutral, dry tones instead of glossy brown.
    for mat in {m for obj in objects for m in obj.data.materials if m}:
        if mat.name.startswith('DonkeyCartDarkHair'):
            shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Roughness'].default_value=.86;shader.inputs['Specular IOR Level'].default_value=.18
        if mat.name.startswith('DonkeyCartEarInterior'):
            nodes,links=mat.node_tree.nodes,mat.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
            source=shader.inputs['Base Color'].links[0].from_socket
            tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(1.7,1.65,1.55,1)
            links.new(source,tint.inputs[1]);links.new(tint.outputs[0],shader.inputs['Base Color']);shader.inputs['Roughness'].default_value=.92
    maxDelta=max((v.co-old).length for v,old in zip(skin.data.vertices,originalSkin))
    lowerDelta=max((v.co-old).length for v,old in zip(skin.data.vertices,originalSkin) if old.z<.18)
    if lowerDelta>1e-7:raise RuntimeError('Appearance refinement moved hoof contact geometry')
    skin['standaloneAppearanceRevision']='20261022ReferenceV2'
    report={'revision':'20261022ReferenceV2','source':'user original donkey three-view; cart side image used only for animal identity',
            'maxBodySurfaceDisplacementM':maxDelta,'maxHoofDisplacementM':lowerDelta,
            'skinWeightsUnchanged':True,'jointHeightsM':{'frontCarpus':.39,'rearHock':.38},'animation':'re-solve both clips against refined joint heights; original stride and duration retained',
            'material':'neutral gray-brown short coat, fine directional fibres, pale belly and muzzle',
            'shape':'more upright neck/poll, extended muzzle, rounded abdomen, locally smoothed shoulder/hamstring, fuller short mane and narrower ear splay'}
    (base/'RefinementV2').mkdir(exist_ok=True)
    (base/'RefinementV2/Data_AppearanceRefinement.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
