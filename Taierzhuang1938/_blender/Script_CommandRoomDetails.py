"""Authored garment, bottle and paper details; references live beside the .blend.
Executed by Script_BuildCommandRoom.py in its authoring context before batching.
"""
thread=Material('CommandRoomThread',(.16,.148,.125),.97)
inkGlass.diffuse_color=(.052,.023,.007,1)
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.052,.023,.007,1)
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.14
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.50

def Shell(ob,thickness):
    if ob.name.startswith('Cap'):
        # Close periodic seams and the top's polar fan before giving it a shell.
        import bmesh
        bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(ob.data);bm.free();ob.data.update()
    m=ob.modifiers.new('Physical fabric thickness','SOLIDIFY');m.thickness=thickness
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=m.name)
    return ob

def Surface(name,nu,nv,point,mat,uvpoint=None,reverse=False):
    verts=[];uv=[];faces=[]
    for j in range(nv+1):
        for i in range(nu+1):
            u=i/nu;v=j/nv;verts.append(tuple(point(u,v)))
            uv.append(uvpoint(u,v) if uvpoint else (u,v))
    for j in range(nv):
        for i in range(nu):
            k=j*(nu+1)+i;f=(k,k+1,k+nu+2,k+nu+1)
            faces.append(tuple(reversed(f)) if reverse else f)
    return Mesh(name,verts,faces,mat,uv,True)

def Button(name,center,radius,normal=(0,-1,0)):
    c=Vector(center);n=Vector(normal).normalized();a=Vector((1,0,0));b=n.cross(a).normalized()
    # Rounded rim, inset face and four thread holes remain actual geometry.
    profiles=[(-.001,radius*.74),(0,radius),(.002,radius),(.003,radius*.76),(.0022,0)]
    verts=[];uv=[];sides=32
    for depth,r in profiles:
        for i in range(sides+1):
            t=math.tau*i/sides;verts.append(tuple(c+n*depth+a*(r*math.cos(t))+b*(r*math.sin(t))));uv.append((i/sides,depth))
    faces=[(j*(sides+1)+i,j*(sides+1)+i+1,(j+1)*(sides+1)+i+1,(j+1)*(sides+1)+i) for j in range(4) for i in range(sides)]
    ob=Mesh(name,verts,faces,iron,uv,True)
    for x in [-1,1]:
        for y in [-1,1]:
            p=c+n*.0028+a*(x*radius*.26)+b*(y*radius*.26)
            Rod(name+'Hole',p,p+n*.0003,radius*.12,graphite,8)
    Curve(name+'Thread',[c+n*.0036-a*radius*.27-b*radius*.27,c+n*.0038+a*radius*.27+b*radius*.27],.00045,thread)
    return ob

tailoringPath=GAME/'_blender/Script_CommandRoomTailoring.py'
exec(compile(tailoringPath.read_text(encoding='utf-8'),str(tailoringPath),'exec'),globals())

# Trace the original yellowed paper's silhouette, excluding its white photo backdrop.
outline=json.loads((GAME/'_blender/Data_CommandRoomPaperOutline.json').read_text())['uvOutline']
vs=[];uvs=[];n=len(outline);rings=[1,.985,.94,.80,.55,.25]
def LetterVertex(u,v):
    px=(u-.5)*.65;py=(v-.5)*.85;angle=-.26
    edge=(max(0,abs(u-.5)-.43)/.07)**2*.006+(max(0,abs(v-.5)-.43)/.07)**2*.006
    cr=.0018*math.sin(u*math.pi*4)+.002*math.cos(v*math.pi*6)+edge
    return (-.142+px*math.cos(angle)-py*math.sin(angle),-.629+px*math.sin(angle)+py*math.cos(angle),.920+cr)
for r in rings:
    for u,v in outline:
        u=.5+(u-.5)*r;v=.5+(v-.5)*r
        vs.append(LetterVertex(u,v));uvs.append((u,v))
faces=[]
for j in range(len(rings)-1):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
vs.append(LetterVertex(.5,.5));uvs.append((.5,.5));c=len(vs)-1
faces.extend(((len(rings)-1)*n+i,(len(rings)-1)*n+(i+1)%n,c) for i in range(n))
Shell(Mesh('Telegram',vs,faces,letter,uvs,True),.00055)
