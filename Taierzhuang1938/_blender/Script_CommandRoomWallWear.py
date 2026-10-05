"""Broken plaster has thickness; masonry is recessed into the actual wall.
Executed before backdrop scaling in Script_BuildCommandRoom.py.
"""
from mathutils import noise
walls=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Wall')]
front=wy-.12
patches=[(-2.50,2.45,.52,1.05),(-2.48,.70,.65,.95),(-.54,2.70,.40,.62),
         (.04,1.97,.33,1.06),(.78,.83,.88,.45),(1.93,.76,1.05,.53),(2.61,1.44,.63,1.17)]

def Boolean(ob,cutter,operation):
    bpy.context.view_layer.objects.active=ob
    mod=ob.modifiers.new('Broken plaster boundary','BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)

for index,(cx,cz,sx,sz) in enumerate(patches):
    n=56;outline=[]
    for i in range(n):
        a=i*math.tau/n
        r=.92+.075*math.sin(a*7+index)+.042*math.sin(a*13-index*.7)+random.uniform(-.024,.024)
        outline.append((cx+math.cos(a)*sx*.5*r,cz+math.sin(a)*sz*.5*r))
    verts=[(x,y,z) for y in [front-.10,front+.066] for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
    cut=Mesh('PlasterCutVolume',verts,faces,plaster)
    # Recalculate cutter normals before exact Boolean operations.
    import bmesh
    bm=bmesh.new();bm.from_mesh(cut.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(cut.data);bm.free()
    for wall in walls:
        bounds=[wall.matrix_world@Vector(p) for p in wall.bound_box]
        if max(p.x for p in bounds)<cx-sx or min(p.x for p in bounds)>cx+sx or max(p.z for p in bounds)<cz-sz or min(p.z for p in bounds)>cz+sz:continue
        Boolean(wall,cut,'DIFFERENCE')
    mortar=Mesh('RecessedLimeBed',[(x,front+.026,z) for x,z in outline],
        [tuple(range(n))],plaster,[(x/1.8,z/1.8) for x,z in outline])
    # A thin chipped plaster rim exposes the section at the broken outline.
    rim=[];rimUvs=[];perimeter=[0]
    for i in range(n):
        a=Vector(outline[i]);b=Vector(outline[(i+1)%n]);perimeter.append(perimeter[-1]+(b-a).length)
    for depth,scale in [(0,1.00),(.007,.985),(.035,.94)]:
        for i,(x,z) in enumerate(outline+[outline[0]]):
            rim.append((cx+(x-cx)*scale,front+depth,cz+(z-cz)*scale));rimUvs.append((perimeter[i]/1.8,depth/1.8))
    stride=n+1
    Mesh('FracturedPlasterSection',rim,[(r*stride+i,r*stride+i+1,(r+1)*stride+i+1,(r+1)*stride+i) for r in range(2) for i in range(n)],plaster,rimUvs)
    rows=math.ceil(sz/.099)+2;cols=math.ceil(sx/.235)+2
    for row in range(rows):
        for col in range(cols):
            x=cx+(col-(cols-1)/2)*.235+(row%2-.5)*.112
            z=cz+(row-(rows-1)/2)*.099
            if ((x-cx)/(sx*.60))**2+((z-cz)/(sz*.62))**2>1.3:continue
            ob=Cube('RecessedWeatheredBrick',(x,front+.038,z),(.222+random.uniform(-.008,.003),.038,.085+random.uniform(-.004,.003)),brick,.008)
            # Several local impacts erode the bevel; avoid uniformly smooth boxes.
            for v in ob.data.vertices:
                nval=noise.noise_vector((v.co+Vector((x,0,z)))*51)[0]
                v.co+=v.normal*max(-.004,min(.0018,nval*.0035))
            ob.data.update();Boolean(ob,cut,'INTERSECT')
            if not ob.data.polygons:bpy.data.objects.remove(ob,do_unlink=True);continue
            ob.data.materials.clear();ob.data.materials.append(brick)
            for poly in ob.data.polygons:poly.material_index=0
            layer=ob.data.uv_layers.active
            for poly in ob.data.polygons:
                for li in poly.loop_indices:
                    p=ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co
                    layer.data[li].uv=(p.x/.5+index*.31,p.z/.5+row*.17)
            colors=ob.data.color_attributes.new(name='BrickWear',type='FLOAT_COLOR',domain='POINT')
            shade=random.uniform(.76,1.12)
            for c in colors.data:c.color=(shade,shade,shade,1)
    bpy.data.objects.remove(cut,do_unlink=True)

# Boolean-created cut faces also need a physical UV projection; interpolated
# coplanar wall UVs collapse across the thickness and stripe the normal map.
for wall in walls:
    layer=wall.data.uv_layers.active
    for poly in wall.data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        a,b=(0,2) if axis==1 else (1,2) if axis==0 else (0,1)
        for li in poly.loop_indices:
            p=wall.matrix_world@wall.data.vertices[wall.data.loops[li].vertex_index].co
            layer.data[li].uv=(p[a]/1.8,p[b]/1.8)
