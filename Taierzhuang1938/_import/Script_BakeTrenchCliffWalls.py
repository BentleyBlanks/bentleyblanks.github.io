"""Four earth-cliff modules from the user photograph and imagegen prototype.

Run with Script_BlenderMcp exec. glTF axes: X along the trench, Y up,
positive Z faces the trench. The back is buried; runtime bends X along a bank.
"""
import bpy, math, random, json
from mathutils import Vector, geometry as Geometry
from pathlib import Path

project = Path(__file__).resolve().parents[1]
source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls/Adaptive')
expected = source / 'Scene_TrenchCliffWallsAdaptive.blend'
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != expected.resolve():
    raise RuntimeError('Refusing another Blender project: ' + bpy.data.filepath)
source.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mesh in list(bpy.data.meshes):
    if not mesh.users: bpy.data.meshes.remove(mesh)
for mat in list(bpy.data.materials):
    if not mat.users: bpy.data.materials.remove(mat)
material = bpy.data.materials.new('Material_TrenchCompactEarth')
material.diffuse_color = (.17, .13, .085, 1)
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
names = ['SpadeFace', 'TornFace', 'LowerScar', 'RootCrown']
records = []
for kind, name in enumerate(names):
    rng = random.Random(10936 + kind * 73)
    # Different erosion zones leave broad intact spade planes between breaks.
    # Filling every module with sinusoidal bumps made the cut look melted.
    scars = []
    for scar in range([4, 6, 5, 7][kind]):
        cx = rng.uniform(-.55,.55)
        cz = rng.uniform(.20,1.72)
        if kind == 0:
            cx = (-1 if scar % 2 else 1) * rng.uniform(.38,.60)
        elif kind == 1:
            cx = rng.uniform(-.28,.27)
        elif kind == 2:
            cz = rng.uniform(.12,.55)
        else:
            cz = rng.uniform(1.30,1.80)
        scars.append((cx,cz,rng.uniform(.08,.16),rng.uniform(.10,.22),
                      rng.uniform(.025,.065),rng.uniform(-.35,.35)))
    points, pointIds = [], {}
    def Point(x,z,border=False):
        if not border and (abs(x)>.73 or z<.02 or z>1.98): return None
        key=(round(x,7),round(z,7))
        if key not in pointIds:
            pointIds[key]=len(points);points.append(Vector((x,z)))
        return pointIds[key]
    def Clip(poly,nx,nz,limit):
        result=[]
        for i,current in enumerate(poly):
            previous=poly[i-1]
            a=nx*previous[0]+nz*previous[1]-limit
            b=nx*current[0]+nz*current[1]-limit
            if (a<=0)!=(b<=0):
                t=a/(a-b)
                result.append((previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t))
            if b<=0:result.append(current)
        return result
    # Shared border samples remain identical across every module. Interior
    # vertices follow fracture rims and floors instead of a uniform grid.
    border=[]
    border += [Point(-.75+i*1.5/8,0,True) for i in range(8)]
    border += [Point(.75,i*2/16,True) for i in range(16)]
    border += [Point(.75-i*1.5/8,2,True) for i in range(8)]
    border += [Point(-.75,2-i*2/16,True) for i in range(16)]
    edges=[(border[i],border[(i+1)%len(border)]) for i in range(len(border))]
    for z in [.35,.85,1.30]:
        for x in [-.5,-.25,0,.25,.5]:Point(x,z)
    for z in [.125,1.68,1.80,1.96]:
        for col in range(1,8):Point((col/8-.5)*1.5,z)
    for cx,cz,rx,rz,amount,shear in scars:
        Point(cx,cz)
        for radius in [.78,1.02]:
            polygon=[(-2,-2),(2,-2),(2,2),(-2,2)]
            for nx,nz in [(1,shear),(-1,-shear),(0,1),(0,-1),(.65,-.52),(-.65,.52)]:
                polygon=Clip(polygon,nx,nz,radius)
            for qx,qz in polygon:Point(cx+qx*rx,cz+qz*rz)
    coordinates,_,triangles,*_=Geometry.delaunay_2d_cdt(points,edges,[],0,1e-7,False)
    vertices,faces=[],[tuple(face) for face in triangles]
    assert all(len(face)==3 for face in faces)
    for coordinate in coordinates:
        x,z=coordinate;u=(x+.75)/1.5;v=z/2
        t=max(0,min(1,(.75-abs(x))/.12));edge=t*t*(3-2*t)
        depth=.13+[-.018,.014,.008,-.012][kind]*x+.004*(z-1)
        scarDepth=0.0
        for cx,cz,rx,rz,amount,shear in scars:
            qx=(x-cx)/rx;qz=(z-cz)/rz
            distance=max(abs(qx+shear*qz),abs(qz),abs(qx*.65-qz*.52))
            inside=max(0,min(1,(1-distance)/.20))
            scarDepth=max(scarDepth,amount*inside)
        depth-=scarDepth
        lipShape=.65+.35*abs(math.sin(x*7.3+kind*2.4))
        depth-=.11*math.exp(-((v-(.84+.025*math.sin(x*6+kind)))/.065)**2)*lipShape
        depth+=.13*math.exp(-((v-.98)/.055)**2)*lipShape
        depth+=.035*math.exp(-((v-.06)/.1)**2)
        depth=max(.018,min(.30,.14+(depth-.13)*edge))
        if abs(z-2)<1e-6:z+=edge*(.014+.045*math.sin(x*13+kind)**2)
        vertices.append((x,-depth,z))
    topFront=sorted([i for i,c in enumerate(coordinates) if abs(c.y-2)<1e-6],key=lambda i:coordinates[i].x)
    assert len(topFront)==9
    # The top skirt buries the broken crown into the spoil cap. Side borders
    # share every vertex with the next module after deformation. A side quad
    # joining only its top/bottom would cut across that curved profile and show
    # as a metre-long triangular flap, so there is no redundant side cap.
    segments = [(topFront[c],topFront[c-1]) for c in range(8,0,-1)]
    back={}
    for a,b in segments:
        for index in (a,b):
            if index not in back:
                x,_,z=vertices[index];back[index]=len(vertices)
                vertices.append((x,.06,max(0,min(2,z))))
        faces.extend([(a,back[a],back[b]),(a,back[b],b)])
    # No back plane: it is entirely buried, and an open recessed skirt avoids
    # wasting triangles on a second hidden copy of the whole wall face.
    mesh=bpy.data.meshes.new('Mesh_TrenchCliff'+name)
    mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('TrenchCliff'+name,mesh)
    bpy.context.collection.objects.link(obj);mesh.materials.append(material)
    for polygon in mesh.polygons: polygon.use_smooth=True
    # Preserve only sharp fracture creases. glTF exports split vertices here,
    # so runtime normal reconstruction keeps them after fitting to each bank.
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    split=obj.modifiers.new('FractureCreases','EDGE_SPLIT')
    split.split_angle=math.radians(60)
    split.use_edge_angle=True;split.use_edge_sharp=False
    bpy.ops.object.modifier_apply(modifier=split.name)
    mesh=obj.data
    uv=mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        for loopIndex in polygon.loop_indices:
            p=mesh.vertices[mesh.loops[loopIndex].vertex_index].co
            uv.data[loopIndex].uv=(p.z/2,(p.x+.75)/1.5)
    obj['Prototype']='Reference_TrenchCliffWallKit.png / Reference_TrenchCliffWall_User.png'
    obj['WidthM']=1.5;obj['HeightM']=2.0;obj['FrontAxis']='+Z in glTF'
    records.append({'name':obj.name,'triangles':len(faces),
        'gltfBounds':[[min(v[0] for v in vertices),min(v[2] for v in vertices),-max(v[1] for v in vertices)],
                      [max(v[0] for v in vertices),max(v[2] for v in vertices),-min(v[1] for v in vertices)]]})
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(project/'Model'/'Model_TrenchCliffWalls.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=False)
bpy.context.scene['SourceReference']='User near-vertical earthen wall photo + imagegen four-module prototype, 2026-10-09'
bpy.ops.wm.save_as_mainfile(filepath=str(expected))
(source/'Data_TrenchCliffWallBounds.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'source':str(expected),'models':records,'triangles':sum(r['triangles'] for r in records)}))
