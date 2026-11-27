"""Apply the same sediment material controls to the editable Type89 sources."""
import json
from pathlib import Path

import bpy
import numpy as np

from Script_Type89BattleWearHigh import Existing, Graph, HighClod, LoadControl, MudObject, RECIPE, Srgb, TrackProjection
from mathutils import Vector
from Script_Type89Sediment import (
    BodyKind, BodyLayers, ClayCap, ClodScale, ClodUv, Dryness, ExistingTreadCap,
    GRAIN, GrainCoords, PROFILE, Tiles, TRACK_CONTROL,
)


ROOT = 'Model_Type89MediumTank'
ROLE = 'Type89SedimentKind'
TRACK = 'Mesh_TrackLink'


class Nodes:
    def __init__(self,graph):
        self.graph = graph

    def smooth(self,a,lo,hi):
        return self.graph.Smooth(a,lo,hi)

    def add(self,a,b):
        return self.graph.Math('ADD',a,b)

    def mul(self,a,b):
        return self.graph.Math('MULTIPLY',a,b)

    def maximum(self,a,b):
        return self.graph.Math('MAXIMUM',a,b)

    def absolute(self,a):
        return self.graph.Math('ABSOLUTE',a)

    def oneMinus(self,a):
        return self.graph.Math('SUBTRACT',1,a)


def Attr(graph,name,socket):
    node = graph.Node('ShaderNodeAttribute',name)
    node.attribute_name = name
    return node.outputs[socket]


def ScaleColor(graph,color,factor):
    scale = graph.Node('ShaderNodeVectorMath','Earth grain tint')
    scale.operation = 'SCALE'
    graph.Set(scale.inputs[0],color[:3] if isinstance(color,tuple) else color)
    graph.Set(scale.inputs['Scale'],factor)
    return scale.outputs[0]


def Tint(graph,a,grain,weight):
    m,add = lambda x,y:graph.Math('MULTIPLY',x,y),lambda x,y:graph.Math('ADD',x,y)
    value = add(m(grain[0],weight),m(grain[1],weight*.47))
    return ScaleColor(graph,a,add(value,1-weight*.735))


def Coat(graph,shader,cake,powder,grain,height,dielectric=False):
    op = Nodes(graph)
    colors = PROFILE['palette']
    metallic = shader.inputs['Metallic']
    rough = shader.inputs['Roughness']
    base = shader.inputs['Base Color']
    shade = Dryness(cake,grain,op)
    mud = Tint(graph,graph.Mix(Srgb(colors['damp']),Srgb(colors['dry']),shade,'Damp core and dry crust'),grain,.26)
    silt = Tint(graph,Srgb(colors['powder']),grain,.19)
    color = graph.Mix(graph.Mix(Existing(base),mud,cake,'Packed earth'),silt,powder,'Powder in sheltered joints')
    graph.Set(base,color)
    lo,hi = PROFILE['track']['packedRoughness']
    r = op.add(lo,op.mul(shade,hi-lo))
    graph.Set(rough,graph.ScalarMix(graph.ScalarMix(Existing(rough),r,cake),.94,powder))
    metal = Existing(metallic)
    if not dielectric:
        metal = graph.ScalarMix(graph.ScalarMix(metal,.018,cake),.009,powder)
        graph.Set(metallic,metal)
    output = next(node for node in graph.nodes if node.type=='GROUP_OUTPUT')
    if output.inputs.get('Metallic'):
        graph.Set(output.inputs['Metallic'],metal)
    normal = shader.inputs['Normal']
    bump = graph.Node('ShaderNodeBump','Earth clast relief')
    bump.inputs['Strength'].default_value = .85
    bump.inputs['Distance'].default_value = 1
    graph.Set(bump.inputs['Height'],height)
    if normal.is_linked:
        graph.Set(bump.inputs['Normal'],Existing(normal))
    graph.Set(normal,bump.outputs[0])


def Branch(root,role):
    fixed = {role:branch for branch in [('Body',('Armor','CastArmor','Shadow')),
                               ('Mechanical',('Steel','Rubber','Exhaust')),('RunningGear',('Track','Soil'))]
             for role in branch[1]}
    family = fixed[role][0]
    mat = bpy.data.materials['Material_Type89High'+family]
    assert any(mat in obj.data.materials[:] for obj in root.children_recursive if obj.type=='MESH')
    return next(node.node_tree for node in mat.node_tree.nodes if node.type=='GROUP' and node.label==role)


def Body(root,image):
    for role in ('Armor','CastArmor','Steel','Rubber'):
        tree = Branch(root,role)
        graph = Graph(tree)
        shader = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
        graph.Lane(shader.location.x-1460,shader.location.y-1880)
        op = Nodes(graph)
        pos = graph.Separate(Attr(graph,'BattleWearPosition','Vector'))
        normal = graph.Separate(graph.Vector('NORMALIZE',Attr(graph,'BattleWearNormal','Vector')))
        kind = Attr(graph,ROLE,'Fac')
        uv = graph.XY(*GrainCoords(*pos,op))
        grain = graph.Texture(image,uv)
        cake,powder = BodyLayers(pos,normal,grain,kind,op)
        keep = op.oneMinus(op.smooth(Existing(shader.inputs['Metallic']),.30,.74))
        cake,powder = op.mul(cake,keep),op.mul(powder,keep)
        grit = graph.Math('SUBTRACT',grain[1],.5)
        fine = op.mul(op.mul(grit,PROFILE['body']['reliefM']),op.add(cake,op.mul(powder,.54)))
        relief = op.add(fine,op.mul(graph.Math('POWER',cake,1.35),.00135))
        Coat(graph,shader,cake,powder,grain,relief,role=='Rubber')


def Track(root,directory,image):
    tree = Branch(root,'Track')
    graph = Graph(tree)
    shader = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    graph.Lane(shader.location.x-1330,shader.location.y-1750)
    new = TrackProjection(directory)
    new.name = 'Type89 packed earth on the treads'
    sample = next(node for node in new.nodes if node.type=='TEX_IMAGE')
    sample.image = LoadControl(directory,TRACK_CONTROL)
    layer = graph.Node('ShaderNodeGroup','Compacted soil in the casting')
    layer.node_tree = new
    op = Nodes(graph)
    x,y,_ = graph.Separate(graph.Node('ShaderNodeTexCoord').outputs['Object'])
    u,v = op.add(.5,op.mul(x,2.60)),op.add(.5,op.mul(y,4.70))
    grain = graph.Texture(image,graph.XY(u,v))
    cake = op.smooth(layer.outputs['Earth'],.051,.75)
    powder = op.mul(layer.outputs['Dust'],PROFILE['track']['powderOpacity'])
    Coat(graph,shader,cake,powder,grain,op.mul(layer.outputs['Height'],PROFILE['track']['reliefGain']))


def Soil(root):
    graph = Graph(Branch(root,'Soil'))
    shader = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    graph.Lane(shader.location.x-1380,shader.location.y-600)
    coordinate = graph.Node('ShaderNodeTexCoord').outputs['Object']
    op = Nodes(graph)
    signals = []
    for scale,detail in [(88,2.5),(385,2.1),(166,2.6)]:
        node = graph.Node('ShaderNodeTexNoise','Surface clasts and fine sand')
        graph.Set(node.inputs['Vector'],coordinate)
        node.inputs['Scale'].default_value=scale
        node.inputs['Detail'].default_value=detail
        node.inputs['Roughness'].default_value=.76
        signals.append(node.outputs['Fac'])
    macro,fine,aggregate = signals
    shade = op.add(.10,op.add(op.mul(macro,.44),op.mul(aggregate,.45)))
    colors = PROFILE['palette']
    core = graph.Mix(Srgb(colors['damp']),Srgb(colors['dry']),shade)
    value = op.add(.67,op.add(op.mul(macro,.47),op.mul(fine,.22)))
    graph.Set(shader.inputs['Base Color'],ScaleColor(graph,core,value))
    graph.Set(shader.inputs['Roughness'],op.add(.88,op.mul(shade,.08)))
    shader.inputs['Specular IOR Level'].default_value=.25
    height = op.add(op.mul(macro,.0018),op.add(op.mul(aggregate,.0016),op.mul(fine,.00065)))
    bump=graph.Node('ShaderNodeBump','Granular fracture surface')
    graph.Set(bump.inputs['Height'],height)
    bump.inputs['Strength'].default_value=.74
    bump.inputs['Distance'].default_value=1
    graph.Set(shader.inputs['Normal'],bump.outputs[0])


def PutUvs(mesh,points,origin,radii):
    uvLayer=mesh.uv_layers.new(name='UVMap')
    uv=ClodUv(points,origin,radii,RECIPE['tracks']['mudTile'])
    uv[:,1]=1-uv[:,1]
    for loop in mesh.loops:
        uvLayer.data[loop.index].uv=uv[loop.vertex_index]


def DeformClod(obj,quality):
    old=obj.data
    points=np.empty((len(old.vertices),3),np.float32)
    old.vertices.foreach_get('co',points.ravel())
    moving=obj.parent.name.startswith(TRACK)
    centre,scale=ClodScale(points,moving)
    points=(points-centre)*scale+centre
    if moving and quality=='Game':
        points,faces,origin,radii=ExistingTreadCap(points,obj.name)
        mat=old.materials[0]
        mesh=bpy.data.meshes.new(obj.name+'Packed')
        mesh.from_pydata(points.tolist(),[],faces.tolist())
        mesh.materials.append(mat)
        for polygon in mesh.polygons:
            polygon.use_smooth=True
        PutUvs(mesh,points,origin,radii)
        obj.data=mesh
        if old.users==0:
            bpy.data.meshes.remove(old)
    else:
        old.vertices.foreach_set('co',points.ravel())
    obj.data.update()


def AddClods(root,quality):
    runGear=bpy.data.materials['Material_Type89HighRunningGear' if quality=='High' else 'Material_Type89GameTrack']
    collection=bpy.data.collections.new('Type89 additional packed earth')
    root.users_collection[0].children.link(collection)
    for spot in PROFILE['track']['extraCaps']:
        name=spot['name']
        parent=bpy.data.objects[spot['carrier']]
        if quality=='High':
            values,faces=HighClod(spot['radii'],spot['seed'],secondary=True)
            points=[Vector(val)+Vector(spot['origin']) for val in values]
        else:
            points,faces=ClayCap(spot['origin'],spot['radii'],spot['seed'],False)
            faces=faces.tolist()
        obj=MudObject(collection,name,parent,[tuple(v) for v in points],faces,runGear)
        if quality=='High':
            mark=obj.data.attributes.new('Type89SurfaceFinish','FLOAT','FACE')
            mark.data.foreach_set('value',np.ones(len(obj.data.polygons),dtype=np.float32))
        else:
            PutUvs(obj.data,points,spot['origin'],spot['radii'])


def Prepare(root,quality):
    selected=Tiles()
    if quality=='Game':
        castings={i:bpy.data.meshes['Type89TrackShoeEarth'+str(i)] for i in range(4)}
    clods=0
    for name,carrier in PROFILE['track']['clodCarriers'].items():
        obj=bpy.data.objects[name]
        transform=obj.matrix_basis.copy()
        obj.parent=bpy.data.objects[carrier]
        obj.matrix_parent_inverse.identity()
        obj.matrix_basis=transform
    meshes=set()
    for obj in root.children_recursive:
        if obj.type!='MESH':
            continue
        if obj.name in selected:
            tile=selected[obj.name]
            if quality=='Game':
                obj.data=castings[tile]
            else:
                obj.color[0]=tile/3
        if obj.get('battleWearMud') and (quality=='Game' or obj.name.startswith(('Mesh_Type89MudClod','Mesh_Type89HullEarth'))):
            DeformClod(obj,quality)
            clods+=1
        if quality=='High' and obj.data not in meshes:
            index=BodyKind(obj.name)
            if index:
                attribute=obj.data.attributes.new(ROLE,'FLOAT','FACE')
                attribute.data.foreach_set('value',np.full(len(obj.data.polygons),index,dtype=np.float32))
        meshes.add(obj.data)
    assert clods>=12 if quality=='High' else clods==12
    AddClods(root,quality)
    return clods


def Game(version,report):
    names = set(report['maps'])
    reused = {}
    for role,atlas in [('Body','Body'),('Glass','Body'),('Track','Track')]:
        material = bpy.data.materials['Material_Type89Game'+role]
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or node.label not in ('Base','Normal','Orm'):
                continue
            name = 'Texture_Type89Game'+atlas+node.label+'.png'
            if name not in names:
                continue
            if name not in reused:
                image = bpy.data.images.load(str(version/'Game'/'Maps'/name),check_existing=False)
                image.colorspace_settings.name = 'sRGB' if node.label=='Base' else 'Non-Color'
                image.pack()
                image.filepath_raw = '//Maps/'+name
                reused[name] = image
            node.image = reused[name]
    assert len(reused)==6


def Bind(version,tier):
    directory = version if tier=='High' else version/'Game'
    target = directory/f'Scene_Type89MediumTank{tier}Pbr.blend'
    assert Path(bpy.data.filepath).resolve()==target.resolve()
    root = bpy.data.objects[ROOT]
    if root['surfaceRevision']==PROFILE['revision']:
        before = version.with_name('GeometryV55SurfaceV20')/target.relative_to(version)
        bpy.ops.wm.open_mainfile(filepath=str(before))
        root = bpy.data.objects[ROOT]
    assert root['surfaceRevision']==PROFILE['baseline']
    file = version/'Review'/'Data_SedimentReview.json'
    review = json.loads(file.read_text(encoding='utf-8'))
    clods = Prepare(root,tier)
    if tier=='High':
        controls = version/'Maps'/'Controls'
        grain = LoadControl(controls,GRAIN)
        Body(root,grain)
        Track(root,controls,grain)
        Soil(root)
    else:
        Game(version,review)
    root['surfaceRevision'] = PROFILE['revision']
    bpy.context.scene['BlenderMcpTask'] = 'Type89MudRevision'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.data.use_autopack = False
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    meshes = {obj.data for obj in root.children_recursive if obj.type=='MESH'}
    materials = {mesh.materials[face.material_index].name for mesh in meshes for face in mesh.polygons}
    review.setdefault('sourceMaterials',{})[tier] = sorted(materials)
    review.setdefault('sourceWidenedClods',{})[tier] = clods
    file.write_text(json.dumps(review,indent=2)+'\n',encoding='utf-8')
    print(tier,PROFILE['revision'],'saved',len(materials),'materials with',clods,'widened three-dimensional clods',flush=True)
