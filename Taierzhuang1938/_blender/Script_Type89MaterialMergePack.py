"""Consolidate Type89 opaque materials while retaining their authored maps and coating."""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse
import json
import shutil

import cv2
import numpy as np
from PIL import Image

from Script_Type89BattleWearGame import Count, Export, Srgb, Textures
from Script_Type89BattleWearMasks import Glb, ScreenTriangle
from Script_Type89ContactAoPack import Encode


ROOT = 'Model_Type89MediumTank'
REVISION = 'SurfaceV20'
BASELINE_SHA = 'ea46f7ccee8710f424249a492ee8f375778c5b9a1b730a0bac59f8dcf64c6ac9'
GLB = ROOT+'.glb'
COATING = 'Texture_Type89GameCoating'
BODY_ROLES = {'Armor','CastArmor','Steel','Exhaust','Rubber','Shadow'}
TEXELS = 128
BODY_NAME = 'Material_Type89GameBody'


def Reports(target):
    return target/'Review'/'Data_MaterialMergeReview.json'


def Save(target,result):
    Reports(target).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')


def BodyOccupancy(model,size):
    occupied = np.zeros((size,size),np.uint8)
    visited = set()
    for node,_,primitive,role in model.Geometry():
        key = node['mesh'],primitive['material']
        if key in visited or role not in BODY_ROLES|{'Glass'} or role=='Shadow':
            continue
        visited.add(key)
        uv = model.Access(primitive['attributes']['TEXCOORD_0'])*size
        for indices in model.Access(primitive['indices']).reshape(-1,3):
            sample = ScreenTriangle(uv[indices],(size,size))
            if sample is not None:
                y,x,_,_ = sample
                occupied[y,x] = 1
    return cv2.dilate(occupied,np.ones((25,25),np.uint8))


def VoidSwatch(model,maps):
    orm,normal = (maps[channel] for channel in ('Orm','Normal'))
    size = orm.shape[0]
    assert orm.shape[:2]==(4096,4096)
    # The recess uses a square entirely outside the old UVs and mip pads.
    # Select a neutral-normal area with the required AO and metallic already
    # present, so those existing channels are byte-exact over the full atlas.
    busy = BodyOccupancy(model,size).astype(bool)
    busy |= (orm[:,:,0]!=255)|(orm[:,:,2]!=0)|np.any(normal[:,:,:3]!=[128,128,255],axis=2)
    sums = cv2.integral(busy.astype(np.uint8))
    step = TEXELS
    counts = sums[step:,step:]+sums[:-step,:-step]-sums[step:,:-step]-sums[:-step,step:]
    possible = np.argwhere(counts[24:-24,24:-24]==0)+24
    assert len(possible)>0,'Neutral recessed-surface texture tile does not fit'
    y,x = (int(item) for item in possible[len(possible)//2])
    return {'rect':[x,y,step,step],'uv':[(x+step*.5)/size,(y+step*.5)/size]}


def Coating(model):
    roles = {m['extras']['Type89Role']:m for m in model.doc['materials']}
    swatches = np.full((8,32,4),255,np.uint8)
    result = {}
    for role in sorted(BODY_ROLES):
        material = roles[role]
        extensions = material.get('extensions',{})
        coat = extensions.get('KHR_materials_clearcoat',{})
        specular = extensions.get('KHR_materials_specular',{})
        factors = (coat.get('clearcoatFactor',0),coat.get('clearcoatRoughnessFactor',0),
                   specular.get('specularFactor',1))
        slot = {'Armor':0,'CastArmor':1}.get(role,2)
        x = slot*8
        texel = np.rint(np.array((factors[0],factors[1],1,factors[2]))*255).astype(np.uint8)
        swatches[:,x:x+8] = texel
        result[role] = {'uv':[(x+4)/32,.5],'factors':list(factors),'pixel':texel.tolist()}
    swatches[:,24:] = swatches[:,16:24]
    return swatches,result


def Maps(model,source,target):
    target.joinpath('Review').mkdir(parents=True,exist_ok=True)
    for directory in ('Maps/High','Maps/Controls','Game/Maps'):
        dest = target/directory
        dest.mkdir(parents=True,exist_ok=True)
        for original in (source/directory).glob('*.png'):
            if not (dest/original.name).exists():
                shutil.copy2(original,dest/original.name)

    old,_ = Textures(model)
    maps = old['Body']
    swatch = VoidSwatch(model,maps)
    x,y,w,h = swatch['rect']
    recess = next(m['pbrMetallicRoughness'] for m in model.doc['materials']
                  if m['extras']['Type89Role']=='Shadow')
    base,orm = maps['Base'].copy(),maps['Orm'].copy()
    base[y:y+h,x:x+w,:3] = Srgb(np.asarray(recess['baseColorFactor'][:3],dtype=np.float32))
    orm[y:y+h,x:x+w,1] = round(255*recess['roughnessFactor'])
    assert np.array_equal(orm[:,:,[0,2]],maps['Orm'][:,:,[0,2]])
    colors,coating = Coating(model)
    for name,array in [('Texture_Type89GameBodyBase',base),('Texture_Type89GameBodyOrm',orm),(COATING,colors)]:
        Image.fromarray(array).save(target/'Game'/'Maps'/(name+'.png'),compress_level=4)
    result = {'schema':'Type89MaterialMergeV1','revision':REVISION,'baselineRuntimeSha256':BASELINE_SHA,
              'coating':coating,'recess':swatch,'combinedBodyRoles':sorted(BODY_ROLES),
              'recessBase':base[y,x,:3].tolist(),'recessOrm':orm[y,x,:3].tolist()}
    Save(target,result)
    print(json.dumps({'recess':swatch,'coating':coating}),flush=True)


def RemapTextureRefs(settings,textureIndex):
    for key,value in settings.items():
        if not isinstance(value,dict):
            continue
        if key.endswith('Texture') and 'index' in value:
            value['index'] = textureIndex(value['index'])
        else:
            RemapTextureRefs(value,textureIndex)


def Materials(package,swatchTexture):
    doc = package.document
    original = {m['extras']['Type89Role']:m for m in doc['materials']}
    textures = []
    def TextureIndex(index):
        definition = doc['textures'][index]
        try:
            return textures.index(definition)
        except ValueError:
            textures.append(definition)
            return len(textures)-1
    result = []
    mapping = {}
    for role in ('Armor','Guard','Glass','Track'):
        material = deepcopy(original[role])
        if role=='Armor':
            material['name'] = BODY_NAME
            material['extras']['Type89Role'] = 'Body'
            info = {'index':swatchTexture,'texCoord':1}
            material['extensions'] = {
                'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':1,
                    'clearcoatTexture':dict(info),'clearcoatRoughnessTexture':dict(info)},
                'KHR_materials_specular':{'specularFactor':1,'specularTexture':dict(info)},
            }
            mapping.update({role:0 for role in BODY_ROLES})
        else:
            mapping[role] = len(result)
        RemapTextureRefs(material,TextureIndex)
        result.append(material)
    doc['materials'],doc['textures'] = result,textures
    return mapping


def AddCoating(package,data):
    doc = package.document
    payload = Encode(data,'image/webp')
    view = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer':0,'byteLength':len(payload)})
    package.buffers.append(payload)
    image = len(doc['images'])
    doc['images'].append({'bufferView':view,'mimeType':'image/webp','name':COATING})
    sampler = len(doc['samplers'])
    doc['samplers'].append({'magFilter':9728,'minFilter':9728,'wrapS':33071,'wrapT':33071})
    doc['textures'].append({'sampler':sampler,'extensions':{'EXT_texture_webp':{'source':image}}})
    return len(doc['textures'])-1


def ChangePrimitives(model,package,mapping,report):
    doc = package.document
    assignments = []
    for source,mesh in zip(model.doc['meshes'],doc['meshes'],strict=True):
        for old,part in zip(source['primitives'],mesh['primitives'],strict=True):
            role = model.doc['materials'][old['material']]['extras']['Type89Role']
            part['material'] = mapping[role]
            if role not in BODY_ROLES:
                continue
            part.setdefault('extras',{})['Type89SurfaceRole'] = role
            attrs = part['attributes']
            coord = tuple(report['coating'][role]['uv'])
            assignments.append((attrs,'TEXCOORD_1',coord))
            if role=='Shadow':
                assignments.append((attrs,'TEXCOORD_0',tuple(report['recess']['uv'])))

    def VertexCount(attributes):
        return doc['accessors'][attributes['POSITION']]['count']

    maxCounts = {}
    for attributes,_,coord in assignments:
        maxCounts[coord] = max(maxCounts.get(coord,0),VertexCount(attributes))
    views = {}
    accessors = {}
    for coord,count in maxCounts.items():
        repeated = np.broadcast_to(np.asarray(coord,np.float32),(count,2))
        accessor = package.Access(repeated,'TEXCOORD',2)
        views[coord] = doc['accessors'][accessor]
        accessors[(*coord,count)] = accessor
    for attributes,key,coord in assignments:
        count = VertexCount(attributes)
        token = (*coord,count)
        if token not in accessors:
            accessors[token] = len(doc['accessors'])
            doc['accessors'].append({**views[coord],'count':count})
        attributes[key] = accessors[token]
    return len(accessors),len(views)


def Prove(model,exported,changedViews):
    assert Count(model)==Count(exported) and Count(exported)['renderedTriangles']<=80000
    assert model.doc['scenes']==exported.doc['scenes']
    for a,b in zip(model.doc['nodes'],exported.doc['nodes'],strict=True):
        assert a==b or (a['name']==ROOT and all(a[k]==b[k] for k in a if k!='extras'))
    for a,b in zip(model.doc['meshes'],exported.doc['meshes'],strict=True):
        for old,new in zip(a['primitives'],b['primitives'],strict=True):
            for key in ('POSITION','NORMAL','TANGENT'):
                assert old['attributes'][key]==new['attributes'][key]
            assert old['indices']==new['indices']
            role = model.doc['materials'][old['material']]['extras']['Type89Role']
            if role!='Shadow':
                assert old['attributes']['TEXCOORD_0']==new['attributes']['TEXCOORD_0']
    assert all(model.Bytes(i)==exported.Bytes(i) for i in range(len(model.doc['bufferViews'])) if i not in changedViews)


def Runtime(model,target):
    report = json.loads(Reports(target).read_text(encoding='utf-8'))
    package = Export(model)
    assets = target/'Game'/'Maps'
    changed = set()
    for image in model.doc['images']:
        name = image['name'].removesuffix('.png')
        if name not in ('Texture_Type89GameBodyBase','Texture_Type89GameBodyOrm'):
            continue
        pixels = np.asarray(Image.open(assets/(name+'.png')))
        view = image['bufferView']
        baseline = np.asarray(Image.open(BytesIO(model.Bytes(view))))
        x,y,w,h = report['recess']['rect']
        outside = np.ones(pixels.shape[:2],bool)
        outside[y:y+h,x:x+w] = False
        assert np.array_equal(pixels[outside],baseline[outside])
        if name.endswith('Orm'):
            assert np.array_equal(pixels[:,:,[0,2]],baseline[:,:,[0,2]])
        package.buffers[view] = Encode(pixels,image['mimeType'])
        changed.add(view)
    grid = np.asarray(Image.open(assets/(COATING+'.png')))
    coating = AddCoating(package,grid)
    mapping = Materials(package,coating)
    additional,buffers = ChangePrimitives(model,package,mapping,report)
    high = target/'Scene_Type89MediumTankHighPbr.blend'
    game = target/'Game'/'Scene_Type89MediumTankGamePbr.blend'
    highHash = sha256(high.read_bytes()).hexdigest()
    doc = package.document
    doc['asset']['extras']['Type89MaterialMerge'] = {
        'revision':REVISION,'baselineRuntimeSha256':BASELINE_SHA,'originalMaterialCount':len(model.doc['materials']),
        'materialCount':len(doc['materials']),'oldSurfaceRolesRetained':True}
    node = next(node for node in doc['nodes'] if node['name']==ROOT)
    node['extras']['surfaceRevision'] = REVISION
    node['extras']['gameBake']['highSourceSha256'] = highHash
    output = target/'Game'/'Runtime'/GLB
    output.parent.mkdir(parents=True,exist_ok=True)
    pending = output.with_suffix('.build.glb')
    package.Write(pending)
    actual = Glb(pending)
    Prove(model,actual,changed)
    pending.replace(output)
    report['runtime'] = {**Count(actual),'baselineMaterials':len(model.doc['materials']),
        'runtimeMaterials':len(doc['materials']),'imageCount':len(doc['images']),
        'textureBindings':len(doc['textures']),'baselineTextureBindings':len(model.doc['textures']),
        'sha256':sha256(actual.data).hexdigest(),'bytes':len(actual.data),
        'highSourceSha256':highHash,'gameSourceSha256':sha256(game.read_bytes()).hexdigest(),
        'originalNonImageBuffersRetained':True,'aoMetallicNormalMapsExact':True,
        'additionalConstantUvAccessors':additional,'constantUvBuffers':buffers}
    Save(target,report)
    print(report['runtime'],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('target',type=Path)
    parser.add_argument('stage',choices=('maps','runtime'))
    args=parser.parse_args()
    model = Glb(args.baseline/'Game'/'Runtime'/GLB)
    assert sha256(model.data).hexdigest()==BASELINE_SHA
    if args.stage=='maps':
        Maps(model,args.baseline,args.target)
    else:
        Runtime(model,args.target)
