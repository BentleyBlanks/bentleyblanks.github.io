"""Four earth-cliff modules from the user photograph and imagegen prototype.

Run with Script_BlenderMcp exec. glTF axes: X along the trench, Y up,
positive Z faces the trench. The back is buried; runtime bends X along a bank.
"""
import bpy, math, random, json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls')
expected = source / 'Scene_TrenchCliffWalls.blend'
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
cols, rows = 8, 16
for kind, name in enumerate(names):
    rng = random.Random(10936 + kind * 73)
    # Different erosion zones leave broad intact spade planes between breaks.
    # Filling every module with sinusoidal bumps made the cut look melted.
    scars = []
    for scar in range([2, 3, 4, 3][kind]):
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
        scars.append((cx,cz,rng.uniform(.24,.42),rng.uniform(.22,.40),
                      rng.uniform(.045,.11),rng.uniform(-.35,.35)))
    vertices, faces = [], []
    for row in range(rows+1):
        v = row/rows
        for col in range(cols+1):
            u = col/cols
            edge = math.sin(math.pi*u)**2
            x = (u-.5)*1.5
            z = v*2
            if 0<col<cols and 0<row<rows:
                x += rng.uniform(-.026,.026)
                z += rng.uniform(-.027,.027)
            # Shallow tilted cut planes, then local polygonal fractures. A flat
            # recessed centre and narrow broken edge avoid rounded bowl cavities.
            depth = .13 + [-.018,.014,.008,-.012][kind]*x + .004*(z-1)
            for cx,cz,rx,rz,amount,shear in scars:
                qx=(x-cx)/rx; qz=(z-cz)/rz
                distance=max(abs(qx+shear*qz),abs(qz),abs(qx*.65-qz*.52))
                inside=max(0,min(1,(1-distance)/.20))
                depth -= amount*inside
            # Root-bound ledges break only across parts of the upper face.
            # These irregular pockets keep an overhang without an even gutter.
            lipShape=.65+.35*abs(math.sin(x*7.3+kind*2.4))
            depth -= .11*math.exp(-((v-(.84+.025*math.sin(x*6+kind)))/.065)**2)*lipShape
            depth += .13*math.exp(-((v-.98)/.055)**2)*lipShape
            depth += .035*math.exp(-((v-.06)/.1)**2)
            # Keep a continuous cut plane across module boundaries; taper only
            # the sculpted damage. Tapering the whole depth made every module
            # bulge into a regular column. Zero edge derivative also avoids a
            # repeating shading crease at otherwise coincident borders.
            depth = max(.018,min(.30,.14+(depth-.13)*edge))
            if row==rows:
                z += edge*(.014+.045*math.sin(x*13+kind)**2)
            vertices.append((x,-depth,z))
    for row in range(rows):
        for col in range(cols):
            a=row*(cols+1)+col; b=a+cols+1
            faces.extend([(a,a+1,b+1),(a,b+1,b)])
    # The top skirt buries the broken crown into the spoil cap. Side borders
    # share every vertex with the next module after deformation. A side quad
    # joining only its top/bottom would cut across that curved profile and show
    # as a metre-long triangular flap, so there is no redundant side cap.
    segments = [(rows*(cols+1)+c,rows*(cols+1)+c-1) for c in range(cols,0,-1)]
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
