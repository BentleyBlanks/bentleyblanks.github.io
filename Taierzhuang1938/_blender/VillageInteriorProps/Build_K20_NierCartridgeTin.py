"""K20 selected-A earthenware jar, reproducible source and visibility-optimized GLB.

Build from the repository root in the owned Blender instance through
Script_BlenderMcp.mjs exec --file. The adjacent packing JSON is the approved
pose input. Its two imagegen source PNGs remain under the local asset Source
directory and are checked by SHA256 before the scene is cleared. Set the
K20_ASSET_ROOT environment variable to relocate that local asset directory.
Metres, Blender +Z up/+Y front; glTF +Y up/-Z front. Both state origins are the
bottom centre of the complete state footprint. Source textures and native
projects stay in OneDrive; the adjacent JSON preserves the accepted packing.
The full source packing is retained in .blend. Only surfaces visible above the
ground are exported; occluded buried cartridge surfaces are omitted, not baked
as painted live rounds. Every casing uses the project's HanYang outer envelope.
"""
import bpy
import os
import math
import json
import hashlib
import random
from pathlib import Path
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree

ROOT = Path(os.environ.get('K20_ASSET_ROOT',r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K20_NierCartridgeTin'))
OUT = ROOT / 'Model'
TEX = OUT / 'Textures'
SOURCE = ROOT / 'Source'
VERSION = 'GeometryV8_SurfaceV12'
PACK_VERSION = 9
BUDGET = 2400

def BuildScriptPath():
    source=Path(globals().get('__file__',''))
    if not source.is_file() or source.name!='Build_K20_NierCartridgeTin.py':
        source=Path.cwd()/'Taierzhuang1938/_blender/VillageInteriorProps/Build_K20_NierCartridgeTin.py'
    assert source.is_file(),'Run from the repository root or execute the saved build file'
    return source.resolve()

cachePath=BuildScriptPath().with_name('Data_K20_NierCartridgeTinPacking.json')
assert cachePath.is_file(),'Approved packing input is missing: '+str(cachePath)
packing=json.loads(cachePath.read_text(encoding='utf-8'))
assert packing.get('version')==PACK_VERSION,'Unsupported approved packing version'
assert packing['acceptedContract']['version']==VERSION,'Packing does not match the accepted asset version'
assert len(packing['intact'])==len(packing['overturned'])==packing['sourceCount']==150
for sourceInput in packing['acceptedContract']['sourceInputs']:
    sourcePath=ROOT/sourceInput['relativePath']
    assert sourcePath.is_file(),'Local reconstruction input is missing: '+str(sourcePath)
    assert hashlib.sha256(sourcePath.read_bytes()).hexdigest()==sourceInput['sha256'],'Reconstruction input differs from the accepted source: '+str(sourcePath)

for folder in (OUT, TEX, SOURCE):
    folder.mkdir(parents=True, exist_ok=True)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
for otherScene in list(bpy.data.scenes):
    if otherScene != scene:
        bpy.data.scenes.remove(otherScene)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
scene.name = 'Scene_K20_NierCartridgeTin'
for pool in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
    for block in list(pool):
        if block.users == 0:
            pool.remove(block)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene['AssetConvention'] = 'metres; Y-up/-Z front GLB; state bottom-centre origins'
scene['CreativeInference'] = 'A jar shape, surface wear and packing are reconstruction, not a county-gazetteer artifact'
scene['GeometryVersion'] = VERSION

def ImageFromArray(name, data, noncolor=False):
    height, width, channels = data.shape
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(data[:, :, :3], 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(TEX / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image

def NormalPixels(height, strength):
    nx = -(np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    ny = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    length = np.sqrt(nx * nx + ny * ny + 1)
    return np.stack((nx / length * .5 + .5, ny / length * .5 + .5, 1 / length * .5 + .5), axis=2)

def SurfaceMaterial(name, baseImage, roughImage, normalImage, metallic=0, normalStrength=1, baseFactor=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = metallic
    for image, socket in ((baseImage, 'Base Color'), (roughImage, 'Roughness')):
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        if socket == 'Base Color' and baseFactor:
            multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB')
            multiply.blend_type='MULTIPLY'
            multiply.inputs[0].default_value=1
            multiply.inputs[2].default_value=(*baseFactor,1)
            mat.node_tree.links.new(tex.outputs['Color'],multiply.inputs[1])
            mat.node_tree.links.new(multiply.outputs['Color'],shader.inputs[socket])
        else:
            mat.node_tree.links.new(tex.outputs['Color'], shader.inputs[socket])
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = normalImage
    normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = normalStrength
    mat.node_tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    return mat

# A genuine imagegen clay base, plus restrained data maps for real light response.
clayPath = SOURCE / 'Texture_K20_ReferenceClayV10.png'
assert clayPath.is_file(), 'Local reconstruction input is missing: ' + str(clayPath)
clayBase = bpy.data.images.load(str(clayPath), check_existing=False)
clayBase.name = 'Source_K20_CeramicScan'
clayBase.scale(1024,1024)
width, height = clayBase.size
raw = np.array(clayBase.pixels[:], dtype=np.float32).reshape(height, width, 4)
raw=np.roll(np.tile(raw[:,:,:3],(1,3,1)),256,axis=1)
# The material is reconstructed from the selected A surface, including its
# broad fired-grey islands and pale scraped clay, rather than generic sand.
meanColour=raw.mean(axis=(0,1),keepdims=True)
toned=meanColour+(raw-meanColour)*.885
calibrated=toned*np.array((.600,.585,.555),dtype=np.float32)
clayBase=ImageFromArray('Texture_K20_CeramicBase',calibrated)
luma=raw.mean(axis=2)
small = (luma + np.roll(luma,1,0) + np.roll(luma,-1,0) +
         np.roll(luma,1,1) + np.roll(luma,-1,1)) / 5
low=small.copy()
for step in (1,2,4,8,16):
    low=(low+np.roll(low,step,0)+np.roll(low,-step,0)+np.roll(low,step,1)+np.roll(low,-step,1))/5
relief=small-low
bright=np.clip((small-.30)/.40,0,1)
rough = np.clip(.97-.14*bright, .82, .99)
clayRough = ImageFromArray('Texture_K20_CeramicRoughness', np.repeat(rough[:,:,None],3,axis=2), True)
clayNormal = ImageFromArray('Texture_K20_CeramicNormal', NormalPixels(relief, 5.5), True)
ceramic = SurfaceMaterial('HouseholdCeramic_K20_WornClay', clayBase, clayRough, clayNormal, normalStrength=.95)
ceramic['ProjectBase'] = 'HouseholdCeramic / matte earthenware; imagegen surface replaces masonry image'

rng = np.random.default_rng(79257)
size = 512
yy, xx = np.mgrid[0:size,0:size] / size
noise = rng.standard_normal((size,size)).astype(np.float32)
broad = noise.copy()
for i in range(14):
    broad = (broad + np.roll(broad,1,0)+np.roll(broad,-1,0)+np.roll(broad,1,1)+np.roll(broad,-1,1))/5
broad = broad / max(broad.std(),1e-8)
oxide = np.clip(.24 + broad*.16 + .07*np.sin(xx*math.tau*5 + yy*19),0,.72)
neckSoot = np.clip(1-yy/.11,0,1)*.23
brassPath=SOURCE/'Texture_K20_SpentBrassSource.png'
assert brassPath.is_file(),'Local brass source is missing: '+str(brassPath)
brassScan=bpy.data.images.load(str(brassPath),check_existing=False)
brassScan.name='Source_K20_SpentBrassScan';brassScan.scale(size,size)
brassPixels=np.array(brassScan.pixels[:],dtype=np.float32).reshape(size,size,4)[:,:,:3]
base=brassPixels*.72*(1-neckSoot*.55)[:,:,None]
rough=np.clip(.48+(.45-brassPixels.mean(axis=2))*.35+neckSoot*.3,.42,.78)
brassHeight=noise*.002+.005*np.sin(xx*math.tau*240)
# The last quarter of the atlas carries a neutral circular case head/primer.
for cx in (.25,.75):
    radius = np.sqrt((xx-cx)**2+(yy-.86)**2)
    mask = (radius < .115) & (yy > .73)
    ring = np.exp(-((radius-.035)/.0028)**2)
    firingPin=np.exp(-(radius/.010)**2) if cx==.25 else np.zeros_like(radius)
    for channel,value in enumerate((.30,.225,.125)):
        base[:,:,channel][mask] = (value*(1-.18*ring-.22*firingPin)+noise*.002)[mask]
    rough[mask] = (.42+.09*ring+.07*firingPin)[mask]
    brassHeight[mask] = (-ring*.04-firingPin*.10)[mask]
brassBase = ImageFromArray('Texture_K20_SpentBrassBase',base)
brassRough = ImageFromArray('Texture_K20_SpentBrassRoughness',np.repeat(rough[:,:,None],3,axis=2),True)
brassNormal = ImageFromArray('Texture_K20_SpentBrassNormal',NormalPixels(brassHeight,.8),True)
brass = SurfaceMaterial('VmBrass_K20_FiredPatina',brassBase,brassRough,brassNormal,.95,.55)

jarProfile = [
    (0,0),(.046,0),(.050,.006),(.061,.024),(.070,.050),(.074,.080),
    (.072,.105),(.066,.122),(.056,.133),(.055,.139),(.060,.141),
    (.061,.145),(.059,.149),(.055,.150),(.049,.148),(.047,.144),
    (.066,.105),(.067,.064),(.041,.010),(0,.010),
]
# Existing HanYang/ZhongZheng envelope from FPS_RELOAD_PROPS and
# Script_Viewmodel._SpentCaseGeometry, with deep inner neck and extractor groove.
caseProfile = [
    (0,.012),(.00425,.012),(.00425,0),(.00455,0),(.00455,.008),
    (.005593,.013),(.00595,.052),(.00535,.0535),(.00595,.055),
    (.00595,.057),(0,.057),
]

def LatheMesh(name, profile, sides, clay=False):
    vertices, rings = [], []
    for radius,z in profile:
        if radius == 0:
            rings.append([len(vertices)])
            vertices.append((0,0,z))
        else:
            ring=[]
            for index in range(sides):
                angle=math.tau*index/sides
                warp=1+.0035*math.cos(3*angle+.4)+.002*math.cos(5*angle+z*21) if clay else 1
                ring.append(len(vertices))
                vertices.append((radius*warp*math.cos(angle),radius*warp*math.sin(angle),z))
            rings.append(ring)
    faces=[]
    for first,second in zip(rings,rings[1:]):
        for index in range(sides):
            other=(index+1)%sides
            if len(first)==1: faces.append((first[0],second[other],second[index]))
            elif len(second)==1: faces.append((first[index],first[other],second[0]))
            else: faces.append((first[index],first[other],second[other],second[index]))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    import bmesh
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for loopIndex in poly.loop_indices:
            vertex=mesh.vertices[mesh.loops[loopIndex].vertex_index].co
            if not clay and abs(poly.normal.z)>.99:
                centre=.25 if vertex.z>.05 else .75
                texUv=(centre+vertex.x/.00595*.105,.86+vertex.y/.00595*.105)
            else:
                angle=math.atan2(vertex.y,vertex.x)/math.tau%1
                others=[math.atan2(mesh.vertices[v].co.y,mesh.vertices[v].co.x)/math.tau%1 for v in poly.vertices]
                if max(others)-min(others)>.5 and angle<.5: angle+=1
                texUv=(angle,vertex.z/.15) if clay else (angle,vertex.z/.057*.72)
            uv.data[loopIndex].uv=texUv
    if hasattr(mesh,'set_sharp_from_angle'):
        mesh.set_sharp_from_angle(angle=math.radians(55))
    mesh.materials.append(ceramic if clay else brass)
    return mesh

jarMesh=LatheMesh('K20_JarSourceMesh',jarProfile,24,True)
caseMesh=LatheMesh('K20_SpentCaseSourceMesh',caseProfile,10)
caseMesh.calc_loop_triangles()

def ObjectFromMesh(name,mesh,collection=None):
    obj=bpy.data.objects.new(name,mesh)
    (collection or scene.collection).objects.link(obj)
    return obj

def AddRigid(obj,passive=False,mesh=False):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.rigidbody.object_add()
    rb=obj.rigid_body
    rb.type='PASSIVE' if passive else 'ACTIVE'
    rb.collision_shape='MESH' if mesh else 'CONVEX_HULL'
    rb.use_margin=True
    rb.collision_margin=.00008*20
    rb.friction=.65
    rb.restitution=0
    if not passive:
        rb.mass=.012
        rb.linear_damping=.35
        rb.angular_damping=.45
    return rb

def SimulatePacking(jarPosition,jarRotation,initial,countFrames=420,fixedCount=0):
    scale=20
    previous=bpy.context.window.scene
    physics=bpy.data.scenes.new('K20_PackingTransient')
    bpy.context.window.scene=physics
    physics.gravity=(0,0,-9.81*scale)
    pot=bpy.data.objects.new('PhysicsJar',jarMesh)
    physics.collection.objects.link(pot)
    pot.location=Vector(jarPosition)*scale
    pot.rotation_mode='QUATERNION';pot.rotation_quaternion=jarRotation
    pot.scale=(scale,)*3
    AddRigid(pot,True,True)
    bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.00025*scale))
    ground=bpy.context.object
    AddRigid(ground,True,True)
    # Bullet uses the object origin as centre of mass. The game profile's
    # origin is its open mouth, so centre a private collider before simulation.
    physicsCaseMesh=caseMesh.copy()
    for vertex in physicsCaseMesh.vertices:
        vertex.co.z-=.0285
    physicsCaseMesh.update()
    objects=[]
    for index,(position,rotation) in enumerate(initial):
        obj=bpy.data.objects.new('PhysicsCase_%03d'%index,physicsCaseMesh)
        physics.collection.objects.link(obj)
        obj.location=(Vector(position)+Quaternion(rotation)@Vector((0,0,.0285)))*scale
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Quaternion(rotation)
        obj.scale=(scale,)*3
        AddRigid(obj,passive=index<fixedCount)
        objects.append(obj)
    world=physics.rigidbody_world
    world.substeps_per_frame=24
    world.solver_iterations=45
    world.point_cache.frame_start=1
    world.point_cache.frame_end=countFrames
    physics.render.fps=60
    for frame in range(1,countFrames+1):
        physics.frame_set(frame)
    graph=bpy.context.evaluated_depsgraph_get()
    result=[]
    for obj in objects:
        matrix=obj.evaluated_get(graph).matrix_world.copy()
        rotation=matrix.to_quaternion().normalized()
        position=matrix.translation/scale-rotation@Vector((0,0,.0285))
        result.append((list(position),list(rotation)))
    bpy.context.window.scene=previous
    for obj in list(physics.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(physics)
    bpy.data.meshes.remove(physicsCaseMesh)
    return result

def AuthorRimCasings(previous):
    """Arrange three readable empty mouths with actual collision clearance.

    These are deliberately arranged collected casings, rather than allowing
    gravity to flatten every top piece. Each search descends a rigid casing to
    first contact, rejects intersections, and favours simultaneous pile/rim
    contact. The spilled state retains its settled physical arrangement.
    """
    caseTriangles=[tuple(triangle.vertices) for triangle in caseMesh.loop_triangles]
    jarMesh.calc_loop_triangles()
    jarTree=BVHTree.FromPolygons([v.co.copy() for v in jarMesh.vertices],
                               [tuple(t.vertices) for t in jarMesh.loop_triangles],all_triangles=True)
    old=previous['intact']
    ranked=sorted(old,key=lambda item:max((Quaternion(item[1])@v.co).z+item[0][2] for v in caseMesh.vertices))
    fixed=list(ranked[:-3]);notes=[]
    for degrees in (145,90,35):
        vertices=[];triangles=[]
        for position,rotation in fixed:
            offset=len(vertices);quat=Quaternion(rotation);origin=Vector(position)
            vertices.extend(quat@v.co+origin for v in caseMesh.vertices)
            triangles.extend(tuple(offset+i for i in tri) for tri in caseTriangles)
        pileTree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
        offset=len(vertices);vertices.extend(v.co.copy() for v in jarMesh.vertices)
        triangles.extend(tuple(offset+i for i in tri.vertices) for tri in jarMesh.loop_triangles)
        allTree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
        angle=math.radians(degrees);radial=Vector((math.cos(angle),math.sin(angle),0))
        def Candidate(tilt,radius):
            a=math.radians(tilt)
            direction=-radial*math.sin(a)+Vector((0,0,-math.cos(a)))
            quat=Vector((0,0,1)).rotation_difference(direction)
            base=[quat@v.co+radial*radius for v in caseMesh.vertices]
            def Intersects(z):
                points=[point+Vector((0,0,z)) for point in base]
                return bool(BVHTree.FromPolygons(points,caseTriangles,all_triangles=True).overlap(allTree))
            clear=.25;hit=None
            for step in range(1,151):
                z=.25-step*.001
                if Intersects(z):hit=z;break
                clear=z
            if hit is None:return None
            for iteration in range(6):
                middle=(clear+hit)*.5
                if Intersects(middle):hit=middle
                else:clear=middle
            z=clear+.000015
            points=[point+Vector((0,0,z)) for point in base]
            samples=points+[sum((points[i] for i in triangle),Vector())/3 for triangle in caseTriangles]
            jarGap=min(jarTree.find_nearest(point)[3] for point in samples)
            pileGap=min(pileTree.find_nearest(point)[3] for point in samples)
            penalty=max(.172-z,0)*10000+max(z-.195,0)*10000
            score=max(jarGap,pileGap)*1000+abs(z-.182)*20+penalty
            return {'score':score,'tilt':tilt,'radius':radius,'mouthZ':z,'jarGap':jarGap,'pileGap':pileGap,
                    'position':list(radial*radius+Vector((0,0,z))),'rotation':list(quat)}
        results=[Candidate(tilt,radius) for tilt in (25,30,35,40,45) for radius in (.055,.060,.065,.070,.075)]
        best=min((item for item in results if item),key=lambda item:item['score'])
        refined=[Candidate(best['tilt']+d,best['radius']+r) for d in (-3,-1.5,0,1.5,3) for r in (-.002,-.001,0,.001,.002)]
        best=min([best]+[item for item in refined if item],key=lambda item:item['score'])
        assert .17<best['mouthZ']<.20 and max(best['jarGap'],best['pileGap'])<.003,(degrees,best)
        fixed.append((best['position'],best['rotation']))
        notes.append({key:value for key,value in best.items() if key not in ('rotation','position')})
    result=dict(previous);result['intact']=fixed;result['rimArrangement']=notes;result['version']=PACK_VERSION
    return result

print('K20_PACKING',packing['sourceCount'],flush=True)

sourceCollection=bpy.data.collections.new('K20_FullPackingSource')
scene.collection.children.link(sourceCollection)
stateData={}
for label in ('Intact','Overturned'):
    root=bpy.data.objects.new('NierCartridgeTin_'+label,None)
    scene.collection.objects.link(root)
    root.empty_display_size=.02
    root['Version']=VERSION
    pot=ObjectFromMesh(label+'_Jar',jarMesh.copy())
    pot.parent=root
    if label=='Overturned':
        pot.location=packing['fallenJarPosition']
        pot.rotation_mode='QUATERNION';pot.rotation_quaternion=packing['fallenJarRotation']
        oldHeight=pot.location.z
        pot.location.z=-min((pot.rotation_quaternion@vertex.co).z for vertex in pot.data.vertices)
        packingHeightCorrection=pot.location.z-oldHeight
    cases=[]
    for index,(position,rotation) in enumerate(packing[label.lower()]):
        obj=ObjectFromMesh(label+'_SourceSpentCase_%03d'%index,caseMesh,sourceCollection)
        obj.location=position;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=rotation
        if label=='Overturned':
            centre=Vector(position)+Quaternion(rotation)@Vector((0,0,.0285))
            if centre.x<.16 and abs(centre.y)<.076 and centre.z>.025:
                obj.location.z+=packingHeightCorrection
        cases.append(obj)
    stateData[label]={'root':root,'pot':pot,'cases':cases}

def VisibilityMesh(label,pot,cases,protectedNames=None):
    bpy.context.view_layer.update()
    vertices=[];triangles=[]
    for obj in [pot]+cases:
        mesh=obj.data
        mesh.calc_loop_triangles()
        offset=len(vertices)
        vertices.extend(obj.matrix_world@v.co for v in mesh.vertices)
        triangles.extend(tuple(offset+v for v in tri.vertices) for tri in mesh.loop_triangles)
    # The underside is never visible after placement on the ground.
    offset=len(vertices)
    vertices.extend([Vector((-5,-5,-.0003)),Vector((5,-5,-.0003)),Vector((5,5,-.0003)),Vector((-5,5,-.0003))])
    triangles.extend([(offset,offset+1,offset+2),(offset,offset+2,offset+3)])
    tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True,epsilon=0)
    directions=[Vector((0,0,1))]
    for elevation in (3,12,25,40,58,75):
        angle=math.radians(elevation)
        for azimuthIndex in range(24):
            azimuth=math.tau*azimuthIndex/24
            directions.append(Vector((math.cos(azimuth)*math.cos(angle),math.sin(azimuth)*math.cos(angle),math.sin(angle))))
    records=[([],[],[],[]),([],[],[],[])]
    def Importance(index):
        obj=cases[index]
        coords=[obj.matrix_world@v.co for v in obj.data.vertices]
        if label=='Intact': return max(p.z for p in coords)
        return max(p.x for p in coords)
    protected=({index for index,obj in enumerate(cases) if obj.name in protectedNames}
               if protectedNames else set(sorted(range(len(cases)),key=Importance,reverse=True)[:7]))
    visiblePerCase=[]
    for caseIndex,obj in enumerate(cases):
        outVertices,outFaces,outUvs,outNormals=records[0 if caseIndex in protected else 1]
        mesh=obj.data
        rotation=obj.matrix_world.to_3x3()
        world=[obj.matrix_world@v.co for v in mesh.vertices]
        uv=mesh.uv_layers.active.data
        kept=0
        for poly in mesh.polygons:
            points=[world[index] for index in poly.vertices]
            normal=(rotation@poly.normal).normalized()
            centre=sum(points,Vector())/len(points)
            samples=[centre]+[centre*.35+point*.65 for point in points]
            visible=False
            for direction in directions:
                if direction.dot(normal)<.035:
                    continue
                for sample in samples:
                    hit=tree.ray_cast(sample+normal*.000006,direction,.8)[0]
                    if hit is None:
                        visible=True;break
                if visible:break
            if not visible:continue
            start=len(outVertices)
            outVertices.extend(points)
            outFaces.append(tuple(range(start,start+len(points))))
            outUvs.append([tuple(uv[index].uv) for index in poly.loop_indices])
            outNormals.append([tuple((rotation@mesh.corner_normals[index].vector).normalized()) for index in poly.loop_indices])
            kept+=len(points)-2
        visiblePerCase.append(kept)
    objects=[]
    for suffix,(outVertices,outFaces,outUvs,outNormals) in zip(('Protected','Secondary'),records):
        mesh=bpy.data.meshes.new(label+'_'+suffix+'SpentCasesMesh')
        mesh.from_pydata(outVertices,[],outFaces);mesh.update()
        mesh.materials.append(brass)
        uv=mesh.uv_layers.new(name='UVMap')
        normals=[]
        for poly,uvs,norms in zip(mesh.polygons,outUvs,outNormals):
            poly.use_smooth=True
            for loopIndex,texUv,normal in zip(poly.loop_indices,uvs,norms):
                uv.data[loopIndex].uv=texUv
                normals.append(normal)
        mesh.normals_split_custom_set(normals)
        objects.append(ObjectFromMesh(label+'_'+suffix+'SpentCases',mesh))
    return objects[0],objects[1],visiblePerCase,[obj for index,obj in enumerate(cases) if index not in protected],[obj for index,obj in enumerate(cases) if index in protected]

def BakePackedBed(label,pot,sourceCases,allCases,triangleBudget):
    """A connected, normal-baked LOD for the secondary casing pile.

    This replaces destructive collapse of many disconnected thin tubes. The
    complete reused casing geometry remains in the editable source collection.
    """
    vertices=[];faces=[]
    for obj in sourceCases:
        offset=len(vertices)
        vertices.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset+index for index in poly.vertices) for poly in obj.data.polygons)
    mesh=bpy.data.meshes.new(label+'_PackedBedMesh')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    target=ObjectFromMesh(label+'_PackedBed',mesh)
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True);bpy.context.view_layer.objects.active=target
    remesh=target.modifiers.new('ConnectedPackingEnvelope','REMESH')
    remesh.mode='VOXEL';remesh.voxel_size=.0035;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    # Only the part near the aperture can be seen; its lower boundary is buried
    # behind the ceramic wall, rather than being exposed as an artificial shelf.
    import bmesh
    bm=bmesh.new();bm.from_mesh(target.data)
    inverse=pot.matrix_world.inverted()
    buried=[face for face in bm.faces if max((inverse@vertex.co).z for vertex in face.verts)<.102]
    bmesh.ops.delete(bm,geom=buried,context='FACES')
    bm.to_mesh(target.data);bm.free();target.data.update()
    triangles=sum(len(poly.vertices)-2 for poly in target.data.polygons)
    if triangles>triangleBudget:
        modifier=target.modifiers.new('PackedBedLod','DECIMATE')
        modifier.ratio=max(.001,(triangleBudget-8)/triangles)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm=bmesh.new();bm.from_mesh(target.data)
    bmesh.ops.dissolve_degenerate(bm,dist=1e-8,edges=list(bm.edges))
    bm.to_mesh(target.data);bm.free()
    target.data.validate(verbose=False,clean_customdata=True)
    target.data.update(calc_edges=True)
    for poly in target.data.polygons:poly.use_smooth=True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    target.data.validate(verbose=False,clean_customdata=True)
    target.data.update()
    placeholder=bpy.data.materials.new(label+'_BakeTarget')
    placeholder.use_nodes=True
    target.data.materials.clear();target.data.materials.append(placeholder)
    textureNode=placeholder.node_tree.nodes.new('ShaderNodeTexImage')
    placeholder.node_tree.nodes.active=textureNode
    images={}
    for suffix,noncolor in (('Base',False),('Roughness',True),('Normal',True),('Ao',True)):
        image=bpy.data.images.new('Texture_K20_'+label+'Packed'+suffix,width=512,height=512,alpha=False)
        image.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
        images[suffix]=image
    visibility={obj:obj.hide_render for obj in scene.objects}
    allowed=set(allCases+[pot,target])
    for obj in scene.objects:obj.hide_render=obj not in allowed
    tree=brass.node_tree
    output=tree.nodes.get('Material Output')
    shader=tree.nodes.get('Principled BSDF')
    surfaceLink=[(link.from_socket,link.to_socket) for link in output.inputs['Surface'].links]
    emission=tree.nodes.new('ShaderNodeEmission')
    scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.seed=79257
    scene.cycles.use_animated_seed=False
    def Bake(kind,suffix):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in sourceCases:obj.select_set(True)
        target.select_set(True);bpy.context.view_layer.objects.active=target
        textureNode.image=images[suffix]
        placeholder.node_tree.nodes.active=textureNode
        bpy.ops.object.bake(type=kind,use_selected_to_active=True,margin=8,
                            cage_extrusion=.012,max_ray_distance=.03,normal_space='TANGENT')
    try:
        for suffix,socket in (('Base','Base Color'),('Roughness','Roughness')):
            for link in list(output.inputs['Surface'].links):tree.links.remove(link)
            for link in list(emission.inputs['Color'].links):tree.links.remove(link)
            tree.links.new(shader.inputs[socket].links[0].from_socket,emission.inputs['Color'])
            tree.links.new(emission.outputs['Emission'],output.inputs['Surface'])
            Bake('EMIT',suffix)
        for link in list(output.inputs['Surface'].links):tree.links.remove(link)
        for first,second in surfaceLink:tree.links.new(first,second)
        Bake('NORMAL','Normal')
        scene.cycles.samples=16
        Bake('AO','Ao')
        # Deep inter-case occlusion belongs to this packed LOD. Multiplication
        # retains the selected source's colour while keeping hidden gaps dark.
        basePixels=np.array(images['Base'].pixels[:],dtype=np.float32).reshape(512,512,4)
        aoPixels=np.array(images['Ao'].pixels[:],dtype=np.float32).reshape(512,512,4)
        basePixels[:,:,:3]*=np.clip(aoPixels[:,:,:3],0,1)**.65
        images['Base'].pixels.foreach_set(basePixels.ravel())
    finally:
        for link in list(output.inputs['Surface'].links):tree.links.remove(link)
        for first,second in surfaceLink:tree.links.new(first,second)
        tree.nodes.remove(emission)
        for obj,hidden in visibility.items():obj.hide_render=hidden
    for suffix,image in images.items():
        image.filepath_raw=str(TEX/(image.name+'.png'));image.file_format='PNG'
        image.save();image.pack()
    material=SurfaceMaterial('VmBrass_K20_PackedBed_'+label,images['Base'],images['Roughness'],images['Normal'],.95,1)
    target.data.materials.clear();target.data.materials.append(material)
    return target

for label,data in stateData.items():
    gameCases=data['cases']
    protectedNames=None
    if label=='Overturned':
        # A static game LOD keeps a legible group of eight spilled casings near
        # the mouth. Distant minor spill instances remain in the full source,
        # rather than collapsing all of them into broken triangular needles.
        bpy.context.view_layer.update()
        inside=[];outside=[]
        for obj in gameCases:
            centre=obj.matrix_world@Vector((0,0,.0285))
            if centre.x>.16 or abs(centre.y)>.076 or centre.x<-.02 or (centre.z<.025 and centre.x>.08):
                outside.append(obj)
            else:
                inside.append(obj)
        outside.sort(key=lambda obj:((obj.matrix_world@Vector((0,0,.0285)))-Vector((.19,0,.025))).length)
        gameCases=inside+outside[:8]
        protectedNames={obj.name for obj in outside[:8]}
        data['omittedMinorSpillCases']=len(outside[8:])
    protected,secondary,counts,secondarySources,primarySources=VisibilityMesh(label,data['pot'],gameCases,protectedNames)
    data['caseVisibleTriangles']=counts
    data['primarySources']=primarySources
    # Any remaining simplification preserves open boundaries and prioritizes the
    # mouth and case-head parts of the atlas; source full geometry is unchanged.
    potTriangles=sum(len(p.vertices)-2 for p in data['pot'].data.polygons)
    available=BUDGET-potTriangles
    protectedTriangles=sum(len(p.vertices)-2 for p in protected.data.polygons)
    secondaryTriangles=sum(len(p.vertices)-2 for p in secondary.data.polygons)
    availableSecondary=available-protectedTriangles
    assert availableSecondary>0,(label,protectedTriangles,available)
    bpy.data.objects.remove(secondary,do_unlink=True)
    bed=BakePackedBed(label,data['pot'],secondarySources,data['cases'],availableSecondary)
    protected.name=label+'_PrimarySpentCases';protected.parent=data['root']
    bed.parent=data['root']
    data['visible']=protected;data['bed']=bed
    print('K20_VISIBLE',label,potTriangles,protectedTriangles,secondaryTriangles,flush=True)

# Hide the editable full internal packing from the game roots. It remains in
# the source .blend as evidence and to permit re-exporting at a different LOD.
def MeshPoints(objects):
    # Only indexed vertices survive glTF export; ignore any unused vertices
    # left by visibility clipping or decimation when finding placement bounds.
    return [obj.matrix_world@obj.data.vertices[index].co for obj in objects
            for index in {i for poly in obj.data.polygons for i in poly.vertices}]
def Audit(objects):
    bpy.context.view_layer.update()
    points=MeshPoints(objects)
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    return {'blenderMin':lo,'blenderMax':hi,'dimensionsMetres':[hi[i]-lo[i] for i in range(3)],
            'triangles':sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in objects),
            'materials':sorted({mat.name for obj in objects for mat in obj.data.materials}),
            'meshNames':[obj.name for obj in objects]}

def SupportAudit(pot,cases,primaries):
    result=[]
    for primary in primaries:
        vertices=[];faces=[]
        for obj in [pot]+[case for case in cases if case!=primary]:
            offset=len(vertices)
            obj.data.calc_loop_triangles()
            vertices.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
            faces.extend(tuple(offset+index for index in triangle.vertices) for triangle in obj.data.loop_triangles)
        tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
        samples=[primary.matrix_world@vertex.co for vertex in primary.data.vertices]
        samples.extend(primary.matrix_world@poly.center for poly in primary.data.polygons)
        minimumZ=min(point.z for point in samples)
        surface=min(tree.find_nearest(point)[3] for point in samples)
        gap=min(abs(minimumZ),surface)
        result.append({'name':primary.name,'minimumZMetres':minimumZ,
                       'nearestOtherSurfaceMetres':surface,'supportGapMetres':gap,
                       'withinOneMillimetre':gap<=.001})
    return result

report={'asset':'K20_NierCartridgeTin','selection':'A','version':VERSION,
        'budgetPerState':BUDGET,'jarHeightMetres':.15,'caseLengthMetres':.057,
        'sourceCaseCountPerState':packing['sourceCount'],'states':{},
        'sourceTexture':str(clayPath),'sourceTextureSha256':hashlib.sha256(clayPath.read_bytes()).hexdigest(),
        'brassSourceTexture':str(brassPath),'brassSourceTextureSha256':hashlib.sha256(brassPath.read_bytes()).hexdigest(),
        'packingCache':str(cachePath),'packingCacheSha256':hashlib.sha256(cachePath.read_bytes()).hexdigest(),
        'surfaceOptimization':'Primary cases retain hollow geometry; secondary pile uses a connected albedo/roughness/normal/AO-baked LOD; occluded faces and minor distant spill instances are omitted; full packing retained in source collection',
        'coordinateConvention':'metres; glTF Y-up/-Z front; each state bottom-centre root'}
for label,data in stateData.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (data['pot'],data['visible'],data['bed']):obj.select_set(True)
    bpy.context.view_layer.objects.active=data['pot']
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.context.view_layer.update()
    points=MeshPoints([data['pot'],data['visible'],data['bed']])
    shift=Vector(((min(p.x for p in points)+max(p.x for p in points))*.5,
                  (min(p.y for p in points)+max(p.y for p in points))*.5,
                  min(p.z for p in points)))
    for obj in (data['pot'],data['visible'],data['bed']):
        for vertex in obj.data.vertices:vertex.co-=shift
        obj.data.update()
    for obj in data['cases']:
        obj.location-=shift
    state=Audit([data['pot'],data['visible'],data['bed']])
    state['originShiftBlenderMetres']=list(shift)
    state['nodes']={obj.name:Audit([obj]) for obj in (data['pot'],data['visible'],data['bed'])}
    state['primaryCaseContacts']=SupportAudit(data['pot'],data['cases'],data['primarySources'])
    state['fullSourceCaseTriangles']=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in data['cases'])
    state['visibleSourceCases']=sum(count>0 for count in data['caseVisibleTriangles'])
    state['omittedMinorSpillCases']=data.get('omittedMinorSpillCases',0)
    state['rootName']=data['root'].name
    assert state['triangles']<=BUDGET,(label,state['triangles'])
    report['states'][data['root'].name]=state

sourceCollection.hide_render=True
sourceCollection.hide_viewport=True
for data in stateData.values():
    for obj in data['cases']:obj.hide_render=True

bpy.ops.object.select_all(action='DESELECT')
for data in stateData.values():
    for obj in (data['root'],data['pot'],data['visible'],data['bed']):
        obj.select_set(True)
bpy.context.view_layer.objects.active=stateData['Intact']['root']
glb=OUT/'Model_K20_NierCartridgeTin.glb'
# Preserve the approved asset's authoring label in exported extras. The live
# instance keeps its actual ownership label after export; changing --task must
# not change an otherwise identical GLB.
runtimeTask=scene.get('BlenderMcpTask')
scene['BlenderMcpTask']=packing['acceptedContract']['exportSceneAuthoringTask']
try:
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
        export_yup=True,export_animations=False,export_extras=True,export_texcoords=True,
        export_normals=True,export_tangents=True)
finally:
    if runtimeTask is None:del scene['BlenderMcpTask']
    else:scene['BlenderMcpTask']=runtimeTask
report['glb']=str(glb);report['glbBytes']=glb.stat().st_size
report['sha256']=hashlib.sha256(glb.read_bytes()).hexdigest()
(OUT/'Data_K20_ModelAudit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for obj in (stateData['Overturned']['root'],stateData['Overturned']['pot'],stateData['Overturned']['visible'],stateData['Overturned']['bed']):
    obj.hide_render=True;obj.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
stateData['Intact']['root'].select_set(True)
bpy.context.view_layer.objects.active=stateData['Intact']['root']
if bpy.context.screen:
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=Vector((0,0,.09))
            space.region_3d.view_distance=.34
            space.region_3d.view_rotation=Vector((.26,.32,.24)).to_track_quat('Z','Y')
            space.region_3d.view_perspective='PERSP'
            space.shading.type='MATERIAL'
            space.shading.use_scene_lights=False
            space.shading.use_scene_world=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'K20_NierCartridgeTin.blend'))
print('K20_AUDIT '+json.dumps(report,ensure_ascii=False))
