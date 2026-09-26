"""Run through Script_BlenderMcp exec --code with runpy.run_path. Deterministic surface kit.
The editable source stays outside the Pages repository; only GLB/data textures ship.
"""
import bpy, math, random, json
import numpy as np
from pathlib import Path
from mathutils import Vector

project = Path(__file__).resolve().parents[1]
source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchSurface')
source.mkdir(parents=True, exist_ok=True)
expected = source / 'Scene_TrenchNaturalSurface.blend'
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != expected.resolve():
    raise RuntimeError('Refusing to replace another Blender project: ' + bpy.data.filepath)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
rng = random.Random(70726)

def Material(name, color, roughness):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return material

def Export(obj, name):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(project / 'Model' / name), export_format='GLB',
        use_selection=True, export_yup=True, export_materials='EXPORT', export_animations=False)

# A tangled root-bound tuft: thin folded ribbon blades, bent stems and small seed heads.
# Model coordinates: +Y is the outward drape direction, Z up. glTF becomes -Z / Y up.
vertices, faces = [], []
def Ribbon(points, width, phase):
    start = len(vertices)
    for i, p in enumerate(points):
        t = i / (len(points) - 1)
        tangent = Vector(points[min(i + 1, len(points)-1)]) - Vector(points[max(0, i-1)])
        side = tangent.cross(Vector((.1*math.sin(phase+t*2), 0, 1))).normalized()
        w = width * max(.018, (1-t)**.7)
        for offset in (-1, 1):
            v = Vector(p) + side * w * offset
            if offset == 0: v.z += width * .32
            vertices.append(tuple(v))
    for i in range(len(points)-1):
        a = start + i*2
        faces.extend([(a,a+2,a+1),(a+1,a+2,a+3)])

for blade in range(40):
    angle = rng.uniform(-math.pi, math.pi)
    base = Vector((rng.uniform(-.43,.43),rng.uniform(-.20,.10),rng.uniform(-.018,.025)))
    length = rng.uniform(.35,.85)
    drape = blade < 34
    extent = rng.uniform(.22,.8) if drape else rng.uniform(.08,.22)
    heading = Vector((math.sin(angle)*.55, 1 if drape else math.cos(angle), 0))
    points=[]
    for i in range(8):
        t=i/7
        p=base+heading*(extent*t)
        p.z += length*(.13*math.sin(math.pi*t) - (.85*t*t if drape else -.68*t))
        p.x += .065*math.sin(t*5+angle)*t
        p.y += .045*math.sin(t*6+angle)*t
        points.append(tuple(p))
    width=rng.uniform(.0018,.004)
    Ribbon(points,width,angle)
    # Fine lateral rootlets and broken leaf stems prevent the comb-like silhouette.
    for branch in range(2):
        root=Vector(points[2+branch*2])
        direction=-1 if branch==0 else 1
        span=rng.uniform(.08,.25)
        twig=[]
        for j in range(4):
            t=j/3
            twig.append(tuple(root+Vector((direction*span*t,.06*t+.05*math.sin(t*3),-.08*t*t))))
        Ribbon(twig,width*.6,angle+branch)
mesh=bpy.data.meshes.new('Mesh_TrenchDryGrass')
mesh.from_pydata(vertices,[],faces);mesh.update()
grass=bpy.data.objects.new('TrenchDryGrass',mesh);bpy.context.collection.objects.link(grass)
grass.data.materials.append(Material('Material_TrenchDryGrass',(.22,.145,.061),.88))
grass['SourceForward']='-Z after glTF conversion; hanging side follows local -Z'
Export(grass,'Model_TrenchDryGrass.glb')

# A fractured, irregular stone with real planar breaks, not a terrain-coloured sphere.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
stone=bpy.context.object;stone.name='TrenchStone'
for v in stone.data.vertices:
    p=v.co
    factor=1 + .13*math.sin(p.x*11+p.y*7) + .07*math.cos(p.z*17-p.x*3)
    p.x *= factor*.52; p.y *= factor*.43; p.z *= factor*.29
    p.z=max(p.z,-.21)
stone.data.materials.append(Material('Material_TrenchStone',(.23,.215,.18),.79))
for polygon in stone.data.polygons: polygon.use_smooth=False
Export(stone,'Model_TrenchStone.glb')

# Packed physical surface data. Four independently sculpted irregular stamps in a 2x2 atlas.
# R height, G soft footprint, B water retention, A crevice AO. No baked light or albedo.
size=512
yy,xx=np.mgrid[0:size,0:size].astype(np.float32)
u=(xx+.5)/size;v=(yy+.5)/size
image=np.zeros((size,size,4),np.float32)
for tile in range(4):
    x=(u*2-tile%2)*2-1;y=(v*2-tile//2)*2-1
    inside=(np.abs(x)<=1)&(np.abs(y)<=1)
    noise=(np.sin(x*15+y*9+tile)*np.cos(y*19-x*4)+.5*np.sin(x*37-y*21))/1.5
    radius=np.sqrt(x*x+y*y)
    mask=np.clip((.95-radius+.06*noise)/.16,0,1)
    relief=np.zeros_like(u)
    local=random.Random(71+tile)
    for k in range(42):
        cx=local.uniform(-.82,.82);cy=local.uniform(-.82,.82)
        sx=local.uniform(.035,.16);sy=local.uniform(.06,.25)
        relief+=local.uniform(.09,.25)*np.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
    # Shallow compressed ruts and squeezed-out shoulders break up the loose clods.
    rut=np.exp(-((x-.15*np.sin(y*3+tile))/.17)**2)
    height=np.clip(.34+relief*.8 + .035*noise-.15*rut,0,1)
    wet=np.clip((.56-height)*2.6+.14*rut,0,1)*mask
    ao=np.clip(.96-.5*np.maximum(0,.38-height)-.08*noise,.6,1)
    for channel,data in enumerate([height,mask,wet,ao]):image[:,:,channel][inside]=data[inside]
texture=bpy.data.images.new('Texture_TrenchMudHeightMask',width=size,height=size,alpha=True,float_buffer=False)
texture.colorspace_settings.name='Non-Color'
texture.pixels.foreach_set(image.reshape(-1))
texture.filepath_raw=str(project/'Texture'/'Texture_TrenchMudHeightMask.png')
texture.file_format='PNG';texture.save()

bpy.context.scene['TrenchSurfaceSource']='Concept 07; deterministic artist-directed construction, no external asset license'
bpy.ops.wm.save_as_mainfile(filepath=str(expected))
report={'grassTriangles':len(faces),'stoneTriangles':len(stone.data.polygons),
    'grassBounds':[[min(p[k] for p in vertices),max(p[k] for p in vertices)]for k in range(3)],
    'heightRange':[float(image[:,:,0].min()),float(image[:,:,0].max())],
    'packedChannels':'height, footprint, wetness, AO','blend':str(expected)}
(project/'docs'/'Data_TrenchSurfaceAssets.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
