"""Rebuild K10 from an empty Blender scene. Output is kept outside the repository.

Run through scripts/Script_BlenderMcp.mjs exec --file <this file>.
The local TextureSource_BambooLamellae.png and system Python with Pillow and
NumPy are required; the script regenerates all texture inputs before building.
Concept: K10_B_v2; historical bamboo use is documented, geometry is a reconstruction.
Historical source: https://shandong-chorography.org/database/c46/section/3/article/352/
The gazetteer supports past bamboo steaming use; this weave, size and finish are
design reconstruction. The approved GLB/source images remain in local OneDrive.
"""
import bpy
import math
import os
import random
import subprocess
import numpy as np
from mathutils import Vector

OUT = os.environ.get('K10_OUTPUT_DIR', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K10_BambooSteamingRack')
os.makedirs(OUT, exist_ok=True)
SURFACE_CODE = r'''
"""Bamboo skin/exposed-fiber atlas, based on the reviewed LocalPass04 method."""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import math
import random
import sys
import json
import hashlib
import numpy as np

output = Path(sys.argv[1])
sourcePath = output / 'TextureSource_BambooLamellae.png'
expectedSourceSha256 = 'c32aff1cd01d8bd223b3de73d0de9571ceb1eef4a5bc0c7b08235cfae2414119'
if hashlib.sha256(sourcePath.read_bytes()).hexdigest() != expectedSourceSha256:
    raise ValueError('K10 raw source does not match the user-approved material input')
source = Image.open(sourcePath).convert('RGB')
width, bandHeight, stripCount = 1536, 128, 26
geometryRng = random.Random(1010)
stripWidths = [.023 * geometryRng.uniform(.95, 1.04) for _ in range(stripCount)]
positions = [(index-6)*.045 for index in range(13)]
pickRng = np.random.default_rng(68102)
nodeXs = [780, 360, 1020, 360, 950, 360, 850, 360]

def SampleSwatch(index, left, sampleWidth, reverse=False):
    top = int(round(index*source.height/8))+8
    bottom = int(round((index+1)*source.height/8))-9
    image = source.crop((left, top, left+sampleWidth, bottom)).resize((width, bandHeight), Image.Resampling.LANCZOS)
    if reverse: image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return image, [left, top, left+sampleWidth, bottom]

def ToSrgb(linear):
    return np.where(linear<=.0031308, linear*12.92, 1.055*np.maximum(linear,0)**(1/2.4)-.055)

def ReliefMaps(albedo, state, length, breadth, seed, nodeU, reliefScale=1.0, trim=False):
    rng = np.random.default_rng(seed)
    grain = np.convolve(rng.normal(0,1,bandHeight), [.22,.56,.22], mode='same')
    grain -= grain.mean()
    along = np.interp(np.arange(width), np.linspace(0,width-1,33), rng.uniform(.55,1.0,33))
    height = grain[:,None]*along[None,:]*.000009
    coarse = Image.fromarray(rng.integers(0,256,(9,25),dtype=np.uint8)).resize((width,bandHeight),Image.Resampling.BICUBIC)
    height += (np.asarray(coarse,dtype=np.float32)/255-.5)*.000025
    height *= .25+.75*state
    height -= state*.000025
    yy,xx = np.mgrid[0:bandHeight,0:width]
    for _ in range(3):
        cx,cy=rng.uniform(100,width-100),rng.uniform(15,bandHeight-15)
        sx,sy=rng.uniform(12,45),rng.uniform(.65,1.25)
        height -= rng.uniform(.000025,.00006)*np.exp(-((xx-cx)/sx)**4-((yy-cy)/sy)**2)*state
    for _ in range(18):
        cx,cy=rng.uniform(0,width),rng.uniform(0,bandHeight)
        height -= .000008*np.exp(-((xx-cx)/1.2)**2-((yy-cy)/.8)**2)*state
    if 0 < nodeU < 1: height += .000025*np.exp(-((xx-nodeU*width)/3.0)**2)
    gy,gx=np.gradient(height*reliefScale,breadth/(bandHeight*.7),length/width)
    vec=np.stack((-gx,gy,np.ones_like(gx)),axis=-1);vec/=np.linalg.norm(vec,axis=-1,keepdims=True)
    normal=np.clip((vec*.5+.5)*255,0,255).astype('uint8')
    image=Image.fromarray(np.clip(albedo*255,0,255).astype('uint8'))
    lum=np.asarray(image.convert('L').filter(ImageFilter.GaussianBlur(1.4)),dtype=np.float32)/255
    dirt=np.clip((.58-lum)/.27,0,1)
    rough=np.clip((.59 if trim else .49)+.34*dirt+(.18 if trim else .29)*state,.48,.91)
    orm=np.stack((np.full_like(rough,255),rough*255,np.zeros_like(rough)),axis=-1).astype('uint8')
    return normal,orm

atlas=np.empty((stripCount*bandHeight,width,3),dtype=np.uint8)
normals=np.empty_like(atlas);orms=np.empty_like(atlas)
rimAtlas=np.empty_like(atlas);rimNormals=np.empty_like(atlas);rimOrms=np.empty_like(atlas)
bindingAtlas=np.empty_like(atlas);bindingNormals=np.empty_like(atlas);bindingOrms=np.empty_like(atlas)
records=[]
for index in range(stripCount):
    breadth=stripWidths[index];lateral=positions[index%13]
    extent=max(math.sqrt(.295**2-(lateral+side*breadth/2)**2) for side in (-1,1));length=2*extent
    pair=[(2,4),(0,6),(5,1),(7,3)][int(pickRng.integers(0,4))]
    skinIndex,wornIndex=(2,1) if index==6 else pair
    cropWidth=min(source.width-10,int(round(source.width*length/.60)))
    left=int(pickRng.integers(5,max(6,source.width-cropWidth-4)))
    reverse=index!=6 and pickRng.random()<.5
    if index==6: left,cropWidth=10,1234
    skinImage,skinCrop=SampleSwatch(skinIndex,left,cropWidth,reverse)
    wornImage,wornCrop=SampleSwatch(wornIndex,left,cropWidth,reverse)
    if index==6:
        skinImage=source.crop((10,322,1244,461)).resize((width,bandHeight),Image.Resampling.LANCZOS);skinCrop=[10,322,1244,461]
        wornImage=source.crop((10,165,1244,303)).resize((width,bandHeight),Image.Resampling.LANCZOS);wornCrop=[10,165,1244,303]
    skinImage=ImageEnhance.Color(skinImage).enhance(.85)
    wornImage=ImageEnhance.Color(wornImage).enhance(.80)
    skin=np.asarray(skinImage,dtype=np.float32)/255;worn=np.asarray(wornImage,dtype=np.float32)/255
    reflectanceFactor=.85 if index==6 or skinIndex!=2 else .70
    linear=np.where(skin<=.04045,skin/12.92,((skin+.055)/1.055)**2.4)*reflectanceFactor
    skin=ToSrgb(linear)
    lum=np.asarray(wornImage.convert('L').filter(ImageFilter.GaussianBlur(1.4)),dtype=np.float32)/255
    chroma=(worn.max(2)-worn.min(2))/np.maximum(.05,worn.max(2))
    sourceWear=np.clip((.32-chroma)/.18,0,1)*np.clip((lum-.35)/.30,0,1)
    u=np.arange(width,dtype=np.float32)[None,:]/(width-1)
    irregular=(lum-np.percentile(lum,50))*.12
    if index==6: start,end,transition=.48,.86,.12
    else:
        span=min(.56,float(pickRng.uniform(.075,.18))/length)
        center=float(pickRng.uniform(.24,.78));start=max(.06,center-span/2);end=min(.96,center+span/2)
        transition=min(.12,(end-start)*.32)
    entry=np.clip((u-start+irregular)/transition,0,1);entry=entry*entry*(3-2*entry)
    exit=np.clip((end-u-irregular)/transition,0,1);exit=exit*exit*(3-2*exit)
    state=entry*exit*(.4+.6*sourceWear)
    if index!=6 and pickRng.random()<.18: state*=.25
    albedo=skin*(1-state[:,:,None])+worn*state[:,:,None]
    # Dark use stains are allowed on retained epidermis as well as in worn
    # areas. They come from the existing source color, never from a shadow mask.
    dirtState=np.clip((.52-lum)/.22,0,1)*.85
    wornLinear=np.where(worn<=.04045,worn/12.92,((worn+.055)/1.055)**2.4)
    stainColor=ToSrgb(wornLinear*.45)
    albedo=albedo*(1-dirtState[:,:,None])+stainColor*dirtState[:,:,None]
    nodeU=(nodeXs[skinIndex]-left)/cropWidth
    if reverse:nodeU=1-nodeU
    if index==6:nodeU=(360-10)/1234
    seed=68101 if index==6 else 68200+index
    normal,orm=ReliefMaps(albedo,state,length,breadth,seed,nodeU)
    ys=slice(index*bandHeight,(index+1)*bandHeight)
    atlas[ys]=np.clip(albedo*255,0,255).astype('uint8');normals[ys]=normal;orms[ys]=orm
    # Narrow edge bindings and hoop use the same skin source family, with
    # smaller relief and a rougher bent/handled response rather than body scale.
    trimState=np.clip(sourceWear*.35,0,1)
    trimColor=skin*(1-trimState[:,:,None])+worn*trimState[:,:,None]
    trimColor=trimColor*(1-dirtState[:,:,None]*.45)+stainColor*dirtState[:,:,None]*.45
    rimNormal,rimOrm=ReliefMaps(trimColor,trimState,.628,.032,seed,nodeU,.65,True)
    bindNormal,bindOrm=ReliefMaps(trimColor,trimState,.070,.00385,seed,nodeU,.20,True)
    rimAtlas[ys]=np.clip(trimColor*255,0,255).astype('uint8');bindingAtlas[ys]=rimAtlas[ys]
    rimNormals[ys]=rimNormal;rimOrms[ys]=rimOrm;bindingNormals[ys]=bindNormal;bindingOrms[ys]=bindOrm
    records.append({'strip':index,'lengthM':length,'widthM':breadth,'skinSwatch':skinIndex,'wornSwatch':wornIndex,'skinCrop':skinCrop,'wornCrop':wornCrop,'reversed':reverse,'wearIntervalU':[start,end],'transitionU':transition})

for name,pixels in [('Texture_K10_BambooAtlas_V6.jpg',atlas),('Texture_K10_BambooRim.jpg',rimAtlas),('Texture_K10_BambooBinding.jpg',bindingAtlas)]:
    Image.fromarray(pixels).save(output/name,quality=95,subsampling=0)
for name,pixels in [('Texture_K10_BambooNormal_V6.png',normals),('Texture_K10_BambooOrm_V6.png',orms),('Texture_K10_RimNormal.png',rimNormals),('Texture_K10_RimOrm.png',rimOrms),('Texture_K10_BindingNormal.png',bindingNormals),('Texture_K10_BindingOrm.png',bindingOrms)]:
    Image.fromarray(pixels).save(output/name)
(output/'Data_TextureSampling.json').write_text(json.dumps(records,indent=2),encoding='utf8')
print('Bamboo layer atlas V3:',atlas.shape,'full albedo sources, layer-dependent metric relief and roughness')

'''
subprocess.run(['python', '-c', SURFACE_CODE, OUT], check=True)
random.seed(1010)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for block in list(datablocks):
        if block.users == 0:
            datablocks.remove(block)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def Material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.88
    return mat

# The three locally retained texture inputs are generated from the new bamboo
# surface reference. They are packed into both the blend and exported GLB.
def ImageNode(mat, filename, noncolor=False):
    path = os.path.join(OUT, filename)
    if not os.path.isfile(path):
        raise FileNotFoundError('Required K10 surface input: ' + path)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.reload()
    if noncolor:
        node.image.colorspace_settings.name = 'Non-Color'
    node.image.pack()
    return node

def TexturedBamboo(mat, baseFile='Texture_K10_BambooAtlas_V6.jpg', normalFile='Texture_K10_BambooNormal_V6.png', ormFile='Texture_K10_BambooOrm_V6.png', normalStrength=0.45):
    nodes = mat.node_tree.nodes; links = mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    base = ImageNode(mat, baseFile)
    links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
    normal = ImageNode(mat, normalFile, True)
    normalMap = nodes.new('ShaderNodeNormalMap'); normalMap.inputs['Strength'].default_value = normalStrength
    links.new(normal.outputs['Color'], normalMap.inputs['Color'])
    links.new(normalMap.outputs['Normal'], bsdf.inputs['Normal'])
    orm = ImageNode(mat, ormFile, True)
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])

palette = [Material('Wicker_Bamboo', (0.38, 0.29, 0.19))]
TexturedBamboo(palette[0], normalStrength=1.0)
edgeMat = Material('Wicker_SplitBambooEdge', (0.30, 0.24, 0.17))
rimMat = Material('Wicker_Rim', (0.31, 0.235, 0.15))
TexturedBamboo(rimMat, 'Texture_K10_BambooRim.jpg', 'Texture_K10_RimNormal.png', 'Texture_K10_RimOrm.png')
tieMat = Material('Wicker_Binding', (0.27, 0.20, 0.13))
TexturedBamboo(tieMat, 'Texture_K10_BambooBinding.jpg', 'Texture_K10_BindingNormal.png', 'Texture_K10_BindingOrm.png')
root = bpy.data.objects.new('BambooSteamingRack_Intact', None)
scene.collection.objects.link(root)
root['historical_note'] = 'Bamboo steaming rack documented in Teng County gazetteer; weave and dimensions reconstructed.'

# Thirteen strips in each direction. At each crossing one rises while the other
# falls, creating physical over-under alternation and actual openings.
count = 13
spacing = 0.045
width = 0.023
thickness = 0.0006
innerR = 0.295
positions = [(i - (count - 1) / 2) * spacing for i in range(count)]
# Seven load-bearing crossings run across the center of the lattice. Their
# contact regions are nearly flat; free spans between them remain bent.
contactRows = set(range(3, 10))
contactHalfSpan = 0.0125
verts, vertexUvs, faces, faceMats, faceSpecs = [], [], [], [], []
for direction in range(2):
    for row, lateral in enumerate(positions):
        firstFace = len(faces)
        stripWidth = width * random.uniform(0.95, 1.04)
        sideExtents = {side: math.sqrt(innerR ** 2 - (lateral + side * stripWidth / 2) ** 2) for side in (-1, 1)}
        extent = max(sideExtents.values())
        # Include every crossing within this clipped strip. Both ends are inside
        # the hoop; their concealed caps are omitted to fund visible tie detail.
        samples = [-extent] + [x for x in positions if -extent < x < extent] + [extent]
        if row in contactRows:
            crossing = positions[row]
            samples.remove(crossing)
            samples.extend((crossing-contactHalfSpan, crossing+contactHalfSpan))
            samples.sort()
        start = len(verts)
        stripMat = 0
        textureRow = 1.0 - (direction * count + row + 0.5) / 26
        for k, along in enumerate(samples):
            for side, dz in [(-1, -thickness / 2), (1, -thickness / 2), (1, thickness / 2), (-1, thickness / 2)]:
                across = lateral + side * stripWidth / 2
                # Clip each side separately to the circumference; retain every
                # crossing station up to the longer side of the clipped end.
                positionAlong = max(-sideExtents[side], min(sideExtents[side], along))
                t = max(0.0, min(count - 1.0, positionAlong / spacing + (count - 1) / 2))
                lower = int(math.floor(t)); upper = min(count - 1, lower + 1)
                lowSign = 1 if (row + lower + direction) % 2 == 0 else -1
                highSign = 1 if (row + upper + direction) % 2 == 0 else -1
                z = 0.0085 + (lowSign + (highSign - lowSign) * (t-lower)) * 0.00065
                if row in contactRows and abs(positionAlong - positions[row]) <= contactHalfSpan + 1e-7:
                    z = 0.0085 + (1 if direction == 0 else -1) * 0.000315
                verts.append((positionAlong, across, z + dz) if direction == 0 else (across, positionAlong, z + dz))
                u = max(0.0, min(1.0, (positionAlong + extent) / (2 * extent)))
                vertexUvs.append((u, textureRow + side * (0.35 / 26)))
        for k in range(len(samples) - 1):
            a = start + 4 * k; b = a + 4
            for j in range(4):
                faces.append((a+j, a+(j+1)%4, b+(j+1)%4, b+j)); faceMats.append(stripMat)
        if direction == 1:
            for index in range(firstFace, len(faces)):
                faces[index] = tuple(reversed(faces[index]))
        faceSpecs.extend([(direction, lateral, stripWidth, textureRow)] * (len(faces) - firstFace))
# At a clipped corner two consecutive points may coincide; convert those quads
# to triangles or omit empty faces instead of exporting degenerate geometry.
cleanFaces, cleanMats, cleanSpecs = [], [], []
for face, matIndex, spec in zip(faces, faceMats, faceSpecs):
    unique = []
    for index in face:
        if not any((Vector(verts[index])-Vector(verts[other])).length < 1e-9 for other in unique):
            unique.append(index)
    if len(unique) >= 3:
        cleanFaces.append(tuple(unique)); cleanMats.append(matIndex); cleanSpecs.append(spec)
faces, faceMats, faceSpecs = cleanFaces, cleanMats, cleanSpecs
mesh = bpy.data.meshes.new('BambooWovenStrips_Mesh')
mesh.from_pydata(verts, [], faces); mesh.update()
strips = bpy.data.objects.new('BambooWovenStrips', mesh)
scene.collection.objects.link(strips); strips.parent = root
for mat in palette + [edgeMat]: mesh.materials.append(mat)
for poly, idx in zip(mesh.polygons, faceMats): poly.material_index = idx
uvLayer = mesh.uv_layers.new(name='BambooGrain')
for poly, (direction, lateral, stripWidth, textureRow) in zip(mesh.polygons, faceSpecs):
    base = [vertexUvs[mesh.loops[i].vertex_index] for i in poly.loop_indices]
    uSpan = max(uv[0] for uv in base) - min(uv[0] for uv in base)
    vSpan = max(uv[1] for uv in base) - min(uv[1] for uv in base)
    isEdge = abs(poly.normal.z) < 0.5
    if isEdge or uSpan < 1e-7 or vSpan < 1e-7:
        poly.material_index = 1
    for loopIndex in poly.loop_indices:
        vertexIndex = mesh.loops[loopIndex].vertex_index
        co = mesh.vertices[vertexIndex].co
        if isEdge:
            horizontal = co.x if abs(poly.normal.y) >= abs(poly.normal.x) else co.y
            uv = (0.5 + horizontal * 2, 0.2 + co.z * 20)
        elif uSpan < 1e-7:  # end grain: across strip by thickness
            across = co.y if direction == 0 else co.x
            uv = (0.4 + (across-lateral) / stripWidth * 0.12, textureRow + (co.z-0.0085)*5)
        elif vSpan < 1e-7:  # long thin side: along grain by thickness
            uv = (vertexUvs[vertexIndex][0], textureRow + (co.z-0.0085)*5)
        else:
            uv = vertexUvs[vertexIndex]
        uvLayer.data[loopIndex].uv = uv

# Two-lobed, shallow bamboo hoop; 0.600 m outside diameter.
segments = 24
ringVerts, ringFaces = [], []
ringProfile = [(0.282, 0.003), (0.300, 0.002), (0.296, 0.016), (0.291, 0.014), (0.286, 0.016)]
for i in range(segments):
    a = 2 * math.pi * i / segments
    for r, z in ringProfile:
        ringVerts.append((r * math.cos(a), r * math.sin(a), z))
for i in range(segments):
    j = (i + 1) % segments
    for k in range(5): ringFaces.append((5*i+k, 5*j+k, 5*j+(k+1)%5, 5*i+(k+1)%5))
ringMesh = bpy.data.meshes.new('BambooRim_Mesh')
ringMesh.from_pydata(ringVerts, [], ringFaces); ringMesh.update()
for poly in ringMesh.polygons: poly.use_smooth = True
# Smooth circumferentially while keeping the two reed profiles and groove crisp.
rimNormals = [(0.0, 0.0, 1.0)] * len(ringMesh.loops)
for poly in ringMesh.polygons:
    k = poly.index % 5
    r1,z1 = ringProfile[k]; r2,z2 = ringProfile[(k+1)%5]
    for li in poly.loop_indices:
        vertexIndex = ringMesh.loops[li].vertex_index
        co = ringMesh.vertices[vertexIndex].co
        a = math.atan2(co.y, co.x)
        rimNormals[li] = Vector(((z2-z1)*math.cos(a), (z2-z1)*math.sin(a), -(r2-r1))).normalized()
ringMesh.normals_split_custom_set(rimNormals)
rim = bpy.data.objects.new('BambooRim', ringMesh); scene.collection.objects.link(rim); rim.parent = root
ringMesh.materials.append(rimMat)
ringUv = ringMesh.uv_layers.new(name='RimGrain')
for poly in ringMesh.polygons:
    for loopIndex in poly.loop_indices:
        vertexIndex = ringMesh.loops[loopIndex].vertex_index
        segment = vertexIndex // 5
        u = 3 * segment / segments
        if poly.index // 5 == segments - 1 and segment == 0: u = 3.0
        # The two physical lobes sample distinct strips of the source material.
        sourceRow = 14.5 if poly.index % 5 == 3 else 6.5
        ringUv.data[loopIndex].uv = (u, 1.0 - (sourceRow / 26) + ((vertexIndex % 5) - 2.0) * 0.0042)

# Two thin bamboo ribbons conform to the hoop at eight positions. Each ribbon
# is a continuous folded surface, not a painted line on the hoop.
bindingVerts, bindingFaces, bindingUvs = [], [], []
for n in range(8):
    a = n * math.tau / 8
    radial = Vector((math.cos(a), math.sin(a), 0))
    tangent = Vector((-math.sin(a), math.cos(a), 0))
    offsets, pitch, halfWidth = (-.00705,-.00235,.00235), .0047, .0017
    for offset in offsets:
        start = len(bindingVerts)
        profile = [(0.2812,0.0029),(0.3008,0.0012),(0.2961,0.0169),(0.291,0.0149),(0.2859,0.0169)]
        for edge in (-1, 1):
            for k in range(6):
                r, z = profile[k % 5]
                along = offset + pitch * k / 5 + edge * halfWidth
                angleAtPoint = a + math.atan2(along, r)
                polygonMid = (math.floor(angleAtPoint / math.tau * segments) + 0.5) * math.tau / segments
                polygonScale = math.cos(math.pi / segments) / math.cos(angleAtPoint - polygonMid)
                radialComponent = math.sqrt(max(0.0, (r * polygonScale) ** 2 - along ** 2))
                bindingVerts.append(tuple(radial*radialComponent + tangent*along + Vector((0,0,z))))
        for k in range(5):
            bindingFaces.append(tuple(start+i for i in (6+k,6+k+1,k+1,k)))
            center = 1.0 - (n + 3.5) / 26
            bindingUvs.append(((k/5,center+0.012),((k+1)/5,center+0.012),((k+1)/5,center-0.012),(k/5,center-0.012)))
        # On the exposed top of each wrap, give both edges physical thickness.
        for edge in (0, 1):
            for k in ((2,) if n in (1,3,7) else ()):
                first, second = start + 6*edge+k, start + 6*edge+k+1
                lowered = len(bindingVerts)
                for index in (first, second):
                    v = Vector(bindingVerts[index]); v.z -= .0003; bindingVerts.append(tuple(v))
                bindingFaces.append((first, second, lowered+1, lowered))
                center = 1.0 - (n + 3.5) / 26
                bindingUvs.append(((k/5,center-.006),((k+1)/5,center-.006),((k+1)/5,center+.006),(k/5,center+.006)))
    # A narrow return passes over the windings and seats against the reeds.
    start = len(bindingVerts)
    for dr, tang in [(-.009,-.006),(.001,.004),(.001,.006),(-.009,-.004)]:
        bindingVerts.append(tuple(radial*(.295+dr) + tangent*tang + Vector((0,0,.0173))))
    bindingFaces.append((start,start+1,start+2,start+3))
    center = 1.0 - (n + 3.5) / 26
    bindingUvs.append(((.2,center-.01),(.8,center-.01),(.8,center+.01),(.2,center+.01)))
    # Short folded end outside the rim, attached to the outermost winding.
    start = len(bindingVerts)
    for dr, tang, z in [(.0032,.0033,.011),(.0052,.0033,.009),(.0052,.0053,.009)]:
        bindingVerts.append(tuple(radial*(.295+dr) + tangent*tang + Vector((0,0,z))))
    bindingFaces.append((start,start+1,start+2))
    center = 1.0 - (n + 3.5) / 26
    bindingUvs.append(((.2,center-.01),(.8,center-.01),(.8,center+.01)))
bindingMesh = bpy.data.meshes.new('BambooBindings_Mesh')
bindingMesh.from_pydata(bindingVerts, [], bindingFaces); bindingMesh.update()
binding = bpy.data.objects.new('BambooBindings', bindingMesh); scene.collection.objects.link(binding); binding.parent = root
bindingMesh.materials.append(tieMat)
bindingUv = bindingMesh.uv_layers.new(name='BindingGrain')
for poly, faceUv in zip(bindingMesh.polygons, bindingUvs):
    for loopIndex, uv in zip(poly.loop_indices, faceUv): bindingUv.data[loopIndex].uv = uv

# Put the actual lower bounds at the root origin, using one rigid translation
# for all asset vertices. Materials, topology and relative geometry are intact.
assetMeshes = (strips, rim, binding)
points = [obj.matrix_world @ vertex.co for obj in assetMeshes for vertex in obj.data.vertices]
minimum = Vector(tuple(min(point[i] for point in points) for i in range(3)))
maximum = Vector(tuple(max(point[i] for point in points) for i in range(3)))
originShift = Vector(((minimum.x+maximum.x)*.5, (minimum.y+maximum.y)*.5, minimum.z))
for obj in assetMeshes:
    for vertex in obj.data.vertices: vertex.co -= originShift
    obj.data.update()
root['originCorrectionBlenderXYZ'] = list(originShift)
print('K10_ORIGIN_CORRECTION', list(originShift))

# Export only the root and its meshes; Blender Z-up is converted to glTF Y-up.
bpy.ops.object.select_all(action='DESELECT')
for obj in [root, strips, rim, binding]: obj.select_set(True)
bpy.context.view_layer.objects.active = root
glbPath = os.path.join(OUT, 'Model_K10_BambooSteamingRack.glb')
bpy.ops.export_scene.gltf(filepath=glbPath, export_format='GLB', use_selection=True, export_yup=True, export_tangents=True)
triangles = sum(len(p.vertices) - 2 for obj in (strips, rim, binding) for p in obj.data.polygons)
print('K10_TRIANGLES', triangles, 'RIM_DIMENSIONS', list(rim.dimensions), 'GLB', glbPath)

# A neutral render setup remains in the editable source, outside the exported root.
floorMat = Material('Preview_Backdrop', (0.52, 0.52, 0.52))
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.001))
floor = bpy.context.object; floor.name = 'Preview_Backdrop'; floor.data.materials.append(floorMat)
world = bpy.data.worlds.new('PreviewWorld') if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.7, 0.7, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
def PointAt(obj, target): obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def Area(name, loc, power, size):
    data=bpy.data.lights.new(name, 'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=loc; PointAt(obj,(0,0,0))
Area('Preview_Key', (0.0,-0.8,1.8), 30, 1.8)
Area('Preview_Fill', (1.0,0.7,1.2), 12, 1.4)
cameraData=bpy.data.cameras.new('Preview_Camera'); camera=bpy.data.objects.new('Preview_Camera',cameraData)
scene.collection.objects.link(camera); scene.camera=camera; cameraData.type='ORTHO'
scene.render.engine='CYCLES'; scene.cycles.samples=64; scene.cycles.use_denoising=False
scene.render.resolution_x=500; scene.render.resolution_y=375; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
views = {
    'Front': ((0,-1.8,0.0085),(0,0,0.0085),0.73),
    'Side': ((1.8,0,0.0085),(0,0,0.0085),0.73),
    'Top': ((0,0,1.8),(0,0,0),0.88),
    'Angle45': ((1.1,-1.1,1.35),(0,0,0),0.88),
    'Detail': ((0.42,-0.48,0.55),(0.12,-0.12,0.008),0.28),
}
# Preserve editable geometry, then render only a freshly imported low-poly GLB.
camera.location=views['Angle45'][0]; cameraData.ortho_scale=views['Angle45'][2]; PointAt(camera,views['Angle45'][1])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Scene_K10_BambooSteamingRack.blend'))
for obj in [strips, rim, binding, root]:
    bpy.data.objects.remove(obj, do_unlink=True)
beforeImport = set(scene.objects)
beforeMeshes = [obj for obj in beforeImport if obj.type == 'MESH']
assert len(beforeMeshes) == 1 and beforeMeshes[0] == floor, 'Only the preview floor may precede GLB import'
bpy.ops.import_scene.gltf(filepath=glbPath)
imported = set(scene.objects) - beforeImport
importedMeshes = {obj for obj in imported if obj.type == 'MESH'}
importedRoots = [obj for obj in imported if obj.type == 'EMPTY' and obj.parent is None]
assert len(importedMeshes) == 3 and len(importedRoots) == 1
assert all(obj.parent == importedRoots[0] and not obj.hide_render for obj in importedMeshes)
assert {obj for obj in scene.objects if obj.type == 'MESH'} == importedMeshes | {floor}
print('K10_RENDER_SOURCE', 'reimported GLB only', sorted((obj.name, obj.type) for obj in imported))
for name, (loc, target, scale) in views.items():
    camera.location=loc; cameraData.ortho_scale=scale; PointAt(camera,target)
    scene.render.filepath=os.path.join(OUT, 'Preview_K10_'+name+'.png')
    bpy.ops.render.render(write_still=True)
print('K10_COMPLETE', triangles, 'views', ','.join(views), 'materials', [m.name for m in palette]+[edgeMat.name,rimMat.name,tieMat.name])
