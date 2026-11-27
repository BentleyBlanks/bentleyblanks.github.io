"""Update only baked visibility in the released Type89 material and GLB."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse
import json
import shutil

import cv2
import numpy as np
from PIL import Image

from Script_Type89BattleWearGame import Count, Export, Parts, Textures
from Script_Type89BattleWearMasks import Glb, ScreenTriangle


BASELINE_SHA = '840be511f339c03208da21df9f6d4bb406c957bb1ae6c9e283877b5428c651cc'
REVISION = 'SurfaceV18'
ROOT = 'Model_Type89MediumTank'
GLB = 'Model_Type89MediumTank.glb'
HIGH_BLEND = 'Scene_Type89MediumTankHighPbr.blend'
GAME_BLEND = 'Scene_Type89MediumTankGamePbr.blend'
WEIGHTS = (.68,.50)

WITNESSES = {
    'Body':('Mesh_Hull','Mesh_BowPlate','Mesh_BowMgMount','Mesh_DriverVisionFlap',
            'Mesh_TurretYaw','Mesh_MainGunPitch','Mesh_CommanderCupola',
            'Mesh_SideVisionFrameLeft','Mesh_EngineHatchLeft','Mesh_ExhaustGuard',
            'Mesh_VerticalSkirtLeftFront','Mesh_FrontIdlerLeft','Mesh_RoadWheelLeft01'),
    'Guard':('Mesh_ExhaustGuardPerforatedSheet',),
    'Track':('Mesh_TrackLinkLeft000',),
}


def Read(file):
    return json.loads(file.read_text(encoding='utf-8'))


def Save(file, report):
    file.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')


def RawFields(bands):
    fields = np.load(bands,allow_pickle=False).astype(np.float32)/65535
    # Filter sub-texel variance from the hemisphere samples. Edge padding
    # from the bake makes the same small kernel safe at UV island borders.
    near,mid = (cv2.GaussianBlur(channel,(3,3),.54) for channel in np.moveaxis(fields,-1,0))
    return near,mid


def Refine(old, raw):
    near,mid = RawFields(raw)
    channels = np.array(old,copy=True)
    assert old.shape[:2]==near.shape
    close = np.maximum(0,1-near-.018)
    broader = np.maximum(0,1-mid-.028)
    deficit = WEIGHTS[0]*close**.90 + WEIGHTS[1]*broader**1.15
    contact = np.clip((np.maximum(close,broader*.78)-.062)/.22,0,1)
    contact = contact*contact*(3-2*contact)
    # Accumulate the genuinely blocked sector on top of baked micro-detail.
    # Local geometry, not the existing map's darkness, limits the overlap.
    previous = channels[:,:,0].astype(np.float32)/255
    combined = np.minimum(1-deficit,previous*(1-.68*deficit*contact))
    visibility = np.rint(np.clip(combined,.16,1)*255).astype(np.uint8)
    channels[:,:,0] = np.minimum(channels[:,:,0],visibility)
    return channels


def TexelMask(parts, name, size):
    result = np.zeros((size[1],size[0]),np.uint8)
    for part,_,_,_,_,_,uv,indices in parts:
        if part!=name:
            continue
        for ids in indices:
            sample = ScreenTriangle(uv[ids]*size,size)
            if sample is not None:
                y,x,_,_ = sample
                result[y,x] = 1
    assert result.any(),name
    return result.astype(bool)


def SubsetStats(before, after, mask):
    previous = before[:,:,0][mask]
    current = after[:,:,0][mask]
    delta = previous.astype(np.int16)-current
    assert np.min(delta)>=0
    return {'sampledTexels':len(delta),'strengthenedTexels':int(np.count_nonzero(delta>=15)),
            'fractionStrengthened':round(float(np.mean(delta>=15)),5),
            'oldP12':round(float(np.quantile(previous,.12))/255,4),
            'newP12':round(float(np.quantile(current,.12))/255,4)}


def ProtectReopenedCover(model, atlas):
    # The G55 inner lid was measured during the open pose. Keep that target
    # exactly while the exposed outer hardware and fixed seats are rebaked.
    name = 'Mesh_BowRoundPortCover'
    size = atlas.shape[1::-1]
    protected = np.zeros(atlas.shape[:2],np.uint8)
    for node,_,primitive,role in model.Geometry():
        if node['name']!=name or role!='Armor':
            continue
        attributes = primitive['attributes']
        points = model.Access(attributes['POSITION'])
        uv = model.Access(attributes['TEXCOORD_0'])
        for indices in model.Access(primitive['indices']).reshape(-1,3):
            if np.mean(points[indices,2])<0:
                continue
            sample = ScreenTriangle(uv[indices]*size,size)
            if sample is not None:
                protected[sample[0],sample[1]]=1
    assert protected.any()
    return cv2.dilate(protected,np.ones((5,5),np.uint8)).astype(bool)


def SaveMap(file,old,new):
    assert old.dtype==np.uint8 and np.array_equal(old[:,:,1:],new[:,:,1:])
    Image.fromarray(new).save(file,compress_level=3)
    assert np.array_equal(np.array(Image.open(file)),new)
    return {'file':file.name,'size':list(new.shape[1::-1]),
            'changedTexels':int(np.count_nonzero(old[:,:,0]!=new[:,:,0])),
            'otherChannelsExact':True,'sha256':sha256(file.read_bytes()).hexdigest()}


def ComposeMaps(baseline, version, model):
    buffers,_ = Textures(model)
    stage = version/'Bake'/'AmbientOcclusion'
    report = {'schema':'Type89AmbientOcclusionV1','baseline':'SurfaceV17','revision':REVISION,
              'geometryVersion':'20261126GeometryV55','baselineRuntimeSha256':BASELINE_SHA,
              'weights':list(WEIGHTS),'bake':{},'maps':{},'regions':{}}
    for stageName,target in [('High',version/'Maps'/'High'),('Game',version/'Game'/'Maps')]:
        original = baseline/'Maps'/'High' if stageName=='High' else baseline/'Game'/'Maps'
        target.mkdir(parents=True,exist_ok=True)
        # Store complete editable maps in the versioned directory. Existing
        # channels are copied verbatim, including optional high-resolution inputs.
        for file in original.glob('*.png'):
            if not (target/file.name).exists():
                shutil.copy2(file,target/file.name)
        manifest = Read(stage/stageName/'Data_Bake.json')
        report['bake'][stageName] = manifest
        results = []
        for record in manifest['maps']:
            name = record['source']
            file = original/name
            source = np.array(Image.open(file))
            if stageName=='Game':
                group = name.removeprefix('Texture_Type89Game').removesuffix('Orm.png')
                old = buffers[group]['Orm']
                assert np.array_equal(source[:,:,:3],old[:,:,:3]),name
                source = old
            merged = Refine(source,stage/stageName/record['file'])
            if stageName=='Game':
                if group=='Body':
                    keep = ProtectReopenedCover(model,source)
                    merged[keep,0] = source[keep,0]
                parts = list(Parts(model,group))
                report['regions'][group] = {
                    item:SubsetStats(source,merged,TexelMask(parts,item,source.shape[1::-1]))
                    for item in WITNESSES[group]
                }
            info = SaveMap(target/name,source,merged)
            results.append(info)
        report['maps'][stageName] = results
    controls = version/'Maps'/'Controls'
    controls.mkdir(exist_ok=True)
    for file in (baseline/'Maps'/'Controls').glob('*.png'):
        if not (controls/file.name).exists():
            shutil.copy2(file,controls/file.name)
    Save(version/'Review'/'Data_AmbientOcclusionReview.json',report)
    for name,rows in report['regions'].items():
        print(name,[(key,row['strengthenedTexels'],row['oldP12'],row['newP12']) for key,row in rows.items()],flush=True)


def Encode(new,mime):
    sink = BytesIO()
    image = Image.fromarray(new)
    if mime=='image/webp':
        image.save(sink,format='WEBP',lossless=True,method=4,exact=True)
    else:
        assert mime=='image/png',mime
        image.save(sink,format='PNG',compress_level=4)
    encoded = sink.getvalue()
    assert np.array_equal(new,np.array(Image.open(BytesIO(encoded))))
    return encoded


def Runtime(version, model):
    review = version/'Review'
    audit = Read(review/'Data_AmbientOcclusionReview.json')
    export = Export(model)
    imageViews = set()
    for source in model.doc['images']:
        if not source['name'].removesuffix('.png').endswith('Orm'):
            continue
        view = source['bufferView']
        old = np.array(Image.open(BytesIO(model.Bytes(view))))
        file = source['name'].removesuffix('.png')+'.png'
        new = np.array(Image.open(version/'Game'/'Maps'/file))
        assert np.array_equal(new[:,:,1:],old[:,:,1:])
        assert np.any(new[:,:,0]<old[:,:,0])
        export.buffers[view] = Encode(new,source['mimeType'])
        imageViews.add(view)
    assert len(imageViews)==3
    metadata = {'revision':REVISION,'baselineRuntimeSha256':BASELINE_SHA,'bandsMetres':audit['bake']['Game']['bandsM'],
                'samplesPerBand':audit['bake']['Game']['hemisphereSamplesPerBand'],
                'highSourceSha256':sha256((version/HIGH_BLEND).read_bytes()).hexdigest(),
                'packedOrmRedOnly':True}
    export.document['asset']['extras']['Type89AmbientOcclusion'] = metadata
    root = next(node for node in export.document['nodes'] if node['name']=='Model_Type89MediumTank')
    root['extras']['surfaceRevision'] = REVISION
    root['extras']['gameBake']['highSourceSha256'] = metadata['highSourceSha256']
    root['extras']['gameBake']['ao'] = 'Retained selected-to-active high AO and two distances of assembled local contact occlusion.'
    output = version/'Game'/'Runtime'/GLB
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary = output.with_suffix('.build.glb')
    export.Write(temporary)
    rendered = Glb(temporary)
    assert Count(rendered)==Count(model)
    assert Count(rendered)['renderedTriangles']<=80000
    assert all(rendered.doc[key]==model.doc[key] for key in ('meshes','accessors','scenes','materials','textures'))
    for x,y in zip(model.doc['nodes'],rendered.doc['nodes'],strict=True):
        assert x==y or (x['name']==ROOT and all(x[k]==y[k] for k in x if k!='extras'))
    assert all(rendered.Bytes(index)==model.Bytes(index)
               for index in range(len(model.doc['bufferViews'])) if index not in imageViews)
    temporary.replace(output)
    audit['runtime'] = {**Count(rendered),'sha256':sha256(rendered.data).hexdigest(),
                        'bytes':len(rendered.data),'retainedNonAoPayloads':len(model.doc['bufferViews'])-len(imageViews),
                        'sharedTextures':len(rendered.doc['images']),**metadata,
                        'gameSourceSha256':sha256((version/'Game'/GAME_BLEND).read_bytes()).hexdigest()}
    Save(review/'Data_AmbientOcclusionReview.json',audit)
    print(audit['runtime'],flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('version',type=Path)
    parser.add_argument('stage',choices=('maps','runtime'))
    args = parser.parse_args()
    model = Glb(args.baseline/'Game'/'Runtime'/GLB)
    assert sha256(model.data).hexdigest()==BASELINE_SHA
    if args.stage=='maps':
        ComposeMaps(args.baseline,args.version,model)
    else:
        Runtime(args.version,model)
