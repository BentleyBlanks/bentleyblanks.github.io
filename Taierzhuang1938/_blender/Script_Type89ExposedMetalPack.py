"""Recalibrate the exposed steel witnesses in the Type89 game UVs."""
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
    Count, Export, Interpolate, Linear, Normalize, Parts, Projection, Srgb, Textures, TrackControls,
)
from Script_Type89BattleWearMasks import Glb, ScreenTriangle, Shots, Smooth, ToBlender
from Script_Type89ContactAoPack import Encode


HERE = Path(__file__).resolve().parent
PROFILE_FILE = HERE.parent/'Model'/'Type89MediumTank'/'Data_ExposedMetalProfile.json'
PROFILE_TEXT = PROFILE_FILE.read_text(encoding='utf-8')
PROFILE = json.loads(PROFILE_TEXT)
ROOT = 'Model_Type89MediumTank'
GLB = ROOT+'.glb'
HIGH = 'Scene_Type89MediumTankHighPbr.blend'
GAME = 'Scene_Type89MediumTankGamePbr.blend'


def CopyInputs(baseline, target):
    for relative in ('Maps/High','Maps/Controls','Game/Maps'):
        directory = target/relative
        directory.mkdir(parents=True,exist_ok=True)
        for image in (baseline/relative).glob('*.png'):
            if not (directory/image.name).exists():
                shutil.copy2(image,directory/image.name)


def TrackParts(model):
    seen = set()
    for node,_,part,role in model.Geometry():
        if role!='Track' or node['mesh'] in seen:
            continue
        seen.add(node['mesh'])
        attributes = part['attributes']
        vertices = ToBlender(model.Access(attributes['POSITION']))
        normals = ToBlender(model.Access(attributes['NORMAL']))
        uv = model.Access(attributes['TEXCOORD_0'])
        indices = model.Access(part['indices']).reshape(-1,3)
        tile = None
        if node['name'].startswith('Mesh_TrackLink'):
            col,row = np.floor(2*uv[0]).astype(int)
            assert np.all(np.floor(2*uv)==(col,row))
            tile = int(row*2+col)
        yield node['name'],vertices,normals,uv,indices,tile
    assert len(seen)>=4


def Land(config, points, normals, track, tile):
    _,y,z = points.T
    elevation = Smooth(.008,.025,z)
    crest = elevation*Smooth(.12,.85,normals[:,2])
    lip = .82*Smooth(.039,.055,-y)*Smooth(.012,.023,z)
    band = Smooth(*config['leadingBandM'],-y)
    physical = np.maximum(crest,lip)*band
    dirt,_,_ = track.Sample(points,normals,tile)
    clean = 1-Smooth(*config['coveredRamp'],dirt[:,2])
    return Smooth(*config['cleanContactRamp'],physical)*clean


def Exposure(positions, normals, projections, face):
    mask = np.zeros(len(positions),np.float32)
    for projector in projections:
        if projector.MayTouch(face):
            strength,_,_ = projector.Sample(positions,normals)
            mask = np.maximum(mask,strength[:,1])
    return Smooth(*PROFILE['paintExposure']['maskRamp'],mask)


def BodyWeights(model, controls, original):
    projections = [Projection(shot,controls) for shot in Shots()]
    size = original.shape[1::-1]
    painter = np.zeros(original.shape[:2],np.float32)
    hardware = np.zeros_like(painter)
    covered = np.zeros(original.shape[:2],np.uint8)
    for name,role,positions,normals,_,_,uv,indices in Parts(model,'Body'):
        witnesses = []
        if role in ('Armor','CastArmor') and name!='Mesh_BowRoundPortCover':
            witnesses = [item for item in projections if item.MayTouch(positions)]
        jacket = role=='Steel' and name in PROFILE['steelHardware']['meshes']
        for ids in indices:
            sample = ScreenTriangle(uv[ids]*size,size)
            if sample is None:
                continue
            y,x,u,v = sample
            covered[y,x] = 1
            if witnesses:
                face = positions[ids]
                point = Interpolate(face,u,v)
                normal = Normalize(Interpolate(normals[ids],u,v))
                weight = Exposure(point,normal,witnesses,face)
                painter[y,x] = np.maximum(painter[y,x],weight)
            elif jacket:
                config = PROFILE['steelHardware']
                weight = config['strength']*Smooth(*config['metallicRamp'],original[y,x,2]/255)
                hardware[y,x] = np.maximum(hardware[y,x],weight)
    return covered,{'paintExposure':painter,'steelHardware':hardware}


def TrackWeights(model, controls, original):
    size = original.shape[1::-1]
    covered = np.zeros(original.shape[:2],np.uint8)
    weight = np.zeros(original.shape[:2],np.float32)
    track = TrackControls(controls/'Texture_Type89TrackEarthControls.png')
    tiles = set()
    for _,positions,normals,uv,indices,tile in TrackParts(model):
        for ids in indices:
            sample = ScreenTriangle(uv[ids]*size,size)
            if sample is None:
                continue
            y,x,u,v = sample
            covered[y,x] = 1
            if tile is None:
                continue
            tiles.add(tile)
            points = Interpolate(positions[ids],u,v)
            normal = Normalize(Interpolate(normals[ids],u,v))
            value = Land(PROFILE['trackContact'],points,normal,track,tile)
            weight[y,x] = np.maximum(weight[y,x],value)
    assert tiles=={0,1,2,3},tiles
    return covered,{'trackContact':weight}


def Mix(current, target, weight):
    return current+(target-current)*weight


def Apply(base, orm, covered, selector, config):
    active = selector>.006
    edge = ~covered.astype(bool)
    # A one-texel gutter prevents a bright UV seam where two charts meet.
    border = cv2.dilate(selector,np.ones((3,3),np.uint8))
    weight = np.where(edge,border,selector)
    y,x = np.where(weight>.006)
    amount = weight[y,x]
    old = orm[y,x,1:3].astype(np.float32)/255
    target = np.column_stack((np.minimum(old[:,0],config['roughness']),
                              np.maximum(old[:,1],config['metallic'])))
    strengths = amount[:,None]*np.array([config['roughnessBlend'],1],np.float32)
    orm[y,x,1:3] = np.rint(255*Mix(old,target,strengths)).astype(np.uint8)
    color = Linear(base[y,x,:3])
    floor = Linear(config['reflectanceFloorSrgb'])
    base[y,x,:3] = Srgb(Mix(color,np.maximum(color,floor),amount[:,None]*config['colorBlend']))
    return active


def Stats(old, delivered, mask, weight, label):
    core = mask&(weight>.64)
    previous = old[:,:,2]
    current = delivered[:,:,2]
    assert np.count_nonzero(core)>100,label
    return {'coreTexels':int(core.sum()),'affectedUvTexels':int(mask.sum()),
            'oldMedian':round(float(np.median(previous[core]))/255,4),
            'newMedian':round(float(np.median(current[core]))/255,4),
            'oldP90':round(float(np.quantile(previous[core],.9))/255,4),
            'newP90':round(float(np.quantile(current[core],.9))/255,4)}


def BuildMaps(model, baseline, target):
    CopyInputs(baseline,target)
    source,_ = Textures(model)
    controls = target/'Maps'/'Controls'
    report = {'schema':'Type89ExposedMetalReviewV1','revision':PROFILE['revision'],
              'geometryVersion':PROFILE['geometryVersion'],'baseline':PROFILE['baseline'],
              'baselineRuntimeSha256':PROFILE['baselineRuntimeSha256'],
              'profileSha256':sha256(PROFILE_TEXT.encode()).hexdigest(),'regions':{},'maps':{}}
    dest = target/'Game'/'Maps'
    for group, select in [('Body',BodyWeights),('Track',TrackWeights)]:
        original = source[group]['Orm']
        base = source[group]['Base'].copy()
        orm = original.copy()
        covered,selection = select(model,controls,original)
        for label,mask in selection.items():
            affected = Apply(base,orm,covered,mask,PROFILE[label])
            report['regions'][label] = Stats(original,orm,affected,mask,label)
        assert np.array_equal(original[:,:,0],orm[:,:,0])
        for channel,array in [('Base',base),('Orm',orm)]:
            filename = 'Texture_Type89Game'+group+channel+'.png'
            Image.fromarray(array).save(dest/filename,compress_level=3)
            old = source[group][channel]
            assert np.array_equal(array,np.asarray(Image.open(dest/filename)))
            rgbDiff = np.any(array!=old,axis=-1)
            report['maps'][filename] = {'size':list(array.shape[1::-1]),'changedTexels':int(rgbDiff.sum()),
                'pixelSha256':sha256(array.tobytes()).hexdigest(),
                'metallicSha256':sha256(array[:,:,2].tobytes()).hexdigest() if channel=='Orm' else None}
    output = target/'Review'
    output.mkdir(parents=True,exist_ok=True)
    (output/'Data_ExposedMetalReview.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report['regions']),flush=True)


def WriteGame(model,target):
    directory = target/'Review'
    file = directory/'Data_ExposedMetalReview.json'
    report = json.loads(file.read_text(encoding='utf-8'))
    package = Export(model)
    views = set()
    for source in model.doc['images']:
        name = source['name'].removesuffix('.png')+'.png'
        if name not in report['maps']:
            continue
        view = source['bufferView']
        pixels = np.array(Image.open(target/'Game'/'Maps'/name))
        old = np.asarray(Image.open(BytesIO(model.Bytes(view))))
        if name.endswith('Orm.png'):
            assert np.array_equal(pixels[:,:,0],old[:,:,0])
        if pixels.shape[2]==4:
            assert np.array_equal(pixels[:,:,3],old[:,:,3])
        package.buffers[view] = Encode(pixels,source['mimeType'])
        views.add(view)
    assert len(views)==4
    meta = {'revision':PROFILE['revision'],'baselineRuntimeSha256':PROFILE['baselineRuntimeSha256'],
            'profileSha256':report['profileSha256'],
            'highSourceSha256':sha256((target/HIGH).read_bytes()).hexdigest(),'aoChannelExact':True}
    package.document['asset']['extras']['Type89ExposedMetal'] = meta
    root = next(node for node in package.document['nodes'] if node['name']==ROOT)
    root['extras']['surfaceRevision'] = PROFILE['revision']
    root['extras']['gameBake']['highSourceSha256'] = meta['highSourceSha256']
    targetFile = target/'Game'/'Runtime'/GLB
    temp = targetFile.with_suffix('.build.glb')
    targetFile.parent.mkdir(parents=True,exist_ok=True)
    package.Write(temp)
    actual = Glb(temp)
    assert Count(actual)==Count(model) and Count(actual)['renderedTriangles']<=80000
    assert all(actual.doc[key]==model.doc[key] for key in ('meshes','accessors','scenes','materials','textures'))
    assert all(actual.Bytes(i)==model.Bytes(i) for i in range(len(model.doc['bufferViews'])) if i not in views)
    for a,b in zip(actual.doc['nodes'],model.doc['nodes'],strict=True):
        assert a==b or (a['name']==ROOT and all(a[key]==b[key] for key in a if key!='extras'))
    temp.replace(targetFile)
    report['runtime'] = {
        **Count(actual),**meta,'sha256':sha256(actual.data).hexdigest(),'bytes':len(actual.data),
        'verifiedUntouchedPayloads':len(model.doc['bufferViews'])-len(views),
        'gameSourceSha256':sha256((target/'Game'/GAME).read_bytes()).hexdigest(),
    }
    file.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(report['runtime'],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('version',type=Path)
    parser.add_argument('stage',choices=('maps','runtime'))
    args=parser.parse_args()
    model=Glb(args.baseline/'Game'/'Runtime'/GLB)
    assert sha256(model.data).hexdigest()==PROFILE['baselineRuntimeSha256']
    if args.stage=='maps':
        BuildMaps(model,args.baseline,args.version)
    else:
        WriteGame(model,args.version)
