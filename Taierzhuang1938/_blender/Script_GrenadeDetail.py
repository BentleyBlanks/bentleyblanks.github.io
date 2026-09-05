"""Author the external surface of the Tengxian game prop, plus shared TZM/GLB.

Run in an empty task-owned Blender scene. No functional interior is modelled.
The imagegen sheet is an art reference, not a measured historical drawing.
The legacy 0.22 m runtime envelope is retained for animation compatibility.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeDetail_20260906'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from TzmCore import Node, WriteTzm, MATERIAL_NAMES

def Image(name, rgb, colorSpace):
    height, width = rgb.shape[:2]
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = colorSpace
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(SOURCE / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image

def SurfaceMaps():
    """Bake authored wood fibres / iron pores into a compact shared UV atlas."""
    height, half = 1024, 1024
    v, u = np.mgrid[0:height, 0:half].astype(np.float32)
    u /= half - 1; v /= height - 1
    rng = np.random.default_rng(19380317)
    def Field(scaleX, scaleY, layers=8):
        out = np.zeros_like(u)
        for _ in range(layers):
            ax, ay = rng.normal(size=2)
            out += np.sin(2 * math.pi * (u * scaleX * ax + v * scaleY * ay) + rng.random() * 6.28)
        return out / math.sqrt(layers * 2)
    broad = Field(3, 2)
    bend = .011 * np.sin(v*13 + u*5) + .008 * Field(2, 3)
    fibre = np.sin((u + bend) * 610 + .9 * Field(7, 4))
    fine = np.sin((u + bend * .8) * 1720 + Field(20, 7))
    pores = np.maximum(0, fibre - .57)**3
    wear = np.exp(-((v-.50)/.31)**4)
    tone = .05*broad + .025*fibre + .012*fine - .14*pores
    wood = np.stack([.46 + tone, .285 + tone*.72, .142 + tone*.4],axis=-1)
    wood *= (1-.09*wear[:,:,None])
    woodHeight = .22*fibre + .11*fine + .13*Field(45, 11)
    metalMottle = Field(13, 18)
    fineMetal = Field(130, 105,12)
    edge = np.exp(-np.minimum(v,1-v)*125)
    chips = np.clip((Field(23, 4)+edge*2.8-1.35)*1.5,0,1) * np.clip(edge*3,0,1)
    oxide = np.clip(Field(19, 22)-1.1,0,1) * (.2+.8*edge)
    iron = .185 + .014*metalMottle + .011*fineMetal + .19*chips
    metal = np.stack([iron+.065*oxide, iron*.99-.018*oxide, iron*.94-.044*oxide],axis=-1)
    ironHeight = .24*fineMetal + .10*metalMottle - .13*oxide
    base = np.concatenate([wood,metal],axis=1)
    relief = np.concatenate([woodHeight,ironHeight],axis=1)
    dy, dx = np.gradient(relief)
    normal = np.stack([-dx*.5,-dy*.5,np.ones_like(dx)],axis=-1)
    normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    normal = normal*.5+.5
    woodRough = np.clip(.76-.12*wear+.035*broad,.56,.89)
    metalRough = np.clip(.78+.06*metalMottle-.30*chips,.44,.91)
    rough = np.concatenate([woodRough,metalRough],axis=1)
    metallic = np.concatenate([np.zeros_like(u),np.clip(.45+.42*chips-.35*oxide,.08,.87)],axis=1)
    orm = np.stack([np.ones_like(rough),rough,metallic],axis=-1)
    # The selected imagegen albedo is a shipped source asset; preserve it verbatim.
    baseImage=bpy.data.images.load(str(PROJECT/'Texture/Texture_GrenadeBase.webp'),check_existing=True)
    baseImage.colorspace_settings.name='sRGB';baseImage.pack()
    return [baseImage]+[Image('Texture_Grenade'+suffix,array,space) for suffix,array,space in
            [('Normal',normal,'Non-Color'),('Orm',orm,'Non-Color')]]

def Lathe(name, profile, wood=False, segments=64):
    verts, faces, coords = [], [], []
    for k,(z,radius) in enumerate(profile):
        for j in range(segments):
            a = j * math.tau / segments
            # Tiny broad casting / wood-turning imperfections affect the silhouette.
            irregular = 0 if radius == 0 else (.00007 if wood else .00010)*math.sin(5*a+k*.8)*math.sin(k*.77)
            r = radius + irregular
            verts.append((r*math.cos(a),r*math.sin(a),z))
    for k in range(len(profile)-1):
        for j in range(segments):
            j1=(j+1)%segments
            faces.append((k*segments+j,k*segments+j1,(k+1)*segments+j1,(k+1)*segments+j))
            # Atlas gutters avoid cross-material mip bleed.
            x0=.015 if wood else .515
            coords.append([(x0+.47*s/segments, .015+.97*t/(len(profile)-1))
                           for s,t in [(j,k),(j+1,k),(j+1,k+1),(j,k+1)]])
    mesh=bpy.data.meshes.new('Mesh_'+name)
    mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new('Model_'+name,mesh); bpy.context.scene.collection.objects.link(obj)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,uvs in zip(mesh.polygons,coords):
        poly.use_smooth=True
        for loop,co in zip(poly.loop_indices,uvs): uv.data[loop].uv=co
    # Merge the duplicate vertices at the poles, keeping UV corner data.
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    return obj

def BuildGeometry():
    # Z-up modelling coordinates; the head is on +Z for comfortable editing.
    head=Lathe('GrenadeCastHead',[(.046,0),(.046,.017),(.047,.0232),(.049,.0247),
        (.052,.025),(.061,.025),(.077,.025),(.093,.025),(.106,.0249),
        (.1085,.0242),(.11,.0227),(.11,.018),(.11,.010),(.11,0)])
    collar=Lathe('GrenadeCollar',[(.032,0),(.032,.0133),(.033,.0142),(.039,.0144),
        (.043,.016),(.046,.018),(.048,.018),(.049,0)],segments=64)
    handle=Lathe('GrenadeWoodHandle',[(-.104,0),(-.104,.013),(-.102,.014),(-.095,.0142),
        (-.083,.0140),(-.067,.0133),(-.044,.0125),(-.019,.0121),(.004,.0124),
        (.022,.013),(.034,.0133),(.038,.013),(.039,0)],wood=True)
    cap=Lathe('GrenadeHeelCap',[(-.110,0),(-.110,.011),(-.1096,.0135),(-.108,.0143),
        (-.103,.0144),(-.1005,.0141),(-.100,.0135),(-.100,0)],segments=64)
    return head,collar,handle,cap

def JoinGeometry(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    return objects[0]

def TzmRoot(objects):
    root=Node('root');body=root.Child('body')
    for obj in objects:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bm.transform(Matrix.Rotation(math.pi,4,'X'))
        bmesh.ops.translate(bm,verts=list(bm.verts),vec=(0,0,-.035))
        body.Add('grenade',bm,tile='sourceUv')
    body.Child('muzzle',t=(0,0,-.145));body.Child('gripR',t=(0,0,0))
    return root

def Build():
    if any(o.type=='MESH' for o in bpy.context.scene.objects):
        raise RuntimeError('Build requires an empty task scene; do not overwrite another asset')
    SOURCE.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.unit_settings.system='METRIC'
    head,collar,handle,cap=BuildGeometry()
    images=[]
    for suffix in ['Base','Normal','Orm']:
        image=bpy.data.images.load(str(PROJECT/('Texture/Texture_Grenade'+suffix+'.webp')),check_existing=True)
        image.colorspace_settings.name='sRGB' if suffix=='Base' else 'Non-Color'
        image.pack();images.append(image)
    material=bpy.data.materials.new('Material_GongxianGrenade');material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    textures=[]
    for i,image in enumerate(images):
        node=nodes.new('ShaderNodeTexImage');node.image=image;node.location=(-600,300-i*300);textures.append(node)
    links.new(textures[0].outputs['Color'],bsdf.inputs['Base Color'])
    norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.85
    links.new(textures[1].outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
    sep=nodes.new('ShaderNodeSeparateColor');links.new(textures[2].outputs['Color'],sep.inputs['Color'])
    links.new(sep.outputs['Green'],bsdf.inputs['Roughness']);links.new(sep.outputs['Blue'],bsdf.inputs['Metallic'])
    for obj in [head,collar,handle,cap]:obj.data.materials.append(material)
    obj=JoinGeometry([head,collar,handle,cap]);obj.name='Model_GongxianGrenade'
    obj['HistoricalScope']='Pre-1938 Chinese stick-grenade exterior interpretation; batch unverified'
    obj['Reference']='Reference_GrenadeThreeView.png (imagegen); proportions are art interpretation'
    obj['RuntimeAxis']='Head -Z; centred GLB; TZM grip origin offset -0.035m'
    bpy.context.view_layer.update()
    # Export TZM from the SAME mesh and atlas as the GLB.
    root=TzmRoot([obj])
    stats=WriteTzm(root,str(PROJECT/'Model/Grenade.tzm.json'),'Grenade',
        'Authored Gongxian-pattern exterior; imagegen reference; historical batch unverified',audit=True)
    # Blender +Y maps to glTF -Z. Apply the rotation to vertices before export.
    obj.data.transform(Matrix.Rotation(-math.pi/2,4,'X'))
    bpy.ops.export_scene.gltf(filepath=str(PROJECT/'Model/Model_Type24Grenade.glb'),
        export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
        export_animations=False,export_extras=True,export_materials='EXPORT',
        export_image_format='JPEG',export_jpeg_quality=88)
    # Restore the editable upright source pose after the runtime export.
    obj.data.transform(Matrix.Rotation(math.pi/2,4,'X'))
    refPath=SOURCE/'Reference_GrenadeThreeView.png'
    if refPath.exists():
        ref=bpy.data.images.load(str(refPath));ref.pack();ref.use_fake_user=True
    scene=bpy.context.scene
    world=bpy.data.worlds.new('World_GrenadeStudio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.19,.19,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
    cameraData=bpy.data.cameras.new('Camera_GrenadeStudio');camera=bpy.data.objects.new('Camera_GrenadeStudio',cameraData)
    scene.collection.objects.link(camera);camera.location=(.25,-.50,.17)
    camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    cameraData.type='ORTHO';cameraData.ortho_scale=.31;scene.camera=camera
    for name,loc,power,size in [('Key',(.15,-.2,.28),18,.22),('Fill',(-.20,-.10,.06),9,.25),('Rim',(.12,.18,.18),23,.18)]:
        data=bpy.data.lights.new('Light_'+name,'AREA');data.energy=power*.1;data.shape='DISK';data.size=size
        light=bpy.data.objects.new('Light_'+name,data);scene.collection.objects.link(light);light.location=loc
        light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(SOURCE/'Preview_GrenadeStudio.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_GongxianGrenade.blend'))
    report={'tzm':stats,'glbBytes':(PROJECT/'Model/Model_Type24Grenade.glb').stat().st_size,
            'source':bpy.data.filepath}
    (SOURCE/'Data_GrenadeBuild.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    return report

if __name__=='__main__':
    result=Build()
