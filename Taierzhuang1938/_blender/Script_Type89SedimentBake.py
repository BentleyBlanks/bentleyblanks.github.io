"""Bake the new soil layers into the V20 atlases and update the fixed mud geometry."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse
import json
import shutil

import cv2
import numpy as np
from PIL import Image

from Script_Type89BattleWearGame import (
    Bilinear, Count, Export, Gradient, Interpolate, Linear, Normalize, Srgb, TrackControls,
)
from Script_Type89BattleWearMasks import Glb, ReadRgb, RECIPE, ScreenTriangle, Smooth, ToBlender
from Script_Type89ContactAoPack import Encode
from Script_Type89Sediment import (
    BodyKind, BodyLayers, ClayCap, ClodScale, ClodUv, Dryness, ExistingTreadCap,
    GRAIN, GrainCoords, PROFILE, PROFILE_TEXT, Tiles, TRACK_CONTROL,
)
from Script_Type89SedimentControls import Build as BuildControls


ROOT = 'Model_Type89MediumTank'
GLB = ROOT+'.glb'
TRACK = 'Mesh_TrackLink'
CHANNELS = ('Base','Normal','Orm')


class Math:
    @staticmethod
    def smooth(v,start,end):
        return Smooth(start,end,v)

    add = staticmethod(np.add)
    mul = staticmethod(np.multiply)
    maximum = staticmethod(np.maximum)
    absolute = staticmethod(np.abs)

    @staticmethod
    def oneMinus(v):
        return 1-v


def LinearSample(table,u,v):
    return Bilinear(table,u*table.shape[1]-.5,(1-v)*table.shape[0]-.5)


def GrainSample(table,points,track):
    x,y,z = points.T
    u,v = (.5+2.60*x,.5+4.70*y) if track else GrainCoords(x,y,z,Math)
    return LinearSample(table,u,v)


def Decode(model):
    result = {}
    for image in model.doc['images']:
        name = image['name'].removesuffix('.png')
        if name.startswith(('Texture_Type89GameBody','Texture_Type89GameTrack')):
            result[name] = np.array(Image.open(BytesIO(model.Bytes(image['bufferView']))))
    return result


def CopyInputs(before,after):
    for region in ('Maps/High','Maps/Controls','Game/Maps'):
        directory = after/region
        directory.mkdir(parents=True,exist_ok=True)
        for file in (before/region).glob('*.png'):
            if not (directory/file.name).exists():
                shutil.copy2(file,directory/file.name)


def PrimitiveData(model,part,transform=None):
    attr = part['attributes']
    p = model.Access(attr['POSITION'])
    n = model.Access(attr['NORMAL'])
    tangent = model.Access(attr['TANGENT'])
    t = tangent[:,:3]
    if transform is not None:
        p = p@transform[:3,:3].T+transform[:3,3]
        n = n@transform[:3,:3].T
        t = t@transform[:3,:3].T
    return ToBlender(p),ToBlender(n),ToBlender(t),tangent[:,3]


class Atlas:
    def __init__(self,group,source):
        self.stem = 'Texture_Type89Game'+group
        self.original = {channel:source[self.stem+channel] for channel in CHANNELS}
        self.data = {channel:image.copy() for channel,image in self.original.items()}
        self.size = self.data['Base'].shape[1::-1]
        self.affected = np.zeros(self.size[::-1],bool)
        self.cake = np.zeros(self.size[::-1],np.float32)
        self.powder = np.zeros_like(self.cake)
        self.covered = np.zeros(self.size[::-1],np.uint8)

    def Deposit(self,y,x,cake,powder,grain,slope,track,dielectric=False):
        old = self.original['Orm'][y,x]
        if not track:
            keep = 1-Smooth(.30,.74,old[:,2]/255)
            cake,powder = cake*keep,powder*keep
        used = (cake>.018)|(powder>.014)
        if not np.any(used):
            return
        y,x,cake,powder,grain,slope = (value[used] for value in (y,x,cake,powder,grain,slope))
        self.affected[y,x] = True
        self.cake[y,x] = np.maximum(self.cake[y,x],cake)
        self.powder[y,x] = np.maximum(self.powder[y,x],powder)
        settings = PROFILE['palette']
        dusty = GrainColor(Linear(settings['powder']),grain,.19)
        clean = Linear(self.original['Base'][y,x,:3])
        dry = Dryness(cake,grain.T,Math)
        earth = Mix(Linear(settings['damp']),Linear(settings['dry']),dry[:,None])
        earth = GrainColor(earth,grain,.26)
        base = Mix(Mix(clean,earth,cake[:,None]),dusty,powder[:,None])
        self.data['Base'][y,x,:3] = Srgb(base)
        # The V18 red channel stays exact. Only the actual soil and powder
        # footprints become rougher and less conductive.
        original = self.original['Orm'][y,x,1:3].astype(np.float32)/255
        rough = Mix(*PROFILE['track']['packedRoughness'],dry)
        surface = np.column_stack((rough,np.full(len(rough),.018)))
        film = Mix(Mix(original,surface,cake[:,None]),(.94,.009),powder[:,None])
        if dielectric:
            film[:,1] = original[:,1]
        self.data['Orm'][y,x,1:3] = np.rint(255*film).astype(np.uint8)
        normals = self.original['Normal'][y,x,:3].astype(np.float32)/127.5-1
        normals[:,:2] *= (1-.57*cake)[:,None]
        normals[:,:2] -= np.clip(slope,-1.32,1.32)
        normal = ((Normalize(normals)+1)*127.5).round().astype(np.uint8)
        self.data['Normal'][y,x,:3] = normal

    def Extend(self):
        # Fill one pixel in existing gutters so point-sampling around the
        # modified islands cannot reveal a clean outline. Do not touch AO.
        free = (self.covered==0)&(~self.affected)
        for dy,dx in [(0,1),(1,0),(0,-1),(-1,0)]:
            possible = free&np.roll(self.affected,(dy,dx),(0,1))
            if dy:
                possible[0 if dy>0 else -1,:]=False
            if dx:
                possible[:,0 if dx>0 else -1]=False
            y,x = np.nonzero(possible)
            for channel in ('Base','Normal'):
                self.data[channel][y,x,:3] = self.data[channel][y-dy,x-dx,:3]
            self.data['Orm'][y,x,1:3] = self.data['Orm'][y-dy,x-dx,1:3]
            free[y,x] = False

    def Save(self,directory):
        output = {}
        for key,pixels in self.data.items():
            expected = self.original[key]
            if key=='Orm':
                assert np.array_equal(expected[:,:,0],pixels[:,:,0])
            name = self.stem+key+'.png'
            Image.fromarray(pixels).save(directory/name,compress_level=4)
            mask = np.any(pixels!=expected,axis=-1)
            output[name] = {'sha256':sha256(pixels.tobytes()).hexdigest(),
                            'changedTexels':int(mask.sum()),
                            'metallicSha256':sha256(pixels[:,:,2].tobytes()).hexdigest() if key=='Orm' else None,
                            'aoSha256':sha256(pixels[:,:,0].tobytes()).hexdigest() if key=='Orm' else None}
        return output


def Mix(a,b,w):
    return a+(b-a)*w


def GrainColor(color,grain,strength):
    return np.clip(color*(1+strength*(grain[:,0]-.5)[:,None]+strength*.47*(grain[:,1]-.5)[:,None]),0,1)


def Indices(model,part):
    return model.Access(part['indices']).reshape(-1,3)


def BodyHeight(grain,cake,powder):
    return (grain[:,1]-.5)*PROFILE['body']['reliefM']*(cake+powder*.54)+cake**1.35*.00135


def PaintBody(model,atlas,field):
    visited = set()
    counts = {}
    for node,matrix,part,role in model.Geometry():
        key = node['mesh'],part['material'],part['indices']
        semantic = part.get('extras',{}).get('Type89SurfaceRole',role)
        if key in visited or role not in {'Body','Glass'}:
            continue
        visited.add(key)
        kind = BodyKind(node['name']) if semantic in {'Armor','CastArmor','Steel','Rubber'} else 0
        if kind:
            points,normals,tangents,hands = PrimitiveData(model,part,matrix)
        uv = model.Access(part['attributes']['TEXCOORD_0'])*atlas.size
        for ids in Indices(model,part):
            samples = ScreenTriangle(uv[ids],atlas.size)
            if samples is None:
                continue
            y,x,u,v = samples
            atlas.covered[y,x]=1
            if not kind:
                continue
            p = Interpolate(points[ids],u,v)
            n = Normalize(Interpolate(normals[ids],u,v))
            grain = GrainSample(field,p,False)
            cake,powder = BodyLayers(p.T,n.T,grain.T,kind,Math)
            if not np.any((cake>.018)|(powder>.014)):
                continue
            tangent = Normalize(Interpolate(tangents[ids],u,v))
            bitangent = np.cross(n,tangent)*np.sign(Interpolate(hands[ids,None],u,v))
            h = BodyHeight(grain,cake,powder)
            slopes = []
            for axis in (tangent,bitangent):
                q = p+axis*.0014
                g = GrainSample(field,q,False)
                a,b = BodyLayers(q.T,n.T,g.T,kind,Math)
                slopes.append((BodyHeight(g,a,b)-h)/.0014)
            atlas.Deposit(y,x,cake,powder,grain,np.stack(slopes,axis=-1),False,semantic=='Rubber')
            name = node['name']
            counts[name] = counts.get(name,0)+int(np.count_nonzero(cake>.18))
    return {name:count for name,count in counts.items() if count>0}


def TrackVariant(model,part):
    uv = model.Access(part['attributes']['TEXCOORD_0'])
    x,y = np.floor(uv[0]*2).astype(int)
    assert np.all(np.floor(uv*2)==(x,y))
    return int(x+2*y)


def PaintTracks(model,atlas,field,track):
    visited = set()
    result = {}
    for node,_,part,role in model.Geometry():
        if role!='Track' or node['mesh'] in visited:
            continue
        visited.add(node['mesh'])
        uv = model.Access(part['attributes']['TEXCOORD_0'])*atlas.size
        variant = TrackVariant(model,part) if node['name'].startswith(TRACK) else None
        if variant is not None:
            points,normals,tangents,hands = PrimitiveData(model,part)
            result[variant] = 0
        for ids in Indices(model,part):
            samples = ScreenTriangle(uv[ids],atlas.size)
            if samples is None:
                continue
            y,x,u,v = samples
            atlas.covered[y,x] = 1
            if variant is None:
                continue
            p = Interpolate(points[ids],u,v)
            n = Normalize(Interpolate(normals[ids],u,v))
            material,_,slope = track.Sample(p,n,variant)
            cake = Smooth(.051,.75,material[:,2])
            powder = PROFILE['track']['powderOpacity']*material[:,3]
            if not np.any((cake>.018)|(powder>.014)):
                continue
            grain = GrainSample(field,p,True)
            tangent = Normalize(Interpolate(tangents[ids],u,v))
            bitangent = np.cross(n,tangent)*np.sign(Interpolate(hands[ids,None],u,v))
            amount = PROFILE['track']['reliefGain']
            slopes = amount*np.column_stack(((slope*tangent).sum(axis=-1),(slope*bitangent).sum(axis=-1)))
            atlas.Deposit(y,x,cake,powder,grain,slopes,True)
            result[variant] += int(np.count_nonzero(cake>.34))
    assert set(result)=={0,1,2,3}
    return result


def ClodSwatch(atlas,field):
    preset = RECIPE['tracks']['mudTile']
    x,y = preset['offsetPixels']
    half = preset['halfSizePixels']+4
    region = np.s_[y-half:y+half,x-half:x+half]
    size = half*2
    grain = cv2.resize(field,(size,size),interpolation=cv2.INTER_AREA)
    macro,fine,aggregate = np.moveaxis(grain,-1,0)
    mix = np.clip(.1+.44*macro+.45*aggregate,0,1)
    rgb = Mix(Linear(PROFILE['palette']['damp']),Linear(PROFILE['palette']['dry']),mix[:,:,None])
    rgb *= (.67+.47*macro+.22*fine)[:,:,None]
    atlas.data['Base'][region] = Srgb(rgb)
    dx,dy = Gradient((.0018*macro+.0016*aggregate+.00065*fine).astype(np.float32),.00265,.00265)
    n = Normalize(np.dstack((-dx,-dy,np.ones_like(dx))))
    atlas.data['Normal'][region] = np.rint((n+1)*127.5).astype(np.uint8)
    atlas.data['Orm'][region][:,:,1] = np.rint(255*(.88+.08*mix)).astype(np.uint8)
    atlas.data['Orm'][region][:,:,2] = 4


def Maps(model,before,after):
    CopyInputs(before,after)
    BuildControls(after/'Maps'/'Controls')
    old = Decode(model)
    directory = after/'Game'/'Maps'
    field = ReadRgb(after/'Maps'/'Controls'/GRAIN).astype(np.float32)/65535
    track = TrackControls(after/'Maps'/'Controls'/TRACK_CONTROL)
    atlas = Atlas('Track',old)
    shoe = PaintTracks(model,atlas,field,track)
    atlas.Extend()
    ClodSwatch(atlas,field)
    stats = {'treadsHeavilyPacked':shoe,'treadPowderTexels':int(np.count_nonzero(atlas.powder>.075)),
             'treadCakeTexels':int(np.count_nonzero(atlas.cake>.34))}
    maps = atlas.Save(directory)
    atlas = Atlas('Body',old)
    stats['bodyDeposits'] = PaintBody(model,atlas,field)
    stats['bodyPowderTexels'] = int(np.count_nonzero(atlas.powder>.075))
    atlas.Extend()
    maps.update(atlas.Save(directory))
    report = {'schema':'Type89SedimentReviewV1','baselineRuntimeSha256':PROFILE['baselineRuntimeSha256'],
              'revision':PROFILE['revision'],'reference':PROFILE['reference'],
              'recipeSha256':sha256(PROFILE_TEXT.encode()).hexdigest(),
              'maps':maps,'statistics':stats,'shoeVariants':Tiles()}
    (after/'Review'/'Data_SedimentReview.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(stats,flush=True)


def GameCoords(values):
    return np.column_stack((values[:,0],values[:,2],-values[:,1]))


def CapPrimitive(package,p,faces,origin,radii,material):
    normal = np.zeros_like(p)
    face = p[faces]
    cross = np.cross(face[:,1]-face[:,0],face[:,2]-face[:,0])
    for corner in range(3):
        np.add.at(normal,faces[:,corner],cross)
    normal = Normalize(normal)
    tangent = np.zeros_like(normal)
    tangent[:,0] = 1
    tangent = Normalize(tangent-normal*normal[:,0,None])
    texture = ClodUv(p,origin,radii,RECIPE['tracks']['mudTile'])
    attributes = {
        'POSITION':package.Access(GameCoords(p),'POSITION',3),
        'NORMAL':package.Access(GameCoords(normal),'NORMAL',3),
        'TANGENT':package.Access(np.column_stack((GameCoords(tangent),-np.ones(len(p),np.float32))),'TANGENT',4),
        'TEXCOORD_0':package.Access(texture,'TEXCOORD',2),
    }
    return {'attributes':attributes,'indices':package.Access(faces.reshape(-1),'INDICES',1),'material':material}


def GameClods(model,package):
    document = package.document
    parents = {index:node['name'] for node in model.doc['nodes'] for index in node.get('children',[])}
    result = {}
    for index,node in enumerate(model.doc['nodes']):
        if not node.get('extras',{}).get('battleWearMud'):
            continue
        unique = node['mesh']
        old = model.doc['meshes'][unique]['primitives'][0]
        part = document['meshes'][unique]['primitives'][0]
        p = ToBlender(model.Access(old['attributes']['POSITION']))
        moving = parents[index].startswith(TRACK)
        centre,scale = ClodScale(p,moving)
        points = (p-centre)*scale+centre
        if moving:
            points,faces,origin,radii = ExistingTreadCap(points,node['name'])
            document['meshes'][unique]['primitives'][0] = CapPrimitive(package,points,faces,origin,radii,part['material'])
        else:
            normal = Normalize(ToBlender(model.Access(old['attributes']['NORMAL']))/scale)
            tangent = model.Access(old['attributes']['TANGENT'])
            t = ToBlender(tangent[:,:3])*scale
            t = Normalize(t-normal*(t*normal).sum(axis=-1)[:,None])
            attrs = part['attributes']
            attrs['POSITION'] = package.Access(GameCoords(points),'POSITION',3)
            attrs['NORMAL'] = package.Access(GameCoords(normal),'NORMAL',3)
            attrs['TANGENT'] = package.Access(np.column_stack((GameCoords(t),tangent[:,3])),'TANGENT',4)
        result[node['name']] = scale.tolist()
    assert len(result)==12
    return result


def AddCaps(package):
    doc=package.document
    carriers={node['name']:node for node in doc['nodes']}
    material=next(i for i,mat in enumerate(doc['materials']) if mat['extras']['Type89Role']=='Track')
    for spec in PROFILE['track']['extraCaps']:
        p,faces=ClayCap(spec['origin'],spec['radii'],spec['seed'],False)
        part=CapPrimitive(package,p,faces,spec['origin'],spec['radii'],material)
        carrier=carriers[spec['carrier']]
        node={'name':spec['name'],'mesh':len(doc['meshes']),'extras':{'battleWearMud':True}}
        carrier.setdefault('children',[]).append(len(doc['nodes']))
        doc['meshes'].append({'name':spec['name'],'primitives':[part]})
        doc['nodes'].append(node)


def ReattachClods(document):
    byName = {node['name']:index for index,node in enumerate(document['nodes'])}
    parentOf = {child:index for index,node in enumerate(document['nodes']) for child in node.get('children',[])}
    parents = {}
    for name,carrier in PROFILE['track']['clodCarriers'].items():
        child = byName[name]
        prior = document['nodes'][parentOf[child]]
        target = document['nodes'][byName[carrier]]
        assert prior['name'].startswith(TRACK) and target['name'].startswith(TRACK)
        prior['children'].remove(child)
        if not prior['children']:
            del prior['children']
        target.setdefault('children',[]).append(child)
        parents[name] = {'before':prior['name'],'after':carrier}
    return parents


def Runtime(model,version):
    destination = version/'Review'/'Data_SedimentReview.json'
    report = json.loads(destination.read_text(encoding='utf-8'))
    package = Export(model)
    images = set()
    for image in package.document['images']:
        name = image['name'].removesuffix('.png')+'.png'
        if name not in report['maps']:
            continue
        pixels = np.array(Image.open(version/'Game'/'Maps'/name))
        view = image['bufferView']
        old = np.array(Image.open(BytesIO(model.Bytes(view))))
        if name.endswith('Orm.png'):
            assert np.array_equal(pixels[:,:,0],old[:,:,0])
        package.buffers[view] = Encode(pixels,image['mimeType'])
        images.add(view)
    assert len(images)==6
    layout = {}
    for node in model.doc['nodes']:
        if node['name'].startswith(TRACK) and node['mesh'] not in layout.values():
            layout[TrackVariant(model,model.doc['meshes'][node['mesh']]['primitives'][0])] = node['mesh']
    assert set(layout)=={0,1,2,3}
    for node in package.document['nodes']:
        if node['name'] in report['shoeVariants']:
            node['mesh'] = layout[report['shoeVariants'][node['name']]]
    clods = GameClods(model,package)
    carriers = ReattachClods(package.document)
    AddCaps(package)
    root = next(node for node in package.document['nodes'] if node['name']==ROOT)
    highHash = sha256((version/'Scene_Type89MediumTankHighPbr.blend').read_bytes()).hexdigest()
    root['extras']['surfaceRevision'] = PROFILE['revision']
    root['extras']['gameBake']['highSourceSha256'] = highHash
    package.document['asset']['extras']['Type89Sediment'] = {
        'revision':PROFILE['revision'],'reference':PROFILE['reference'],
        'baselineRuntimeSha256':PROFILE['baselineRuntimeSha256'],'recipeSha256':report['recipeSha256'],
        'aoRedExact':True,'widenedOriginalClods':len(clods),'additionalMudCaps':len(PROFILE['track']['extraCaps'])}
    output = version/'Game'/'Runtime'/GLB
    output.parent.mkdir(parents=True,exist_ok=True)
    pending = output.with_suffix('.build.glb')
    package.Write(pending)
    actual = Glb(pending)
    expected = Count(model)
    extra = len(PROFILE['track']['extraCaps'])
    expected['nodes'] += extra
    expected['meshInstances'] += extra
    assert Count(actual)==expected and expected['renderedTriangles']<=80000
    assert all(actual.doc[k]==model.doc[k] for k in ('materials','textures','scenes'))
    assert all(actual.Bytes(i)==model.Bytes(i) for i in range(len(model.doc['bufferViews'])) if i not in images)
    affectedCarriers = {name for change in carriers.values() for name in change.values()}
    affectedCarriers.update(spec['carrier'] for spec in PROFILE['track']['extraCaps'])
    for old,new in zip(model.doc['nodes'],actual.doc['nodes'][:len(model.doc['nodes'])],strict=True):
        if old['name'] in report['shoeVariants']:
            permitted = {'mesh'}|({'children'} if old['name'] in affectedCarriers else set())
            assert {k:v for k,v in old.items() if k not in permitted}=={k:v for k,v in new.items() if k not in permitted}
        elif old['name']!=ROOT:
            assert old==new
    pending.replace(output)
    report['clodScales'] = clods
    report['clodCarriers'] = carriers
    report['additionalCaps'] = [spec['name'] for spec in PROFILE['track']['extraCaps']]
    report['runtime'] = {**Count(actual),'sha256':sha256(actual.data).hexdigest(),
                        'bytes':len(actual.data),'runtimeMaterials':len(actual.doc['materials']),
                        'highSourceSha256':highHash,
                        'gameSourceSha256':sha256((version/'Game'/'Scene_Type89MediumTankGamePbr.blend').read_bytes()).hexdigest()}
    destination.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(report['runtime'],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('target',type=Path)
    parser.add_argument('stage',choices=('maps','runtime'))
    args=parser.parse_args()
    model=Glb(args.baseline/'Game'/'Runtime'/GLB)
    assert sha256(model.data).hexdigest()==PROFILE['baselineRuntimeSha256']
    if args.stage=='maps':
        Maps(model,args.baseline,args.target)
    else:
        Runtime(model,args.target)
