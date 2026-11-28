"""Rebuild the cosmetic grip shell and bake the museum-inspired game surfaces."""
import argparse
import hashlib
import io
import json
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter
from scipy.interpolate import PchipInterpolator

from Script_Type38ExteriorFinish import FrameEngraving, PaintBandScuff, ReadGlb, WriteGlb
from Script_Type38EdgeProfiles import BlendCoverCrown, ShapeButtCap, ShapeFittedMiddleBand, ShapeRolledBand, WriteAttributes
from Script_Type38RenderBatches import PackType38, UpdateType38PublishRules


SAMPLES = {
    'grain': ('wood_table_001', 'diff', '4k', '5da68c7ebe8732f029ecbd602cb0d86d2a271e32539df953a0f10efa052b9516'),
    'pores': ('wood_table_001', 'disp', '4k', '64948be76b2384e79459f0d5ac6fd88912c64e71377e3ade2ec7b18480f532f0'),
    'woodGloss': ('wood_table_001', 'rough', '4k', '1349d61fee3ccc6f6b4bfe5f49ebf4803c1d88bd4ba2c6e2fd3a40da84a459af'),
    'steel': ('metal_plate_02', 'rough', '2k', '7abccc92dfebe4c6fd21b57b4de659a3b8be7747434af39306fcff2059927734'),
}

METAL_SOURCES = {
    'Metal009': {'Color':'209d3bb050be9f58c5af179d9712fa7799567a4cd50afd338d37674bdcff765b',
                 'Roughness':'e802f013b93cb1bd4b55cd91f02a1863233475a7f8bd0e6755cfaa447a729674',
                 'Displacement':'8a7dc69978932952ac0155d7475480b3d9f860cdedd5ccc51db9d202e8f583aa'},
    'Metal046B': {'Color':'8263145285430210a6867010abeb09402aad5b9195366e18817a07ab5badc6fe',
                  'Roughness':'82cf613070e28568613b8ed71093c04664015da4f925f13e91928c692edd958a'}
}
COVER_STEEL_TONES = ([59,55,49],[155,149,138])
SIGHT_BEVEL_PARTS = {
    'Exterior_FoldedFrame12': .00018,
    'Exterior_FoldedRoundShoulder47_-1': .00020,
    'Exterior_FoldedRoundShoulder47_1': .00020,
    'Exterior_LowRoundedSupport70': .00021,
    'Exterior_ShortTransverseHead71': .00014,
    'Exterior_RearTransverseRelief49': .00012,
    'T38_430L_VisibleUpperShoulderCoordination': .00019,
}
FRONT_TIP_SKIN = 'T38_430J_Exterior_ImportedRemainder_Plate72'


def FineScanBand(sample, along, gain):
    texture = cv2.GaussianBlur(sample.astype('f'),(0,0),sigmaX=.55,sigmaY=along)
    carrier = cv2.GaussianBlur(texture,(0,0),sigmaX=4.8,sigmaY=along*2.8)
    return np.uint8(np.clip(128+(texture-carrier)*gain,0,255))


def ReadSamples(cache):
    cache.mkdir(exist_ok=True, parents=True)
    layers = {}
    for key, (asset, channel, resolution, digest) in SAMPLES.items():
        leaf = f'{asset}_{channel}_{resolution}.jpg'
        path = cache / leaf
        if not path.is_file():
            url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/{resolution}/{asset}/{leaf}'
            raw = urllib.request.urlopen(url, timeout=120).read()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError(f'Unexpected source at {url}')
            path.write_bytes(raw)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Invalid source: {path}')
        bitmap = np.array(Image.open(path).convert('L'))
        layers[key] = bitmap[155:775, 190:690] if key == 'steel' else bitmap
    layers['woodGrowth'] = cv2.GaussianBlur(layers['grain'], (0,0), sigmaX=15, sigmaY=51)
    layers['woodMicro'] = FineScanBand(layers['pores'],5.1,7.0)
    for asset, channels in METAL_SOURCES.items():
        stem = asset+'_2K-JPG'
        pack = cache/(stem+'.zip')
        download = None
        if not pack.is_file():
            with urllib.request.urlopen('https://ambientcg.com/get?file='+pack.name, timeout=120) as response:
                download = response.read()
        with zipfile.ZipFile(pack if download is None else io.BytesIO(download)) as archive:
            for channel,digest in channels.items():
                raw = archive.read(stem+'_'+channel+'.jpg')
                if hashlib.sha256(raw).hexdigest() != digest:
                    raise ValueError(f'Invalid {asset} {channel} sample')
                bitmap = np.asarray(Image.open(io.BytesIO(raw)).convert('L'))
                layers[asset+channel] = cv2.GaussianBlur(bitmap,(0,0),.8)
        if download is not None:
            with tempfile.NamedTemporaryFile(dir=cache,delete=False) as staging:
                staging.write(download)
            Path(staging.name).replace(pack)
    layers['steelMicro'] = FineScanBand(layers['Metal009Displacement'],2.0,7.6)
    layers['tubeMicro'] = FineScanBand(layers['Metal009Displacement'],6.4,7.6)
    layers['steelPits'] = FineScanBand(layers['Metal046BColor'],.88,9.5)
    return layers


def ReadRoundovers(repo, cache):
    source = Path(__file__).with_name('Script_Type38Roundovers.py')
    version = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
    patch = cache / f'Roundovers_{version}.npz'
    if not patch.is_file():
        cache.mkdir(exist_ok=True,parents=True)
        with tempfile.TemporaryDirectory(dir=cache) as temp:
            args = Path(temp)/'RoundoverArgs.json'
            args.write_text(json.dumps([str(patch)]),encoding='utf8')
            subprocess.run(['node',str(repo/'scripts/Script_BlenderMcp.mjs'),'start',
                            '--batch',str(source),'--batch-args',str(args),'--task','Type38Roundovers'],cwd=repo,check=True)
    with np.load(patch) as data:
        return {key:data[key] for key in data.files}


def Attribute(doc, views, index, width):
    field = doc['accessors'][index]
    return np.frombuffer(views[field['bufferView']], dtype={5123: '<u2', 5125: '<u4', 5126: '<f4'}[field['componentType']]).reshape(-1, width)


def SurfaceAtlas(doc, views, primitive, size, padding=18, indexSpan=None, faceDirections=False):
    attrs = primitive['attributes']
    points = Attribute(doc, views, attrs['POSITION'], 3)
    uv = Attribute(doc, views, attrs['TEXCOORD_0'], 2) * size - .5
    smooth = Attribute(doc, views, attrs['NORMAL'], 3)
    faces = Attribute(doc, views, primitive['indices'], 3).astype(np.int32)
    if indexSpan is not None:
        first, count = indexSpan
        faces = faces[first // 3:(first + count) // 3]
    unique, weld = np.unique(np.round(points, 6), axis=0, return_inverse=True)
    accum = np.zeros((len(unique), 3), np.float32)
    cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    cross /= np.maximum(1e-12, np.linalg.norm(cross, axis=1, keepdims=True))
    for corner in range(3):
        np.add.at(accum, weld[faces[:, corner]], cross)
    accum /= np.maximum(1e-8, np.linalg.norm(accum, axis=1, keepdims=True))
    bend = np.linalg.norm(cross[:, None] - accum[weld[faces]], axis=2)
    field = np.zeros((size[1], size[0], 10 if faceDirections else 7), np.float32)
    valid = np.zeros(field.shape[:2], bool)
    for faceIndex, face in enumerate(faces):
        triangle = uv[face]
        edges = triangle[1:] - triangle[0]
        determinant = edges[0, 0] * edges[1, 1] - edges[1, 0] * edges[0, 1]
        if abs(determinant) < .0001:
            continue
        left, top = np.maximum(np.ceil(triangle.min(axis=0)).astype(int), 0)
        right, bottom = np.minimum(np.floor(triangle.max(axis=0)).astype(int), np.asarray(size) - 1)
        if left > right or top > bottom:
            continue
        cols = np.arange(left, right + 1)[None, :] - triangle[0, 0]
        rows = np.arange(top, bottom + 1)[:, None] - triangle[0, 1]
        weightB = (cols * edges[1, 1] - rows * edges[1, 0]) / determinant
        weightC = (rows * edges[0, 0] - cols * edges[0, 1]) / determinant
        hit = (weightB >= -1e-6) & (weightC >= -1e-6) & (weightB + weightC <= 1.000001)
        if not hit.any():
            continue
        row, col = np.nonzero(hit)
        values = np.column_stack((points[face], smooth[face], bend[faceIndex]))
        if faceDirections:
            values = np.column_stack((values, np.broadcast_to(cross[faceIndex], (3, 3))))
        field[top + row, left + col] = values[0] + weightB[hit, None] * (values[1]-values[0]) + weightC[hit, None] * (values[2]-values[0])
        valid[top + row, left + col] = True
    assert valid.any()
    if not padding:
        return field, valid, valid
    distance, near = distance_transform_edt(~valid, return_indices=True)
    pad = (~valid) & (distance <= padding)
    field[pad] = field[near[0, pad], near[1, pad]]
    return field, valid | pad, valid


def Sample(layer, horizontal, vertical, reflect=False):
    height, width = layer.shape
    if reflect:
        horizontal = 1 - np.abs(np.mod(horizontal, 2) - 1)
        vertical = 1 - np.abs(np.mod(vertical, 2) - 1)
    else:
        horizontal, vertical = horizontal % 1, vertical % 1
    return cv2.remap(layer, (horizontal * (width-1)).astype('f'), (vertical * (height-1)).astype('f'),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype('f')


def Tint(dark, light, factor):
    return np.array(dark, dtype='f') + factor[:, :, None] * (np.array(light, dtype='f') - dark)


def Blend(first, second, mask):
    return first + (second - first) * mask[:, :, None]


def Ramp(low, high, value):
    phase = np.clip((value-low)/(high-low), 0, 1)
    return phase*phase*(3-2*phase)


def ScanOffset(index, salt):
    bits = index.astype(np.uint32)*np.uint32(0x9e3779b1)+np.uint32(salt)
    bits ^= bits >> 16
    bits *= np.uint32(0x7feb352d)
    bits ^= bits >> 15
    bits *= np.uint32(0x846ca68b)
    return ((bits ^ (bits >> 16)) >> 8).astype('f')/16777216


class ScanStrips:
    """Overlap uniquely phased scan regions in the same grain direction."""

    def __init__(self, horizontal, vertical, *, axis, seed, interval=.63, period=None):
        coordinate = horizontal if axis==0 else vertical
        count = None
        if period is not None:
            count = max(2,round(period/interval))
            interval = period/count
        phase = coordinate/interval
        index = np.floor(phase).astype('i')
        self.weight = Ramp(.16,.84,phase-index).astype('f')
        self.variance = np.sqrt(1-2*self.weight*(1-self.weight))
        self.maps = []
        for strip in (index,index+1):
            if count is not None:
                strip = strip % count
            self.maps.append((horizontal+ScanOffset(strip,seed+227)*1.31,
                              vertical+ScanOffset(strip,seed+1379)*1.47))

    def Read(self, layer, neutral, reflect=False):
        lower = Sample(layer,*self.maps[0],reflect=reflect)
        upper = Sample(layer,*self.maps[1],reflect=reflect)
        mix = lower+self.weight*(upper-lower)
        return np.clip(neutral+(mix-neutral)/self.variance,0,255)


def OxideField(horizontal, vertical, seed):
    """Continuous, non-periodic variation below the directional scan detail."""
    col,row = np.floor(horizontal).astype('i'),np.floor(vertical).astype('i')
    x,y = Ramp(0,1,horizontal-col),Ramp(0,1,vertical-row)
    index = col+13171*row
    a = ScanOffset(index,seed)
    b = ScanOffset(index+13171,seed)
    lower = a+x*(ScanOffset(index+1,seed)-a)
    upper = b+x*(ScanOffset(index+13172,seed)-b)
    return (lower+y*(upper-lower))*2-1


def WidenStockChart(doc, views, primitive, material, load, store):
    accessor = doc['accessors'][primitive['attributes']['TEXCOORD_0']]
    uv = Attribute(doc, views, primitive['attributes']['TEXCOORD_0'], 2).copy()
    uv[:,0] = .01+2.77*uv[:,0]
    assert uv.max() < 1 and uv.min() > 0
    views[accessor['bufferView']] = uv.astype('<f4').tobytes()
    accessor.update(min=uv.min(axis=0).tolist(), max=uv.max(axis=0).tolist())
    pbr = material['pbrMetallicRoughness']
    coat = material['extensions']['KHR_materials_clearcoat']
    for slot in (pbr['metallicRoughnessTexture'],coat['clearcoatTexture'],material['extensions']['KHR_materials_specular']['specularTexture']):
        data = load(slot)
        height,width = data.shape[:2]
        matrix = np.float64([[2.77,0,.01*width+(2.77-1)*.5],[0,1,0]])
        store(slot,cv2.warpAffine(data,matrix,(width,height),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE))


def ShapeHandle(doc, views, primitive):
    points = Attribute(doc, views, primitive['attributes']['POSITION'], 3)
    lower, upper = points.min(axis=0), points.max(axis=0)
    extent = upper[0]-lower[0]
    radius = (upper[1]-lower[1])*.5
    origin = (upper+lower)*.5
    segments = 32
    # A simplified visible link shares the handle's display mesh and fills
    # the void between the two moving surfaces throughout the game animation.
    phase = np.array([-.118,-.089,-.052,-.019,.006,.011,.02,.035,.047,.055,.083,.12,.17,.22,.27,.32,.37,.41,.45,.49,
                      .53,.57,.61,.65,.69,.73,.77,.81,.85,.88,.91,.935,.957,.975,.988,.997])
    profile = PchipInterpolator([-.12,-.053,-.019,.006,.03,.075,.13,.30,.39,.46,.50,.56,.64,.74,.80,.87,.92,.96,.985,1],
                                [.44,.52,.59,.67,.72,.54,.43,.42,.45,.49,.60,.83,1.05,1.16,1.17,1.12,.97,.75,.49,0])
    angles = np.linspace(0,2*np.pi,segments+1)
    cosine, sine = np.cos(angles), np.sin(angles)
    positions, normals, tangents, uv, indices = [], [], [], [], []
    for along in phase:
        bulge = radius*profile(along)
        rise = extent*.035*Ramp(.18,.85,along)
        slope = .035*(Ramp(.18,.85,along+.0001)-Ramp(.18,.85,along-.0001))/.0002
        ring = np.column_stack((np.full_like(angles,lower[0]+extent*along),origin[1]+rise+bulge*cosine,origin[2]+bulge*1.03*sine))
        alongVector = np.column_stack((np.ones_like(angles),slope+radius*profile.derivative()(along)*cosine/extent,
                                       1.03*radius*profile.derivative()(along)*sine/extent))
        tangent = alongVector/np.linalg.norm(alongVector,axis=1,keepdims=True)
        outward = np.cross(np.column_stack((np.zeros_like(angles),-sine,1.03*cosine)),tangent)
        positions.extend(ring)
        normals.extend(outward/np.linalg.norm(outward,axis=1,keepdims=True))
        tangents.extend(np.column_stack((tangent,-np.ones_like(angles))))
        chartU = .02+along*(.13 if along<0 else .96)
        uv.extend(np.column_stack((np.full_like(angles,chartU),.02+.96*angles/(2*np.pi))))
    stride = segments+1
    for ring in range(len(phase)-1):
        for section in range(segments):
            near = ring*stride+section
            far = near+stride
            indices.extend([(near,near+1,far),(far,near+1,far+1)])
    for tip in [False,True]:
        axis = 1 if tip else -1
        for section in range(segments):
            polar = len(positions)
            positions.append([upper[0] if tip else lower[0]-.12*extent,origin[1]+(extent*.035 if tip else 0),origin[2]])
            normals.append([axis,0,0])
            angle = (angles[section]+angles[section+1])*.5
            tangents.append([0,-axis*np.cos(angle),-axis*np.sin(angle),-1])
            uv.append([.98 if tip else .003,.02+.96*(section+.5)/segments])
            start = section+((len(phase)-1)*stride if tip else 0)
            indices.append((start,start+1,polar) if tip else (polar,start+1,start))
    for slot, values in [(primitive['attributes'][key],np.asarray(value,'<f4')) for key,value in
                         [('POSITION',positions),('NORMAL',normals),('TANGENT',tangents),('TEXCOORD_0',uv)]] + [(primitive['indices'],np.asarray(indices,'<u2').reshape(-1,1))]:
        accessor = doc['accessors'][slot]
        accessor['count'] = len(values)
        views[accessor['bufferView']] = values.tobytes()
        for key, function in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key] = function(values,axis=0).tolist()
    return len(indices)


def ShapeWindowTrim(doc, views, primitive):
    attrs = primitive['attributes']
    original = Attribute(doc, views, attrs['POSITION'], 3)
    low,high = original.min(axis=0),original.max(axis=0)
    center = (low+high)*.5
    extent = (high-low)*.5
    count = 25
    angle = np.linspace(0,2*np.pi,count+1)
    axis = np.column_stack((np.cos(angle),np.sin(angle)))
    def Rounded(exponent):
        return np.sign(axis)*np.abs(axis)**(2/exponent)
    section = [(0,.19),(.017,.085),(.061,.024),(.17,0),(.80,0),(.962,.064),
               (1,.22),(1,.81),(.925,1),(0,.96)]
    points,uv,faces = [],[],[]
    bands = [(-1,.08,-.34,.255),(.08,1.11,.445,.225)]
    for band,(start,end,opening,span) in enumerate(bands):
        offset=len(points)
        outer = center[[0,2]]+extent[[0,2]]*(Rounded(10)*[1,(end-start)*.5]+[0,(end+start)*.5])
        corner = np.clip(-axis[:,0]*axis[:,1],0,1)*(.17 if band==0 else .055)
        inner = center[[0,2]]+extent[[0,2]]*([-.014,opening]+Rounded(5 if band==0 else 7)*[.55 if band==0 else .62,span]*(1-corner[:,None]))
        for index,(inset,depth) in enumerate(section+[section[0]]):
            base = outer+(inner-outer)*inset
            crown = .28*(1-((base[:,0]-center[0])/extent[0])**2)
            top = high[1]-extent[1]*(.46-crown+.23*band)
            top += .62*extent[1]*band*Ramp(.68,1.04,(base[:,1]-center[2])/extent[2])
            rings = np.column_stack((base[:,0],top-(top-low[1])*depth,base[:,1]))
            points.extend(rings)
            uv.extend(np.column_stack((.025+.95*angle/(2*np.pi),np.full(count+1,.025+.50*band+.45*index/len(section)))))
            if index:
                for segment in range(count):
                    near=offset+(index-1)*(count+1)+segment
                    far=near+count+1
                    faces.extend([(near,far,near+1),(near+1,far,far+1)])
    points,uv,faces = np.asarray(points),np.asarray(uv),np.asarray(faces)
    edgeA=points[faces[:,1]]-points[faces[:,0]]
    edgeB=points[faces[:,2]]-points[faces[:,0]]
    cross=np.cross(edgeA,edgeB)
    assert np.linalg.norm(cross,axis=1).min()>1e-11
    if np.mean(cross[3*count*2:4*count*2,1])<0:
        faces=faces[:,[0,2,1]]
        cross=-cross
    welded,group=np.unique(points.round(8),axis=0,return_inverse=True)
    smooth=np.zeros_like(welded)
    for corner in faces.T:
        np.add.at(smooth,group[corner],cross)
    normals=smooth[group]
    normals/=np.linalg.norm(normals,axis=1,keepdims=True)
    tangents=np.zeros((len(points),4))
    for row in range((len(section)+1)*len(bands)):
        band,index=divmod(row,len(section)+1)
        first=row*(count+1)
        loop=points[first:first+count]
        along=np.roll(loop,-1,axis=0)-np.roll(loop,1,axis=0)
        along=np.vstack((along,along[0]))
        basis=normals[first:first+count+1]
        along-=basis*np.sum(along*basis,axis=1,keepdims=True)
        along/=np.linalg.norm(along,axis=1,keepdims=True)
        forward=(band*(len(section)+1)+(index+1)%len(section))*(count+1)
        delta=points[forward:forward+count+1]-points[first:first+count+1]
        tangents[first:first+count+1,:3]=along
        tangents[first:first+count+1,3]=np.sign(np.sum(np.cross(basis,along)*delta,axis=1))
    assert len(faces)==1000 and np.isfinite(normals).all() and np.all(abs(tangents[:,3])==1)
    for slot,values in [(attrs['POSITION'],points),(attrs['NORMAL'],normals),(attrs['TEXCOORD_0'],uv),
                        (attrs['TANGENT'],tangents),(primitive['indices'],faces.reshape(-1,1))]:
        accessor=doc['accessors'][slot]
        data=values.astype('<f4' if accessor['componentType']==5126 else '<u2')
        views[accessor['bufferView']]=data.tobytes()
        accessor['count']=len(data)
        for key,stat in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key]=stat(data,axis=0).tolist()


def PoseDisplayLoop(doc, views, primitive):
    attrs = primitive['attributes']
    # Add samples only on the long, straight span. Its two end rows alone
    # cannot carry a curved silhouette, regardless of the baked normal map.
    widths = {'POSITION':3, 'NORMAL':3, 'TANGENT':4, 'TEXCOORD_0':2}
    channels = {slot:list(Attribute(doc,views,attrs[slot],width)) for slot,width in widths.items()}
    positions = channels['POSITION']
    pending = Attribute(doc,views,primitive['indices'],3).tolist()
    faces, edgeCenters = [], {}
    while pending:
        tri = pending.pop()
        extent = [abs(positions[tri[i]][0]-positions[tri[(i+1)%3]][0]) for i in range(3)]
        i = np.argmax(extent)
        if extent[i] < .0055:
            faces.append(tri)
            continue
        first,second,third = tri[i], tri[(i+1)%3], tri[(i+2)%3]
        edge = tuple(sorted((first,second)))
        if edge not in edgeCenters:
            edgeCenters[edge] = len(positions)
            for data in channels.values():
                data.append((data[first]+data[second])*.5)
        mid = edgeCenters[edge]
        pending.extend(((first,mid,third),(mid,second,third)))
    points = np.asarray(positions)
    crown = points[points[:,1] > np.quantile(points[:,1], .88)].mean(axis=0)
    angle = np.deg2rad(-46)
    co, si = np.cos(angle), np.sin(angle)
    yaw = np.array([[co,0,si],[0,1,0],[-si,0,co]])
    shape = yaw @ np.array([[.51,0,0],[0,1.64,0],[0,.95,.88]])
    lift = np.array([0,.0048,-.0026])
    local = points-crown
    span = np.max(np.abs(local[:,0]))
    x = local[:,0]/span
    arc = (1-x*x)**2
    depth = np.clip(-local[:,1]/.008,0,1)
    blend = depth**2*(3-2*depth)
    sag = .0037
    jacobian = np.broadcast_to(shape,(len(points),3,3)).copy()
    jacobian[:,1,0] += sag*blend*4*x*(1-x*x)/span
    jacobian[:,1,1] += sag*arc*6*depth*(1-depth)/.008
    for slot,data in channels.items():
        values = np.asarray(data).copy()
        if slot == 'POSITION':
            values[:,:3] = local @ shape.T + crown + lift
            values[:,1] -= sag*arc*blend
        elif slot in ('NORMAL','TANGENT'):
            basis = np.linalg.inv(jacobian).transpose(0,2,1) if slot == 'NORMAL' else jacobian
            values[:,:3] = np.einsum('nij,nj->ni',basis,values[:,:3])
            if slot == 'TANGENT':
                smooth = Attribute(doc,views,attrs['NORMAL'],3)
                values[:,:3] -= smooth*np.sum(values[:,:3]*smooth,axis=1,keepdims=True)
            values[:,:3] /= np.linalg.norm(values[:,:3],axis=1,keepdims=True)
        accessor = doc['accessors'][attrs[slot]]
        accessor['count'] = len(values)
        views[accessor['bufferView']] = values.tobytes()
        for key,stat in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key] = stat(values,axis=0).tolist()
    indices = np.asarray(faces,'<u2').reshape(-1)
    accessor = doc['accessors'][primitive['indices']]
    assert accessor['componentType']==5123 and len(points)<=65536
    accessor['count'] = len(indices)
    views[accessor['bufferView']] = indices.tobytes()
    for key,stat in [('min',np.min),('max',np.max)]:
        if key in accessor:
            accessor[key] = [int(stat(indices))]
    return len(faces)


def RearOutline(angle):
    delta = (np.rad2deg(angle)-190+180)%360-180
    return PchipInterpolator([-180,-40,-29,-19,-9,-3,5,13,20,28,39,180],
                             [0,0,.006,.060,.227,.270,.283,.248,.145,.036,0,0])(delta)


def RearFace(side, up):
    vertical = (up-.0423)/.0166
    horizontal = side/.0166
    radius = np.hypot(vertical,horizontal)
    angle = np.arctan2(vertical,horizontal)
    # The central rows compress toward the rim of the small dished center.
    rows = (np.sqrt(np.maximum(radius,.16))-.49)*13.7
    row = np.rint(rows)
    count = np.maximum(12,np.rint((.49+row/13.7)**2*62))
    around = angle*count/(2*np.pi) + (row%2)*.5
    footprint = (np.abs((rows-row)/.52)**1.4 + np.abs((around-np.rint(around))/.51)**1.4)**(1/1.4)
    beads = np.maximum(0,1-footprint**1.3) * Ramp(.235,.31,radius)*(1-Ramp(.94,1.0,radius/(1+RearOutline(angle))))
    center = .76*np.exp(-(radius/.15)**2)
    ring = .55*np.exp(-((radius-.201)/.027)**2)
    return beads,center+ring,radius


def ShapeRearMedallion(doc, views, primitive):
    attrs = primitive['attributes']
    source = Attribute(doc, views, attrs['POSITION'], 3)
    centerX,centerY = (source.max(axis=0)[:2]+source.min(axis=0)[:2])*.5
    baseRadius = np.ptp(source[:,0])*.5
    radius = baseRadius*1.19
    contact = source[:,2].min()
    rim = source[:,2].max()-.00062
    segments = 72
    angles = np.arange(segments+1)*2*np.pi/segments
    direction = np.column_stack((np.cos(angles),np.sin(angles)))
    ear = RearOutline(angles)
    crown = [(0.045,.028),(.10,.030),(.143,.051),(.175,.099),(.201,.106),
             (.225,.092),(.285,.081),(.43,.072),(.62,.056),(.79,.037),(.93,.013),(.954,.006),(.975,0)]
    positions,texcoords,indices = [],[],[]
    def Ring(xy,depth,chart):
        first = len(positions)
        axial = np.broadcast_to(depth,len(xy))
        positions.extend(np.column_stack((centerX+xy[:,0]*radius,centerY+xy[:,1]*radius,axial)))
        texcoords.extend(chart)
        return np.arange(first,first+len(xy))
    def Connect(inner,outer):
        for segment in range(segments):
            indices.extend([(inner[segment],outer[segment],outer[segment+1]),(inner[segment],outer[segment+1],inner[segment+1])])
    def FaceUv(xy):
        return np.column_stack((.408+.29*xy[:,0],.48-.40*xy[:,1]))
    faceRings = []
    for distance,height in crown:
        xy = direction*distance*(1+ear[:,None]*Ramp(.15,.84,distance))
        faceRings.append(Ring(xy,rim+radius*(height-.035*xy[:,1]**2),FaceUv(xy)))
    faceCenter = len(positions)
    positions.append((centerX,centerY,rim+radius*.031))
    texcoords.append((.408,.48))
    for segment in range(segments):
        indices.append((faceCenter,faceRings[0][segment],faceRings[0][segment+1]))
    for inner,outer in zip(faceRings,faceRings[1:]):
        Connect(inner,outer)
    shoulder = [(0,.975,1),(.016,.989,1),(.034,.998,1),(.057,1,.99),(.11,.994,.95),
                (.26,.937,.69),(.39,.901,.30),(.57,.90,0),(.83,.89,0),(1,.87,0)]
    sideRings = []
    for advance,scale,tab in shoulder:
        shoulderScale = 1+(baseRadius/radius-1)*Ramp(.11,.83,advance)
        xy = direction*scale*shoulderScale*(1+tab*ear[:,None])
        axial = rim+(contact-rim)*advance-radius*.035*xy[:,1]**2*(1-advance)
        chart = np.column_stack((.75+.23*advance*np.ones_like(angles),.025+.83*angles/(2*np.pi)))
        sideRings.append(Ring(xy,axial,chart))
    for inner,outer in zip(sideRings,sideRings[1:]):
        Connect(inner,outer)
    back = Ring(direction*.87*baseRadius/radius,contact,direction*.030+np.array([.804,.936]))
    backCenter = len(positions)
    positions.append((centerX,centerY,contact))
    texcoords.append((.804,.936))
    for segment in range(segments):
        indices.append((backCenter,back[segment+1],back[segment]))
    points = np.array(positions)
    uv = np.array(texcoords)
    faces = np.asarray(indices)
    edgeA,edgeB = points[faces[:,1]]-points[faces[:,0]],points[faces[:,2]]-points[faces[:,0]]
    normals = np.cross(edgeA,edgeB)
    uvA,uvB = uv[faces[:,1]]-uv[faces[:,0]],uv[faces[:,2]]-uv[faces[:,0]]
    det = uvA[:,0]*uvB[:,1]-uvA[:,1]*uvB[:,0]
    assert np.min(np.abs(det))>1e-10 and np.linalg.norm(normals,axis=1).min()>1e-10
    tangent = (edgeA*uvB[:,1,None]-edgeB*uvA[:,1,None])/det[:,None]
    bitangent = (edgeB*uvA[:,0,None]-edgeA*uvB[:,0,None])/det[:,None]
    weld,group = np.unique(points.round(7),axis=0,return_inverse=True)
    smooth = np.zeros_like(weld)
    sideways = np.zeros_like(points)
    vertical = np.zeros_like(points)
    for corner in faces.T:
        np.add.at(smooth,group[corner],normals)
        np.add.at(sideways,corner,tangent)
        np.add.at(vertical,corner,bitangent)
    smooth = smooth[group]
    smooth /= np.linalg.norm(smooth,axis=1,keepdims=True)
    sideways -= smooth*np.sum(smooth*sideways,axis=1,keepdims=True)
    sideways /= np.linalg.norm(sideways,axis=1,keepdims=True)
    handedness = np.sign(np.sum(np.cross(smooth,sideways)*vertical,axis=1))
    assert np.isfinite(sideways).all() and np.all(abs(handedness)==1)
    for slot,array in [(attrs['POSITION'],points),(attrs['NORMAL'],smooth),(attrs['TANGENT'],np.column_stack((sideways,handedness))),
                       (attrs['TEXCOORD_0'],uv),(primitive['indices'],faces.reshape(-1,1))]:
        accessor = doc['accessors'][slot]
        data = array.astype('<u2' if accessor['componentType']==5123 else '<f4')
        accessor['count'] = len(data)
        views[accessor['bufferView']] = data.tobytes()
        for key,stat in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key] = stat(data,axis=0).tolist()


def MedallionRelief(doc, views, primitive, field, valid, padded):
    attrs = primitive['attributes']
    tangents = Attribute(doc, views, attrs['TANGENT'], 4)
    uv = Attribute(doc, views, attrs['TEXCOORD_0'], 2)
    height,width = valid.shape
    chart = np.rint(uv*[width,height]-.5).astype(int)
    indexMap = np.zeros((height,width),np.int32)
    faces = Attribute(doc, views, primitive['indices'], 3).astype(int)
    for index,face in enumerate(faces):
        cv2.fillConvexPoly(indexMap,chart[face].astype('int32'),index+1)
    faceMask = (field[:,:,5]>.56)&(field[:,:,2]>-.053)&padded
    rows,cols = np.nonzero(faceMask)
    selected = faces[np.maximum(indexMap[rows,cols]-1,0)]
    frameN = field[rows,cols,3:6]
    frameN = frameN/np.maximum(np.linalg.norm(frameN,axis=1,keepdims=True),1e-6)
    frameT = tangents[selected,:3].mean(axis=1)
    frameT -= frameN*np.sum(frameT*frameN,axis=1,keepdims=True)
    frameT /= np.maximum(np.linalg.norm(frameT,axis=1,keepdims=True),1e-6)
    frameB = np.cross(frameN,frameT)*np.sign(tangents[selected,3].mean(axis=1,keepdims=True))
    side,up = field[rows,cols,0],field[rows,cols,1]
    def Height(side,up):
        beads,_,radius = RearFace(side,up)
        lip = Ramp(.085,.177,radius)*(1-Ramp(.202,.294,radius))
        return .00029*beads + .00049*lip + .0078*(1-np.minimum(radius,1.3)**2)
    step = .000045
    gradX = (Height(side+step,up)-Height(side-step,up))/(2*step)
    gradY = (Height(side,up+step)-Height(side,up-step))/(2*step)
    target = np.column_stack((-gradX,-gradY,np.ones_like(side)))
    target /= np.linalg.norm(target,axis=1,keepdims=True)
    tangentSpace = np.column_stack((np.sum(target*frameT,axis=1),np.sum(target*frameB,axis=1),np.sum(target*frameN,axis=1)))
    weight = Ramp(.56,.83,frameN[:,2])*Ramp(-.053,-.0519,field[rows,cols,2])
    return rows,cols,tangentSpace,weight


def WoodSeat(side, up, length):
    along = Ramp(-.075,-.066,length)*(1-Ramp(-.059,-.050,length))
    shoulder = 1-Ramp(.0095,.019,np.abs(side))
    return along*shoulder*Ramp(.023,.029,up)


def EaseVisibleWoodSeat(doc, views, primitive):
    attrs = primitive['attributes']
    points = Attribute(doc,views,attrs['POSITION'],3)
    normals = Attribute(doc,views,attrs['NORMAL'],3)
    tangents = Attribute(doc,views,attrs['TANGENT'],4)
    uv = Attribute(doc,views,attrs['TEXCOORD_0'],2)
    faces = Attribute(doc,views,primitive['indices'],3)
    depth = .0019
    moved = points.copy()
    moved[:,1] -= depth*WoodSeat(*points.T)
    # Transform the original normal and tangent by the local deformation.
    # The wood chart stays in place while the visible cut eases into the wrist.
    steps = np.eye(3)*.00002
    gradient = np.column_stack([(WoodSeat(*(points+step).T)-WoodSeat(*(points-step).T))/.00004 for step in steps])
    basis = np.repeat(np.eye(3)[None,:,:],len(points),axis=0)
    basis[:,1] -= depth*gradient
    normalMap = np.linalg.inv(basis).swapaxes(1,2)
    normal = np.einsum('nij,nj->ni',normalMap,normals)
    normal /= np.linalg.norm(normal,axis=1,keepdims=True)
    tangent = np.einsum('nij,nj->ni',basis,tangents[:,:3])
    tangent -= normal*np.sum(normal*tangent,axis=1,keepdims=True)
    tangent /= np.linalg.norm(tangent,axis=1,keepdims=True)
    WriteAttributes(doc,views,primitive,moved,normal,np.column_stack((tangent,tangents[:,3])),uv,faces)


def RearEdgeWear(part, field, width):
    side,up,length,normalSide,normalUp,normalLength,bend = np.moveaxis(field,2,0)
    axis = np.abs(normalLength)
    turn = Ramp(.12,.64,axis)*(1-Ramp(.86,.994,axis))
    curve = Ramp(.065,.42,bend)
    if part in ('T38_430B_IndependentLeftCoverSkin','T38_430B_RetainedRightCoverHalf'):
        rear = Ramp(-.076,-.0693,length)*np.maximum(turn,.72*curve)
        if part == 'T38_430B_RetainedRightCoverHalf':
            notch = Ramp(-.126,-.119,length)*(1-Ramp(-.096,-.087,length))
            notch *= Ramp(.009,.016,side)*Ramp(.038,.051,up)
            rear = np.maximum(rear,notch*np.maximum(curve,.37*turn))
        return rear
    if part == 'Exterior_HandleOval08':
        across = (np.arange(width,dtype='f')+.5)/width
        root = Ramp(.006,.023,across)*(1-Ramp(.076,.133,across))
        return root*np.maximum(curve,Ramp(.14,.68,np.abs(normalSide)))
    if part == 'T38_435F2_IndependentTailNeckExterior':
        front = np.exp(-((length+.0668)/.0021)**2)
        rear = np.exp(-((length+.0534)/.0018)**2)
        return np.maximum(front,rear)*np.maximum(turn,.78*curve)
    if part == 'T38_435F2_VisualBackingRearEnd':
        return Ramp(-.073,-.068,length)*np.maximum(turn,.58*curve)
    if part == 'T38_433E_VisibleSideBlockRimInset':
        return curve*Ramp(.014,.030,up)
    if part == 'T38_440D2_IndependentVisibleRecess':
        across = (np.arange(width,dtype='f')+.5)/width
        return Ramp(.745,.752,across)*(1-Ramp(.778,.802,across))
    return 0


def EaseSightBevels(doc, views, primitive, part):
    attrs = primitive['attributes']
    points = Attribute(doc,views,attrs['POSITION'],3)
    normal = Attribute(doc,views,attrs['NORMAL'],3)
    tangent = Attribute(doc,views,attrs['TANGENT'],4)
    uv = Attribute(doc,views,attrs['TEXCOORD_0'],2)
    triangles = Attribute(doc,views,primitive['indices'],3)
    _,orig,weld = np.unique(points.round(7),axis=0,return_index=True,return_inverse=True)
    corners = points[orig]
    faces = weld[triangles]
    current = corners[faces]
    planes = np.cross(current[:,1]-current[:,0],current[:,2]-current[:,0])
    planes /= np.maximum(1e-12,np.linalg.norm(planes,axis=1,keepdims=True))
    vertexNormals = np.zeros_like(corners)
    for i in range(3):
        np.add.at(vertexNormals,faces[:,i],planes)
    vertexNormals /= np.maximum(1e-9,np.linalg.norm(vertexNormals,axis=1,keepdims=True))
    mismatch = np.max(1-np.sum(planes[:,None,:]*vertexNormals[faces],axis=2),axis=1)
    curvature = np.zeros(len(corners),dtype='f')
    planar = np.zeros(len(corners),dtype='f')
    for i in range(3):
        np.maximum.at(curvature,faces[:,i],mismatch)
        np.maximum.at(planar,faces[:,i],np.abs(planes[:,1]))
    pairs = np.unique(np.sort(np.stack((faces,np.roll(faces,-1,axis=1)),axis=2).reshape(-1,2),axis=1),axis=0)
    a,b = pairs.T
    delta = corners[b]-corners[a]
    inverse = 1/np.maximum(np.linalg.norm(delta,axis=1),.00008)
    step = np.zeros_like(corners)
    count = np.zeros(len(corners),dtype='f')
    np.add.at(step,a,delta*inverse[:,None]);np.add.at(step,b,-delta*inverse[:,None])
    np.add.at(count,a,inverse);np.add.at(count,b,inverse)
    step /= np.maximum(count,1)[:,None]
    weight = Ramp(.012,.13,curvature)
    if part == 'Exterior_FoldedFrame12':
        weight *= 1-Ramp(.934,.991,planar)
    if part == 'Exterior_ShortTransverseHead71':
        lateral = np.abs(corners[:,0]-.5*(corners[:,0].max()+corners[:,0].min()))
        weight *= Ramp(np.ptp(corners[:,0])*.31,np.ptp(corners[:,0])*.47,lateral)
    cap = SIGHT_BEVEL_PARTS[part]
    step *= np.minimum(.26,cap/np.maximum(1e-12,np.linalg.norm(step,axis=1)))[:,None]*weight[:,None]
    updated = corners+step
    shifted = updated[faces]
    plane = np.cross(shifted[:,1]-shifted[:,0],shifted[:,2]-shifted[:,0])
    plane /= np.maximum(1e-12,np.linalg.norm(plane,axis=1,keepdims=True))
    turn = np.zeros_like(corners)
    for i in range(3):
        np.add.at(turn,faces[:,i],plane)
    turn /= np.maximum(1e-9,np.linalg.norm(turn,axis=1,keepdims=True))
    smooth = normal+(turn[weld]-normal)*(.46*weight[weld,None])
    smooth /= np.linalg.norm(smooth,axis=1,keepdims=True)
    direction = tangent[:,:3]-smooth*np.sum(tangent[:,:3]*smooth,axis=1,keepdims=True)
    direction /= np.linalg.norm(direction,axis=1,keepdims=True)
    WriteAttributes(doc,views,primitive,points+step[weld],smooth,np.column_stack((direction,tangent[:,3])),uv,triangles)


def CleanDisplayTip(doc, views, primitive):
    attrs = primitive['attributes']
    points = Attribute(doc,views,attrs['POSITION'],3).copy()
    normal = Attribute(doc,views,attrs['NORMAL'],3).copy()
    tangent = Attribute(doc,views,attrs['TANGENT'],4).copy()
    uv = Attribute(doc,views,attrs['TEXCOORD_0'],2)
    index = Attribute(doc,views,primitive['indices'],3)
    tri = points[index]
    cap = (tri[:,:,2].max(axis=1)<-.978)&(tri[:,:,1].min(axis=1)>.0535)
    top = np.unique(index[cap])
    height = points[top,1].max()
    slope = np.clip(np.polyfit(points[top,2],points[top,1],1)[0],-.14,.14)
    axis = points[top,2]*slope
    # One facing plane makes the small cap read as a single finish.
    for old,value in zip(points[top].copy(),height+axis-axis.max(),strict=True):
        matching = np.max(np.abs(points-old),axis=1)<1e-7
        points[matching,1] = value
    basis = np.array([0,1,-slope],dtype='f')
    basis /= np.linalg.norm(basis)
    normal[top] = basis
    direction = tangent[:,:3]-normal*np.sum(tangent[:,:3]*normal,axis=1,keepdims=True)
    direction /= np.linalg.norm(direction,axis=1,keepdims=True)
    WriteAttributes(doc,views,primitive,points,normal,np.column_stack((direction,tangent[:,3])),uv,index)


def PoreField(length, transverse):
    def Hash(col, row, salt):
        value = col.astype('uint32')*np.uint32(3266489917) + row.astype('uint32')*np.uint32(668265263) + np.uint32(salt)
        value ^= value >> 15
        value *= np.uint32(2246822519)
        return ((value ^ (value >> 13)) >> 8).astype('f')/16777216
    along = length*331
    across = transverse*764+.17*np.sin(length*82)
    col,row = np.floor(along).astype('i'),np.floor(across).astype('i')
    offsetX = along-col-.24-.52*Hash(col,row,117)
    offsetY = across-row-.25-.50*Hash(col,row,1891)
    size = Hash(col,row,7201)
    distance = (offsetX/(.13+.23*size))**2 + ((offsetY+.13*offsetX)/(.12+.13*size))**2
    return (1-Ramp(.18,1,distance))*Ramp(.18,.77,Hash(col,row,3343))


def StockShadingBasis(doc, views, primitive, field, mask):
    rows,cols = np.nonzero(mask)
    height,width = mask.shape
    attrs = primitive['attributes']
    triangles = Attribute(doc,views,primitive['indices'],3).astype(int)
    uv = Attribute(doc,views,attrs['TEXCOORD_0'],2)
    chart = np.rint(uv*[width,height]-.5).astype('int32')
    chartIds = np.zeros((height,width),np.int32)
    for index,face in enumerate(triangles):
        cv2.fillConvexPoly(chartIds,chart[face],index+1)
    vertices = triangles[np.maximum(chartIds[rows,cols]-1,0)]
    tangents = Attribute(doc,views,attrs['TANGENT'],4)[vertices]
    surface = field[rows,cols,3:6].copy()
    surface /= np.maximum(np.linalg.norm(surface,axis=1,keepdims=True),1e-6)
    tangent = tangents[:,:,:3].mean(axis=1)
    tangent -= surface*np.sum(tangent*surface,axis=1,keepdims=True)
    tangent /= np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-6)
    binormal = np.cross(surface,tangent)*np.sign(tangents[:,:,3].mean(axis=1,keepdims=True))
    return rows,cols,surface,tangent,binormal


def InlayShading(doc, views, primitive, field, inlay, stripCenter, wear):
    rows,cols,surface,tangent,binormal = StockShadingBasis(doc,views,primitive,field,inlay>.002)
    along = field[rows,cols,2]
    cross = np.clip((field[rows,cols,1]-stripCenter[rows,cols])/.00212,-.98,.98)
    acrossSlope = (.48+.19*wear[rows,cols])*cross/np.sqrt(1-cross**2)
    tipSlope = np.clip((-.673-along)/.00212,-1,1)*(along<-.673)
    perturbed = surface+np.column_stack((np.zeros_like(along),acrossSlope,-.65*tipSlope))
    perturbed /= np.maximum(np.linalg.norm(perturbed,axis=1,keepdims=True),1e-6)
    target = np.column_stack((np.sum(perturbed*tangent,axis=1),np.sum(perturbed*binormal,axis=1),np.sum(perturbed*surface,axis=1)))
    return rows,cols,target


def VarnishTraces(length, transverse, positiveSide):
    rng = np.random.default_rng(381713)
    traces = np.zeros_like(length)
    chips = np.zeros_like(length)
    for low,high,count in [(-.9,-.70,8),(-.70,-.56,15),(-.56,-.16,16),(-.16,.04,7),(.04,.25,9)]:
        for index in range(count):
            center = rng.uniform(low,high)
            elevation = rng.uniform(-.068,-.009) if low>0 else rng.uniform(.009,.037)
            extent = rng.uniform(.0019,.0062)
            selected = (np.abs(length-center)<extent)&(np.abs(transverse-elevation)<.004)&positiveSide
            if not selected.any():
                continue
            phase = (length[selected]-center)/extent
            direction = rng.uniform(-.43,.43)
            width = rng.uniform(.00022,.00051)
            distance = np.abs(transverse[selected]-elevation - extent*(direction*phase+.11*phase**2))
            feather = (1-Ramp(.40,1,np.abs(phase)))*(.61+.39*np.cos(phase*3.21+index)**2)
            opacity = (1-Ramp(width*.22,width*1.60,distance))*feather
            target = chips if index%4==0 else traces
            target[selected] = np.maximum(target[selected],opacity)
    return traces,chips


def WoodUseDents(side, up, length, normalSide, grain, crown):
    """Localized compressed fibres and small losses in the old wood finish."""
    stations = (
        ((-.610,.046,.0037,.0017,.26),(-.557,.048,.0044,.0020,-.19),
         (-.472,.044,.0026,.0015,.14),(-.393,.050,.0034,.0016,.32)) if crown else
        ((-.866,.024,.0033,.0018,.23),(-.758,.026,.0048,.0025,-.19),
         (-.640,.028,.0051,.0024,.41),(-.585,.024,.0040,.0018,-.32),
         (-.519,.017,.0035,.0016,.12),(-.202,.018,.0044,.0021,.33),
         (-.107,.012,.0058,.0027,-.39),(-.025,.001,.0037,.0018,.17),
         (.074,-.030,.0046,.0022,-.27),(.147,-.045,.0054,.0029,.43),
         (.197,-.056,.0061,.0032,-.38),(.232,-.018,.0039,.0023,.76))
    )
    depression = np.zeros_like(length)
    exposed = np.zeros_like(length)
    shoulder = np.zeros_like(length)
    rng = np.random.default_rng(38129 if crown else 38121)
    face = Ramp(.16,.70,np.abs(normalSide))
    placements = [(*station,-1 if index%3==0 else 1) for index,station in enumerate(stations)]
    if not crown:
        placements.extend((
            (-.591,.0243,.0052,.0028,-.25,1),(-.644,.0212,.0055,.0028,.48,1),
            (-.6635,.0225,.0064,.0026,.22,1),(-.101,.012,.0062,.0029,-.36,-1),
            (-.0754,.0138,.0046,.0025,.32,-1),(-.0527,.0123,.0050,.0024,-.15,-1),
        ))
    for index,(z,y,wide,high,angle,sign) in enumerate(placements):
        local = face*Ramp(.001,.009,side*sign)
        chipStrength = .68+.26*np.sin(2.41*index+.85)
        for attempt in range(3):
            dz = length-z-(rng.uniform(-.013,.012) if attempt else 0)
            dy = up-y-(rng.uniform(-.005,.005) if attempt else 0)
            axis = angle+rng.uniform(-.35,.35)
            c,s = np.cos(axis),np.sin(axis)
            size = 1 if attempt==0 else rng.uniform(.25,.58)
            across = (c*dz-s*dy)/(wide*size)
            along = (s*dz+c*dy)/(high*size)
            asymmetry = .052*np.sin(4*np.arctan2(along,across)+index)
            radius = np.maximum(0,np.hypot(across,along)+.085*grain+asymmetry)
            bowl = (1-Ramp(.13,1.02,radius))**1.39*local
            rim = np.exp(-((radius-.79)/.15)**2)*local
            fracture = Ramp(-.20,.84,.63*grain+.79*across-.46*along)
            lip = Ramp(.32,.68,radius)*(1-Ramp(.79,1.02,radius))*local
            broken = (.27*bowl+.63*lip)*fracture*chipStrength
            depression = np.maximum(depression,bowl*(.92 if attempt==0 else .63))
            exposed = np.maximum(exposed,broken*(1 if attempt==0 else .53))
            shoulder = np.maximum(shoulder,rim*(.65 if attempt==0 else .33))
    return depression,exposed,shoulder


def FinishSteelAtlas(doc, views, source, load, store):
    primitives = {node['extras']['SourceObject']:doc['meshes'][node['mesh']]['primitives'][0]
                  for node in doc['nodes'] if 'mesh' in node}
    host = primitives['T38_430B_ContinuousLowerFacing_VisualOnly']
    atlas = doc['materials'][host['material']]['pbrMetallicRoughness']
    base = load(atlas['baseColorTexture'])
    orm = load(atlas['metallicRoughnessTexture'])
    left,top,width,height,gutter = 266,104,704,256,16
    region = np.s_[top:top+height,left:left+width]
    assert base.shape == orm.shape == (1024,1024,3) and not orm[region][:,:,1].any()

    # Both inset shells use the same projected finish across their common edge.
    names = ['T38_340_VisibleStaticSkin_Nonfunctional','T38_349_OpaqueExteriorWeb_VisualOnly']
    charts = {}
    for name in names:
        pos = Attribute(doc,views,primitives[name]['attributes']['POSITION'],3)
        charts[name] = np.column_stack((pos[:,2]+.031*pos[:,0],pos[:,0]+.55*pos[:,1]+.02*pos[:,2]))
    allPoints = np.vstack(list(charts.values()))
    origin,span = allPoints.min(axis=0), np.ptp(allPoints,axis=0)
    coverage = {}
    for name,chart in charts.items():
        primitive = primitives[name]
        local = (chart-origin)/span*[width-2*gutter,height-2*gutter]+gutter
        data = np.asarray((local+[left,top])/1024,dtype='<f4')
        mask = np.zeros((height,width),np.uint8)
        pixels = np.rint(local-.5).astype(np.int32)
        for face in Attribute(doc,views,primitive['indices'],3):
            cv2.fillConvexPoly(mask,pixels[face],1)
        coverage[name] = mask.astype(bool)
        primitive['attributes']['TEXCOORD_0'] = len(doc['accessors'])
        doc['accessors'].append(dict(bufferView=len(views),componentType=5126,count=len(data),type='VEC2',
                                     min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist()))
        doc['bufferViews'].append(dict(buffer=0,target=34962,byteLength=data.nbytes))
        views.append(data.tobytes())
        doc['materials'][primitive['material']]['pbrMetallicRoughness'] = {
            key:dict(atlas[key]) for key in ('baseColorTexture','metallicRoughnessTexture')}

    y,x = np.mgrid[:height,:width].astype('f')
    u = (x+.5-gutter)/(width-2*gutter)*span[0]*7.1+.32
    v = (y+.5-gutter)/(height-2*gutter)*.62+.18
    brushScan = ScanStrips(u,v,axis=0,seed=9083)
    grain = np.clip((brushScan.Read(source['Metal009Color'],148)-148)/13,-1.7,1.7)
    brush = np.clip((brushScan.Read(source['Metal009Roughness'],119)-119)/24,-1.8,1.8)
    oxideScan = ScanStrips(u*.81+.16,v+.4,axis=0,seed=1727)
    patina = np.clip((oxideScan.Read(source['Metal046BColor'],63)-63)/20,-1.5,1.5)
    rough = 110+12*brush+9*patina
    base[region] = np.rint(Tint([67,64,58],[156,151,140],.46+.19*patina+.085*grain))
    orm[region] = np.rint(np.dstack((np.full_like(x,255),rough,240+7*patina)))
    # Store the grip's longitudinal brush direction in another unused part of the numeric atlas.
    # The outer end keeps a more elongated glint in the oblique reference photograph.
    tileX,tileY,tileW,tileH = 480,464,144,40
    brushTile = orm[tileY:tileY+tileH,tileX:tileX+tileW]
    assert not brushTile[:,:,1].any()
    border = 8
    along = (np.arange(tileW)+.5-border)/(tileW-2*border)
    around = (np.arange(tileH)+.5-border)/(tileH-2*border)
    # Keep directional wear along the stem and oval. Fade it at the pole,
    # where the longitudinal tangent is undefined.
    stemFinish = 1-Ramp(.36,.57,along)
    ovalFinish = Ramp(.64,.89,along)*(1-Ramp(.944,.979,along))
    # Turn the tangent only in the isotropic gap so the glint cannot kink at the junction.
    turn = Ramp(.575,.64,along)
    angle = np.deg2rad(132)*(1-turn)+.08*turn
    brushTile[:,:,0] = np.rint(127.5*(1+np.cos(angle)))
    brushTile[:,:,1] = np.rint(127.5*(1+np.sin(angle)))
    # The flank seen in the side photograph retains a more directional sheen.
    # Use a continuous circumferential field that meets at the UV seam.
    flank = .45+.55*Ramp(-.35,.75,-np.sin((around-.02)*2*np.pi/.96))
    shoulderSheen = .055*Ramp(.60,.64,along)*(1-Ramp(.73,.89,along))
    strength = .39*stemFinish+shoulderSheen+.43*ovalFinish*flank[:,None]
    brushTile[:,:,2] = np.rint(255*np.clip(strength/.43,0,1))
    uvTransform = dict(offset=[(tileX+border)/1024,(tileY+border)/1024],
                       scale=[(tileW-2*border)/1024,(tileH-2*border)/1024])
    directionMap = dict(atlas['metallicRoughnessTexture'],extensions={'KHR_texture_transform':uvTransform})
    handleMaterial = doc['materials'][primitives['Exterior_HandleOval08']['material']]
    handleMaterial.setdefault('extensions',{})['KHR_materials_anisotropy'] = dict(
        anisotropyStrength=.24,anisotropyRotation=0,anisotropyTexture=directionMap)
    for extension in ('KHR_materials_anisotropy','KHR_texture_transform'):
        if extension not in doc['extensionsUsed']:
            doc['extensionsUsed'].append(extension)
    store(atlas['baseColorTexture'],base)
    store(atlas['metallicRoughnessTexture'],orm)
    return {name:np.percentile(rough[mask],[10,50,90]).round(1).tolist() for name,mask in coverage.items()}


def SaveType38Assets(folder, doc, views, manifest, lod, author=False):
    folder.mkdir(exist_ok=True,parents=True)
    digest = WriteGlb(folder/'Model_Type38_511.glb',doc,views)
    versions = ('edgeHighlights','rearContact','stockSeat','serviceWear','compactTail')
    version = 30 + 2 * sum(key in manifest for key in versions) + int(not author)
    manifest.update(version=version,runtimeSha256=digest,renderMeshes=len(doc['meshes']),
                    images=len(doc['images']))
    manifest['imagePayloads'] = []
    for index,image in enumerate(doc['images']):
        chunk = views[image['bufferView']]
        manifest['imagePayloads'].append(dict(index=index,name=image['name'],bytes=len(chunk),sha256=hashlib.sha256(chunk).hexdigest()))
    lod['sourceSha256'] = digest
    for name,record in [('Data_Type38_511.json',manifest),('Data_Type38NpcLod.json',lod)]:
        (folder/name).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Finished:',digest,flush=True)


def WriteType38Assets(repo, folder, doc, views, manifest, lod, author=False):
    from Script_Type38AmbientOcclusion import BakeContactOcclusion
    from Script_Type38EdgeHighlights import BakeEdgeHighlights
    from Script_Type38RearFinish import BakeRearFinish
    from Script_Type38SeatFit import FitStockSeat
    from Script_Type38ServiceWear import FinishServiceWear
    from Script_Type38TailProfile import ShapeRearProfile

    manifest['authorImages'] = len(doc['images'])
    if not author:
        doc,views,rules = PackType38(doc,views,repo)
        manifest['publishImageRules'] = rules
    manifest['ambientOcclusion'] = BakeContactOcclusion(repo, doc, views)
    manifest['edgeHighlights'] = BakeEdgeHighlights(repo, doc, views)
    manifest['rearContact'] = BakeRearFinish(repo, doc, views)
    manifest['stockSeat'] = FitStockSeat(repo, doc, views)
    manifest['serviceWear'] = FinishServiceWear(repo, doc, views)
    manifest['compactTail'] = ShapeRearProfile(repo, doc, views)
    SaveType38Assets(folder, doc, views, manifest, lod, author)


def Build(cache, output=None, author=False):
    repo = Path(__file__).resolve().parents[2]
    folder = output or repo / 'Taierzhuang1938/Model/Type38_511'
    folder.mkdir(exist_ok=True,parents=True)
    def Original(file):
        return subprocess.check_output(['git', '-C', str(repo), 'show', f'8fd3c955:Taierzhuang1938/Model/Type38_511/{file}'])
    doc, views, baseline = ReadGlb(Original('Model_Type38_511.glb'))
    assert baseline == '285f3258e5bf03d56f1aff6e9390a985e1640a98282e009a6ee30d9a27dda3bb'
    baselineTriangles = sum(doc['accessors'][primitive['indices']]['count']//3
                            for mesh in doc['meshes'] for primitive in mesh['primitives'])
    roundovers = ReadRoundovers(repo, cache.resolve())
    source = ReadSamples(cache)
    stats = {}
    profileDeltas = {}
    profiles = {
        'Exterior_ButtCap04': ShapeButtCap,
        'Exterior_MiddleBand57': ShapeFittedMiddleBand,
        'T38_407F_VisualSkin_Exterior_FrontBandBody78': ShapeRolledBand,
        'Exterior_HandleOval08': ShapeHandle,
        'Exterior_FrontWindowBacking49': ShapeWindowTrim,
        'Exterior_RetainedImportedBody74': PoseDisplayLoop,
        'T38_440D2_IndependentVisibleRecess': ShapeRearMedallion,
        'T38_430B_IndependentLeftCoverSkin': BlendCoverCrown,
        'T38_430B_RetainedRightCoverHalf': BlendCoverCrown,
    }
    def Slot(slot):
        return doc['images'][doc['textures'][slot['index']]['source']]['bufferView']
    def Load(slot):
        return np.array(Image.open(io.BytesIO(views[Slot(slot)])))
    def Store(slot, array):
        stream = io.BytesIO()
        Image.fromarray(np.uint8(np.clip(np.rint(array), 0, 255))).save(stream, 'PNG', compress_level=6)
        views[Slot(slot)] = stream.getvalue()
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        part = node['extras']['SourceObject']
        primitive = doc['meshes'][node['mesh']]['primitives'][0]
        material = doc['materials'][primitive['material']]
        pbr = material['pbrMetallicRoughness']
        if 'baseColorTexture' not in pbr:
            continue
        baseSlot, ormSlot = pbr['baseColorTexture'], pbr['metallicRoughnessTexture']
        if part == 'T38_460G_WoodGroove_VisualCandidate':
            WidenStockChart(doc, views, primitive, material, Load, Store)
        orm = Load(ormSlot).astype('f')
        height, width = orm.shape[:2]
        handle = part == 'Exterior_HandleOval08'
        disk = part == 'T38_440D2_IndependentVisibleRecess'
        loop = part == 'Exterior_RetainedImportedBody74'
        butt = part == 'Exterior_ButtCap04'
        band = part == 'Exterior_MiddleBand57'
        frontBand = part == 'T38_407F_VisualSkin_Exterior_FrontBandBody78'
        exposedTube = part == 'Exterior_LongRound44'
        trim = part == 'Exterior_FrontWindowBacking49'
        before = doc['accessors'][primitive['indices']]['count']//3
        if part in profiles:
            profiles[part](doc,views,primitive)
        shape = roundovers.get(part+'_vertices')
        if shape is not None:
            WriteAttributes(doc,views,primitive,shape[:,:3],shape[:,3:6],shape[:,6:10],
                            shape[:,10:12],roundovers[part+'_indices'])
        if part == 'T38_460G_WoodGroove_VisualCandidate':
            EaseVisibleWoodSeat(doc,views,primitive)
        if part in SIGHT_BEVEL_PARTS:
            EaseSightBevels(doc,views,primitive,part)
        if part == FRONT_TIP_SKIN:
            CleanDisplayTip(doc,views,primitive)
        delta = doc['accessors'][primitive['indices']]['count']//3-before
        if delta:
            profileDeltas[part] = delta
        field, padded, valid = SurfaceAtlas(doc, views, primitive, (width, height))
        if trim:
            orm[:,:,0]=np.where(padded,255,0)
        if part == 'T38_460G_WoodGroove_VisualCandidate':
            orm[~padded,0] = 0
        side, up, length, normalSide, normalUp, normalLength, bend = np.moveaxis(field, 2, 0)
        angle = .4 * np.sin(11.3 * length) + .15 * np.sin(31 * length)
        wood = 'Wood' in part
        transverse = (up * .92 + side * .42 + length * .023 + .0018 * np.sin(16 * length))
        along = length + side * .19
        bare = band or part in ('Exterior_HandleOval08', 'T38_435F2_VisualBackingRearEnd', 'T38_440D2_IndependentVisibleRecess', 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH', 'SightDetailV3_DecorativeConvexRoundSurface', 'Exterior_FoldedFrame12', 'SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY')
        patinaMap = source['steel'] if wood else source['Metal046BColor']
        weights = np.stack([normalSide,normalUp,normalLength]) ** 4
        weights /= np.maximum(weights.sum(axis=0), .0001)
        def SteelPatch(scale, bias):
            result = np.zeros_like(length)
            center,spread = (155,66) if wood else (63,20)
            for axis,(weight,horizontal,vertical) in enumerate(zip(weights,[length,length,side],[up,side,up],strict=True)):
                u,v = horizontal*scale+bias,vertical*scale*1.17+bias*.7
                scan = ScanStrips(u,v,
                                  axis=0,seed=2087+axis*541+round(bias*1313))
                value = scan.Read(patinaMap,center,wood)
                if not wood:
                    oxide = OxideField(u*1.29+.14,v*1.82+.31,3581+axis*523)
                    value = .70*value+.30*(center+spread*1.42*oxide)
                result += weight*value
            return np.clip((result - center) / spread, -1.5, 1.5)
        stain = SteelPatch(8.7, .43)
        grainSteel = SteelPatch(42, .16)
        edge = np.clip((bend - .025) * 2.7, 0, 1)
        edge *= np.clip(.40 + .36 * grainSteel + .23 * stain, .04, 1)
        rubbed = np.clip(.33 + .36 * stain + .16 * grainSteel + .50 * edge, 0, 1)
        if wood:
            separate = part == 'Wood_UpperFittedCrown05'
            across = (.13 if separate else .73) + transverse * 1.10 + side * side * 16 + .0035 * np.sin(8.4 * length)
            down = (.10 if separate else .34) - along * 1.44
            if separate:
                # A longitudinal cut of the scan keeps the figure parallel to
                # the crown. The barrel-shaped section must not bend the grain.
                across = .21+.94*side+.28*up+4*side**2+.0014*np.sin(7.2*length)
                down = .24-.91*length+.10*side
            else:
                foreGrain = 1-Ramp(-.565,-.476,length)
                across += foreGrain*(.72+.86*side+.30*up+4*side**2-across)
                down += foreGrain*(.33-.96*length+.15*side-down)
            # One plank per piece. Grain, pores and lacquer pickup share the
            # same scan offsets so the material channels stay registered.
            across += .024*np.exp(-((length+.045)/.164)**2)*np.clip((up-.002)*19,-.65,.9)
            woodScan = ScanStrips(across,down,axis=1,seed=3563 if separate else 10141,interval=.57)
            rgbScan = woodScan.Read(source['grain'],32)
            poreScan = woodScan.Read(source['pores'],132)
            glossScan = woodScan.Read(source['woodGloss'],60)
            growth = woodScan.Read(source['woodGrowth'],32)
            fibreDetail = np.clip((rgbScan-growth)/25,-1,1)
            fibres = np.clip((woodScan.Read(source['woodMicro'],128)-128)/36,-1.25,1.25)
            if separate:
                stain = np.clip((growth-32)/30,-1.05,1.05)
                grainSteel = np.clip((glossScan-59)/42,-1,1)
                edge = np.clip((bend-.11)*1.8,0,1)*np.clip(.46+.27*stain+.18*grainSteel,0,1)
            fibre = np.clip((rgbScan - 15) / 49, 0, 1.3)
            if not separate:
                fibre += .24*foreGrain*(.53-fibre)
            pore = np.clip((132 - poreScan) / 51, -.7, 1.15)
            handling = np.exp(-((length-.025) / .115) ** 2) + .65 * np.exp(-((length+.5) / .16) ** 2)
            handling *= np.clip(.56 + .27 * normalSide ** 2 + .23 * stain, 0, 1)
            amber = np.clip(.46 + .39 * fibre + .047 * stain + .052 * angle, .09, .98)
            sun = Ramp(-.79,-.661,length)*(1-Ramp(-.23,-.065,length))
            warmWrist = np.exp(-((length+.035)/.17)**2)
            vessels = PoreField(length,transverse+side*side*13)
            fleck = np.clip((pore-.12)*.73 + (.37-fibre)*.50 + .76*vessels,0,1)
            honey = Tint([110,50,15],[210,117,37],amber)
            oldLacquer = Tint([49,23,14],[115,62,36],amber)
            rim = 1-Ramp(-.625,-.606,length)
            color = Blend(oldLacquer,Tint([64,31,18],[133,70,41],amber),rim) if separate else Blend(
                Tint([62,22,9],[158,66,22],amber),honey,np.clip(.06+.94*sun+.12*warmWrist,0,1))
            if separate:
                shoulder = Ramp(-.603,-.552,length)*(1-Ramp(-.394,-.352,length))
                crown = Ramp(.10,.85,normalUp)
                glaze = np.clip(.27+.52*crown+.09*rgbScan/64+.06*stain,0,1)*shoulder
                lacquerGrain = np.clip(.34+.52*fibre+.10*stain,0,1)
                color = Blend(color,Tint([83,39,24],[157,78,44],lacquerGrain),glaze)
            else:
                foreTip = 1-Ramp(-.91,-.69,length)
                color = Blend(color,Tint([48,17,8],[116,49,19],amber),foreTip*.84)
                handBed = np.exp(-((length+.29)/.18)**2)
                color = Blend(color,Tint([88,35,12],[199,92,24],amber),handBed*.43)
                foreStain = Ramp(-.777,-.724,length)*(1-Ramp(-.707,-.676,length))
                foreStain *= Ramp(.012,.022,up)*Ramp(.30,.76,np.abs(normalSide))
                color = Blend(color,Tint([73,32,13],[154,76,28],amber),foreStain*.68)
                foreBody = Ramp(-.920,-.846,length)*(1-Ramp(-.759,-.718,length))
                color = Blend(color,Tint([85,38,14],[155,80,30],amber),foreBody*.60)
            color *= (1-(.17 if separate else .25)*fleck)[:,:,None]
            if not separate:
                heel = Ramp(.12,.245,length)*np.clip(.62-.28*stain,0,1)
                color = Blend(color,Tint([53,21,10],[113,46,18],amber),heel*.63)
                woodOil = (.34*grainSteel+.60*stain+.35*SteelPatch(2.6,.23))
                color *= (1+np.clip(woodOil,-1,1)*(.055+.070*sun))[:,:,None]
                quiet = Ramp(.038,.16,length)*.47
                color = Blend(color,Tint([88,32,13],[157,68,27],.49+.14*stain),quiet)
                grooveEnd = np.maximum(np.maximum(length+.264,-.444-length),0)
                grooveRadius = np.hypot(grooveEnd/.010,(up-.0266)/.0075)
                flank = Ramp(.25,.78,-normalSide)*Ramp(.010,.016,-side)
                recess = flank*(1-Ramp(.78,1.27,grooveRadius))
                insetTone = Tint([63,32,16],[140,81,33],np.clip(.44+.28*fibre+.081*stain,0,1))
                color = Blend(color,insetTone,recess*(.86+.055*stain))
                rubbedLip = np.exp(-((grooveRadius-.86)/.33)**2)*flank*recess
                rubbedLip *= np.clip(.61+.18*stain+.08*grainSteel,.2,.95)
                bodyPolish = flank*Ramp(-.47,-.430,length)*(1-Ramp(-.26,-.21,length))
                bodyPolish *= np.exp(-((up-.0135)/.0064)**2)*np.clip(.78+.17*stain,.35,1)
                polishBand = Ramp(-.467,-.433,length)*(1-Ramp(-.250,-.217,length))
                polishBand *= Ramp(.008,.018,-side)*Ramp(.25,.73,-normalSide)
                polishBand *= np.exp(-((up-.0149)/.0079)**4)*(1-Ramp(.12,.62,recess))
                glazeFill = polishBand*np.clip(.84+.11*stain+.045*grainSteel,.48,1)
                patina = (1-.19*fleck)*glazeFill
                color = Blend(color,Tint([70,46,9],[142,96,22],.49+.26*fibre+.11*stain),.59*patina)
                oldFilm = (1-Ramp(-.419,-.370,length))*polishBand
                glossShoulder = np.exp(-((up-.0148)/.0049)**4)*glazeFill
                polishedCenter = Ramp(-.417,-.382,length)*(1-Ramp(-.322,-.293,length))
                filmSmooth = polishBand*polishedCenter*np.clip(.97+.06*stain-.035*fleck,.83,1)
                lowerReturn = Ramp(-.466,-.427,length)*(1-Ramp(-.255,-.218,length))
                lowerReturn *= (1-Ramp(.010,.0134,up))*Ramp(.14,.59,-normalSide)*Ramp(.007,.014,-side)
                color = Blend(color,Tint([65,26,8],[136,72,21],.39+.29*fibre+.10*stain),.60*lowerReturn)
                rearPanel = Ramp(.004,.060,length)*Ramp(.10,.76,np.abs(normalSide))
                upperEdge = .018-.062*length
                depth = np.clip((upperEdge-up)/(.067+.37*np.maximum(0,length-.05)),0,1)
                rearward = Ramp(.102,.231,length)
                warmPath = np.exp(-((depth-(.61+.065*np.sin(17*length)))/.245)**2)*(1-.79*rearward)
                darkMargin = .26*rearward + .14*(1-Ramp(.08,.42,depth))+.10*Ramp(.78,1,depth)
                broadStain = .55*SteelPatch(2.2,.18)+.32*stain+.13*grainSteel
                bodyColor = Tint([69,26,9],[142,63,17],np.clip(.52+.12*fibre+.12*broadStain,0,1))
                bodyColor = Blend(bodyColor,np.array([149,84,23],dtype='f'),warmPath*(.58+.08*stain))
                endMargin = np.exp(-((.251+up*.20-length)/.011)**2)*(.49+.11*stain)
                bodyColor = Blend(bodyColor,np.array([47,18,8],dtype='f'),np.clip(darkMargin+endMargin-.055*broadStain,0,.81))
                color = Blend(color,bodyColor,rearPanel*.84)
            scratch,chip = VarnishTraces(length,up,side>0) if not separate else (0,0)
            color = Blend(color,np.array([74,33,16],dtype='f'),scratch*.62) if not separate else color
            if not separate:
                color = Blend(color,np.array([170,122,66],dtype='f'),chip*.65)
            breach = np.clip((.74 * edge + .30 * stain + .22 * grainSteel - .49) * 2.0, 0, .90)
            color = Blend(color, Tint([88,56,35], [155,111,70], fibre), breach * .85)
            color *= (1+.10*fibreDetail-.035*vessels)[:,:,None]
            rough = 105 + .49*(glossScan-60) + 17*fleck + 11*stain - 27*handling + breach*47 + 23*scratch+33*chip
            rough -= 5*fibreDetail
            coat = material['extensions']['KHR_materials_clearcoat']
            coat['clearcoatFactor'] = .96
            varnish = Load(coat['clearcoatTexture'])
            varnish[:, :, 0] = np.where(padded, np.clip(192 + 19*handling - 21*fleck - 114*breach-68*scratch-117*chip, 0, 238), 0)
            varnish[:, :, 1] = np.where(padded, np.clip(71 + .33*(glossScan-60) + 14*fleck + 7*stain - 13*handling + 48*breach-6*fibreDetail, 34, 145), 0)
            if separate:
                glossVariation = .47*(glossScan-60) + 13*stain + 6*grainSteel
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1] + glaze*(8+glossVariation),34,139),0)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.10*glaze*fleck))
                sheltered = Ramp(-.3775,-.3718,length)*(1-Ramp(-.3642,-.3624,length))*Ramp(.42,.80,normalUp)
                color = Blend(color,Tint([46,22,14],[93,47,28],amber),sheltered*.71)
                grainTone = np.clip(.54*(fibre-.55)+.13*stain,-.32,.30)
                color *= (1+sheltered*grainTone)[:,:,None]
                warmPocket = sheltered*Ramp(-.3705,-.3655,length)
                color = Blend(color,Tint([57,26,15],[111,57,34],amber),warmPocket*.36)
                innerRim = sheltered*(1-Ramp(-.371,-.367,length))
                color = Blend(color,Tint([60,27,17],[121,63,36],amber),innerRim*.64)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.48*sheltered))
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1]+28*sheltered,0,150),0)
                rough += 17*sheltered
                varnish[:,:,0] = np.rint(varnish[:,:,0]*np.clip(.82+.09*handling-.055*fleck,.74,.93))
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1]+12+8*fleck,31,166),0)
                rough += 8+7*fleck
            if not separate:
                mellow = rearPanel*np.clip(.72+.22*rearward-.24*warmPath,0,1)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.47*mellow))
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1]+33*mellow,0,142),0)
                rough += 16*mellow
                varnish[:,:,0] = np.where(padded,np.rint(np.clip(varnish[:,:,0]+6*recess+23*bodyPolish,0,244)),0)
                varnish[:,:,1] = np.where(padded,np.rint(np.clip(varnish[:,:,1]+8*recess-17*rubbedLip+6*bodyPolish,34,142)),0)
                rough += 9*recess-11*rubbedLip-8*bodyPolish
                varnish[:,:,0] = np.where(padded,np.rint(varnish[:,:,0]+(250-varnish[:,:,0])*glazeFill),0)
                varnish[:,:,1] = np.where(padded,np.rint(np.clip(varnish[:,:,1]-6*glossShoulder+11*oldFilm,34,142)),0)
                rough -= 30*glazeFill
                varnish[:,:,1] = np.rint(np.clip(varnish[:,:,1]*(1-.26*filmSmooth),0,255))
                rough *= 1-.37*filmSmooth
                glossSlot = material['extensions']['KHR_materials_specular']['specularTexture']
                gloss = Load(glossSlot)
                gloss[:,:,3] = np.rint(gloss[:,:,3]+(235-gloss[:,:,3].astype('f'))*glazeFill)
                gloss[:,:,3] = np.rint(gloss[:,:,3]*(1-.19*filmSmooth))
                Store(glossSlot,gloss)
            metal = np.zeros_like(rough)
            relief = (poreScan-132)*.0031 + .034*fibreDetail - .13*fleck - .43*scratch - .62*chip
            if not separate:
                relief *= 1-.29*recess-.22*bodyPolish
                distal = 1-Ramp(-.649,-.605,length)
                stripCenter = .0276+.0029*distal+.00018*np.sin((length+.623)*106)
                edgeDist = np.hypot(np.maximum(np.maximum(-.673-length,length+.599),0),up-stripCenter)
                inlay = (1-Ramp(.00150,.00212,edgeDist))*Ramp(.006,.010,side)
                rolled = (1-Ramp(.0001,.00225,edgeDist))**.63
                scuff = PaintBandScuff(doc, views, primitive, (width,height))*np.clip(.74+.22*grainSteel,.22,1)
                color = Blend(color,Tint([54,28,17],[101,49,20],amber),scuff*.88)
                wornArc = np.exp(-((length+.631)/.022)**2)
                stripWear = np.clip(.24+.65*wornArc+.19*stain+.17*grainSteel,.07,1)
                lip = np.clip((up-stripCenter)/.0018,-1,1)
                steelTone = Tint([56,48,44],[119,105,96],.27+.46*stripWear+.07*rolled)
                color = Blend(color,steelTone,inlay)
                metal = inlay*(198+42*stripWear)
                varnish[:, :, 0] = np.rint(varnish[:, :, 0]*(1-inlay)*(1-.50*scuff))
                rough += 31*scuff
                rough += inlay * (185-46*stripWear-10*rolled+9*lip+8*grainSteel-rough)
                relief = relief*(1-inlay) + ((1.23+.30*stripWear)*rolled+.27*inlay)*Ramp(.006,.010,side)-.25*scuff
            foreWear = Ramp(-.936,-.849,length)*(1-Ramp(-.557,-.502,length))
            foreWear *= np.clip(.82+.11*stain+.12*fleck,.48,1)
            if not separate:
                foreWear *= 1-inlay
            warmWood = Tint([67,34,18],[156,87,45],.42+.47*fibre+.09*stain)
            color = Blend(color,warmWood,foreWear*(.29 if separate else .43))
            varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.29*foreWear))
            varnish[:,:,1] = np.rint(np.minimum(165,varnish[:,:,1]+23*foreWear))
            rough += 16*foreWear
            # A pore affects both the lacquer film and the wood directly below
            # it. Keep the pores, ridges and sheen registered in the same scan.
            timber = 1 if separate else 1-inlay
            if not separate:
                foreTone = (1-Ramp(-.525,-.464,length))*timber
                color *= 1-foreTone[:,:,None]*np.array([.116,.145,.035],dtype='f')
            filmWear = np.clip(.43+.27*handling+.45*breach+.18*edge,0,1)
            ridges = fibres*timber
            openPores = Ramp(.20,.93,-fibres)*timber*filmWear
            color *= (1+.046*ridges-.086*openPores)[:,:,None]
            rough += 14*openPores-5*np.maximum(ridges,0)
            relief += .165*ridges-.16*openPores
            fineFilm = 1 if separate else 1-Ramp(.08,.44,np.maximum(glazeFill,recess))
            varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.18*fineFilm*openPores))
            filmRoughness = varnish[:,:,1]+fineFilm*(17*openPores-4*np.maximum(ridges,0))
            if not separate:
                shelteredSeat = WoodSeat(side,up+.0019,length)*timber
                cutWood = Tint([59,29,15],[117,68,39],.37+.28*fibre+.14*stain)
                color = Blend(color,cutWood,.72*shelteredSeat)
                rough += 37*shelteredSeat
                relief *= 1-.29*shelteredSeat
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.85*shelteredSeat))
                filmRoughness += 53*shelteredSeat
            dent,broken,rolledEdge = WoodUseDents(side,up,length,normalSide,grainSteel,separate)
            protection = 1 if separate else timber*(1-.88*np.maximum(glazeFill,shelteredSeat))
            dent *= protection
            broken *= protection
            rolledEdge *= protection
            fibresInDent = Tint([103,66,38],[202,152,93],.47+.28*fibre+.14*stain)
            color = Blend(color,fibresInDent,.94*broken)
            color *= (1-.32*dent+.062*rolledEdge)[:,:,None]
            rough += 51*broken+22*dent-8*rolledEdge
            relief += .33*rolledEdge-2.48*dent
            varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.58*broken-.32*dent))
            filmRoughness += 35*broken+23*dent-7*rolledEdge
            varnish[:,:,1] = np.where(padded,np.clip(filmRoughness,31,173),0)
            Store(coat['clearcoatTexture'], varnish)
        else:
            jacket = 'CoverSkin' in part or 'CoverHalf' in part or 'LowerFacing' in part
            collar = part == 'T38_435F2_IndependentTailNeckExterior'
            backing = part == 'T38_435F2_VisualBackingRearEnd'
            shoulder = part == 'T38_430L_VisibleUpperShoulderCoordination'
            if bare or collar:
                dark, light = ([108,104,97],[163,159,149]) if band else ([148,143,134],[192,189,179])
                if part.startswith('Exterior_Folded') or part.startswith('SightDetail'):
                    dark, light = [81,80,73],[146,144,131]
            else:
                dark, light = ([74,71,67],[119,115,108]) if jacket else ([55,54,52],[93,91,86])
            oxidation = np.clip((.33*grainSteel - .49*stain - .21)*1.25, 0, .70)
            flow = SteelPatch(2.6, .23)
            color = Tint(dark, light, .42 + .24*flow + .13*stain)
            color = Blend(color, np.array([156,151,143], dtype='f'), edge*(.18 if bare else .49))
            color = Blend(color, np.array([70,62,53], dtype='f'), oxidation*(.18 if bare else .22))
            acrossSteel = np.arctan2(up-(.030 if band else .041),side)/(2*np.pi)
            grainU,grainV = length*7.1+.32, acrossSteel+.37
            if band:
                grainU,grainV = acrossSteel+.21,length*9.4+.17
            if handle:
                grainU,grainV = side*5.4+.22,np.arctan2(up-.046,length+.102)/(2*np.pi)+.29
            if collar:
                grainU,grainV = acrossSteel+.17,length*26+.32
            brushScan = ScanStrips(grainU,grainV,axis=1 if band or collar else 0,seed=9083)
            brush = np.clip((brushScan.Read(source['Metal009Roughness'],119)-119)/24,-1.8,1.8)
            rough = (94 if bare or collar else 104) + 16*flow + 13*stain + 4*brush - 20*edge
            metal = 251 - oxidation*(22 if bare else 41)
            if exposedTube:
                freshWear = Ramp(-.720,-.645,length)
                cloud = OxideField(length*17.1+.26,up*105.7+side*116.3+.46,4043)
                buff = Ramp(-.43,.79,-cloud+.34*flow+.19*normalUp)
                rub = np.clip(.30+.24*flow+.17*stain+.16*freshWear,0,1)
                contact = Ramp(-.677,-.645,length)*np.clip(.20+.26*flow+.27*edge,0,.59)
                color = Tint([50,49,47],[148,144,136],.274+.42*rub+.217*buff+.066*grainSteel)
                color = Blend(color,Tint([91,88,81],[135,130,120],.44+.16*brush),contact)
                rough = 120+10*stain+6*brush+13*cloud-17*rub-19*contact-10*buff
                metal = 227+17*rub+9*contact+7*buff-10*oxidation
            if part == 'Exterior_FrontOuterTube76':
                color = Tint([43,42,39],[104,101,94],.45+.17*flow+.08*stain)
                rough = 102+9*flow+7*stain+5*brush
                metal -= 15
            if collar or backing or disk:
                # The adjoining rear steel pieces share the same oxide and wear tones.
                # Fine directional marks break up the highlight across each surface.
                wear = np.clip(.58+.19*flow+.18*stain+.16*edge-.13*oxidation,.20,.94)
                rearSteel = Tint(*COVER_STEEL_TONES,.43+.27*wear+.042*brush)
                color = rearSteel
                rough = (145 if collar else 132)-19*wear+10*stain+10*brush
                metal = 238+10*wear-11*oxidation
                if collar:
                    rim = Ramp(.13,.76,np.abs(normalLength))*np.clip(.74+.14*stain,.48,.95)
                    color = Blend(color,np.array([108,101,92],dtype='f'),rim*.42)
                    rough += 23*rim
                    metal -= 9*rim
            if backing:
                visibleHeel = Ramp(.034,.064,up)
                innerSteel = Tint([63,60,55],[113,108,98],.48+.18*flow+.12*stain)
                color = Blend(innerSteel,rearSteel,visibleHeel)
                rough += (1-visibleHeel)*(8-7*brush)
                metal -= (1-visibleHeel)*(8+5*oxidation)
            if butt:
                rim = 1-Ramp(.1,.89,np.abs(normalLength))
                wear = rim*np.clip(.36+.24*stain+.18*grainSteel,0,.83)
                color = Tint([48,44,39],[94,87,75],.39+.24*flow+.13*brush+.22*wear)
                rough = 135-43*wear+9*brush+8*stain
                metal = 227+17*wear-7*oxidation
            if frontBand:
                burnish = Ramp(.10,.68,np.abs(normalLength))*np.clip(.41+.22*stain+.13*grainSteel,.14,.8)
                color = Blend(color,Tint([74,71,67],[139,133,122],.40+.15*flow),burnish)
                rough += 6-29*burnish
                metal -= 12-10*burnish
            if trim:
                color = Tint([39,37,33],[90,83,73],.42+.26*flow+.09*stain)
                color = Blend(color,np.array([132,124,109],dtype='f'),.35*edge)
                rough = 143+16*flow+13*stain-26*edge
                metal = 207+19*edge-9*oxidation
            relief = .037*grainSteel + .033*brush
            if shoulder or jacket or band or handle:
                grain = np.clip((brushScan.Read(source['Metal009Color'],148)-148)/13,-1.7,1.7)
                scoring = np.clip((brushScan.Read(source['Metal009Displacement'],147)-147)/71,-1.7,1.7)
                # The band wraps in U. All its layers must close at the same azimuth.
                tarnishU = grainU if band else grainU*.73
                speckleU = grainU*(5 if band else 5.1)
                oxideScan = ScanStrips(tarnishU+.16,grainV+.41,axis=1 if band else 0,seed=1727)
                fineScan = ScanStrips(speckleU+.45,grainV*4+.29,axis=0 if band else 1,
                                      period=5 if band else 4,seed=6211)
                tarnish = np.clip((oxideScan.Read(source['Metal046BRoughness'],90)-90)/23,-1.5,1.5)
                speckle = np.clip((fineScan.Read(source['Metal046BRoughness'],90)-90)/17,-1.8,1.8)
                pits = Ramp(.27,1.30,speckle)
                if shoulder or jacket:
                    crown = Ramp(-.10,.95,normalUp)
                    rub = np.clip(.31+.44*crown+.24*flow+.15*stain+.23*edge,0,1)
                    if shoulder:
                        color = Tint([40,38,33],[143,138,124],.22+.66*rub+.047*grain-.08*pits)
                        rough = 97-37*rub+10*brush+5*tarnish+5*speckle
                        metal = 246+9*rub-3*tarnish
                    else:
                        color = Tint(*COVER_STEEL_TONES,.12+.64*rub+.055*grain)
                        satin = OxideField(length*18.3+.18,(up+.57*side)*43.2+.39,6131)
                        rough = 122-40*rub+8*brush+7*tarnish+6*speckle+16*satin
                        metal = 217+29*rub-8*tarnish
                elif band:
                    rub = np.clip(.60+.22*stain+.14*grainSteel+.16*edge,0,1)
                    color = Tint([76,73,67],[147,142,131],.30+.48*rub+.068*grain)
                    rough = 123-29*rub+23*brush+9*tarnish+4*flow
                    metal = 224+18*rub-5*tarnish
                else:
                    knob = Ramp(.044,.054,side)
                    chartV = (np.arange(height,dtype='f')+.5)/height
                    wornSide = Ramp(.48,.96,-np.sin((chartV-.02)*(2*np.pi/.96)))[:,None]
                    patina = Ramp(-.12,1.04,.42*tarnish+.31*grainSteel-.28*flow+.18*pits)
                    wear = Ramp(.62,.95,.42+.23*flow+.18*grain+.14*wornSide+.12*edge)
                    wear *= (1-.64*pits)*(1-.47*patina)
                    tone = .48+.13*flow+.11*stain+.071*grain-.19*patina+.24*wear
                    tone += knob*(.028+.051*speckle)-.055*pits
                    color = Tint(*COVER_STEEL_TONES,tone)
                    rough = 116+12*brush+8*tarnish+16*patina+10*pits-33*wear
                    rough += knob*(5+8*speckle)
                    metal = 234+17*wear-16*patina-17*pits
                relief = .18*scoring+.064*tarnish-.25*pits
                if handle:
                    relief -= .085*pits*knob
            if band or frontBand:
                rimTurn = Ramp(.17,.63,np.abs(normalLength))*(1-Ramp(.84,.99,np.abs(normalLength)))
                burnish = rimTurn*np.clip(.43+.26*stain+.11*grainSteel,.12,.78)
                color = Blend(color,Tint([103,99,91],[151,147,136],.33+.22*flow),burnish*.53)
                rough -= 31*burnish
                metal += 11*burnish
            if loop:
                lowerArc = 1-Ramp(.0022,.0062,up)
                wear = np.clip(lowerArc*(.82+.19*stain+.14*grainSteel)+.19*edge,0,1)
                color = Blend(Tint([62,54,47],[99,87,74],.48+.18*flow),
                              Tint([129,124,119],[195,189,183],.58+.17*flow),wear)
                rough = 134-60*wear+9*stain+4*brush
                metal = 208+39*wear-8*oxidation
            if disk:
                face = Ramp(.18,.69,normalLength)*Ramp(-.0547,-.0519,length)
                beads,center,radius = RearFace(side,up)
                centerPlate = 1-Ramp(.145,.227,radius)
                wear = Ramp(.10,.62,beads)
                diskColor = Tint(*COVER_STEEL_TONES,.39+.48*wear+.06*center+.072*flow+.045*brush)
                basin = Tint(*COVER_STEEL_TONES,.26+.07*stain+.09*brush)
                diskColor = Blend(diskColor,basin,centerPlate)
                color = Blend(color,diskColor,face)
                diskRough = 168-39*wear-13*center+9*stain+7*brush
                diskRough += centerPlate*(173+3*brush-diskRough)
                rough += (diskRough-rough)*face
                diskMetal = 217+22*wear+6*center-9*centerPlate+4*flow
                metal += (diskMetal-metal)*face
                relief += face*(.94*beads + .32*center)
            if part == 'Exterior_FoldedFrame12':
                marks = FrameEngraving(Image.fromarray(Load(material['normalTexture'])))
                color = Tint([108,104,97],[160,155,142],.50+.19*flow+.06*stain)
                nearCap = Ramp(-.311,-.305,length)
                farCap = 1-Ramp(-.373,-.367,length)
                cap = np.maximum(nearCap,farCap)
                worn = np.clip(.52*edge+.19*stain+.12*grainSteel-.10,0,.62)
                capSteel = Tint([53,51,48],[122,118,111],.41+.15*flow+.12*stain+.13*brush)
                capSteel *= (1+.16*nearCap-.13*farCap)[:,:,None]
                capSteel = Blend(capSteel,np.array([139,135,124],dtype='f'),worn)
                color = Blend(color,capSteel,cap)
                rough = 112+10*flow+6*brush+24*marks
                rough += cap*(139+12*flow+9*stain-42*worn-rough)
                metal += cap*(196+33*worn+9*flow-metal)
                rail = (1-cap)*Ramp(.57,.91,normalUp)
                rough += rail*(34-4*flow) + 33*nearCap+42*farCap
                metal -= 36*rail+34*nearCap
                color = Blend(color,np.array([194,189,178],dtype='f'),rail*.51)
                color = Blend(color,np.array([39,39,38],dtype='f'),marks*.84)
            if part == 'Exterior_ShortTransverseHead71':
                rubbedFace = np.clip(.35+.38*flow+.15*stain+.36*edge,0,1)
                color = Tint([72,71,67],[151,147,138],.28+.53*rubbedFace)
                rough = 144+16*stain+8*brush-39*rubbedFace
                metal = 153+46*rubbedFace
            if part == 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH':
                color = Tint([154,146,128],[198,187,159],.57+.12*flow+.05*stain)
                rough = 91+13*flow+7*brush
            if part == 'SightDetailV3_DecorativeConvexRoundSurface':
                alongMark = (length+.3493)/.0046
                crossMark = (side-.0012)/.0046
                slant = crossMark-(.211+.582*alongMark)
                radial = np.hypot(alongMark-.5,crossMark-.5)
                boundary = (1-Ramp(.42,.50,radial))*Ramp(.25,.78,normalUp)
                groove = (1-Ramp(.031,.078,np.abs(slant)))*boundary
                border = np.exp(-((np.abs(slant)-.081)/.026)**2)*boundary
                color = Blend(color,np.array([55,49,43],dtype='f'),groove*.88)
                rough += 28*groove-8*border
                relief += -2.8*groove+.64*border
            if not part.startswith('SightDetail') and part != 'Exterior_FoldedFrame12':
                fine = ScanStrips(acrossSteel*2+.13,length*3.85+.32,axis=1,seed=9191) if exposedTube else ScanStrips(
                    grainU*2+.13,grainV*2+.32,axis=1 if band or collar else 0,seed=9191)
                lines = np.clip((fine.Read(source['tubeMicro' if exposedTube else 'steelMicro'],128)-128)/37,-1.25,1.25)
                dents = Ramp(.33,1.03,(128-fine.Read(source['steelPits'],128))/34)
                detail = .42 if handle else .82 if collar or backing else 1
                if exposedTube:
                    detail *= .49
                if disk:
                    detail = .42*(1-face)
                color *= (1+detail*(.037*lines-.062*dents))[:,:,None]
                rough += detail*(8*lines+21*dents-6*edge*np.maximum(lines,0))
                relief += detail*(.17*lines-.24*dents)
            coverRim = part in ('T38_430B_IndependentLeftCoverSkin','T38_430B_RetainedRightCoverHalf')
            if coverRim or handle or collar or backing or disk or part=='T38_433E_VisibleSideBlockRimInset':
                rim = RearEdgeWear(part,field,width)
                burnish = rim*np.clip(.62+.23*stain+.13*grainSteel,.27,.90)
                rimTone = Tint([99,96,90],[145,141,133],.41+.18*flow+.075*brush)
                color = Blend(color,rimTone,burnish*.63)
                rough += burnish*(85+7*flow-rough)*.97
                metal += burnish*(248-metal)*.70
                relief *= 1-.62*burnish
                if coverRim:
                    local = Ramp(-.141,-.083,length)
                    rough += 8*local*(1-burnish)
                    relief *= 1-.16*local
            if part in SIGHT_BEVEL_PARTS:
                castEdge = Ramp(.055,.34,bend)*(1-Ramp(.89,.992,np.abs(normalUp)))
                castEdge *= np.clip(.51+.19*stain+.09*grainSteel,.28,.76)
                edgeSteel = Tint([83,80,74],[134,129,119],.39+.16*flow)
                color = Blend(color,edgeSteel,.48*castEdge)
                rough += castEdge*(89+9*flow-rough)
                metal += castEdge*(240-metal)*.69
                relief *= 1-.47*castEdge
            if part == FRONT_TIP_SKIN:
                tipCap = (1-Ramp(-.980,-.973,length))*Ramp(.0535,.0564,up)*Ramp(.74,.97,normalUp)
                rough += tipCap*(124+4*brush-rough)*.86
                relief *= 1-.82*tipCap
        if exposedTube:
            name = 'Texture_Type38ForeSteelNormal'
            normalSlot = dict(index=len(doc['textures']),scale=.51)
            doc['textures'].append(dict(source=len(doc['images']),sampler=doc['textures'][baseSlot['index']]['sampler']))
            doc['images'].append(dict(name=name,mimeType='image/png',bufferView=len(views)))
            doc['bufferViews'].append(dict(buffer=0,byteLength=0))
            views.append(b'')
            material['normalTexture'] = normalSlot
        if 'normalTexture' in material:
            normalSlot = material['normalTexture']
            if exposedTube:
                normals = np.zeros((height,width,3),dtype='f')
                normals[:,:,2] = 1
            else:
                normals = Load(normalSlot).astype('f') / 127.5 - 1
            if not wood and part != 'Exterior_FoldedFrame12':
                normals[:, :, :2] *= .30 if not disk else .08
            if wood or handle or part == 'T38_430L_VisibleUpperShoulderCoordination':
                normals[:, :, :2] = 0
                normals[:, :, 2] = 1
            gradientV, gradientU = np.gradient(gaussian_filter(relief, .55))
            direction = np.dstack((-gradientU, gradientV)) * (.86 if wood else .92 if disk else .69)
            limit = .90 if disk else .33 if wood else .18
            normals[:, :, :2] += np.clip(direction, -limit, limit)
            if disk:
                rows,cols,tangentSpace,weight = MedallionRelief(doc,views,primitive,field,valid,padded)
                normals[rows,cols] += (tangentSpace-normals[rows,cols])*weight[:,None]
            if wood and not separate:
                rows,cols,surface,tangent,binormal = StockShadingBasis(doc,views,primitive,field,patina>.001)
                curvedStrip = Ramp(.0107,.0132,up[rows,cols])*(1-.57*Ramp(.0010,.0038,np.abs(up[rows,cols]-.0151)))
                sweep = .166*patina[rows,cols]*curvedStrip*Ramp(-.442,-.354,length[rows,cols])*(.82+.13*stain[rows,cols])
                normals[rows,cols,0] += sweep*tangent[:,2]
                normals[rows,cols,1] += sweep*binormal[:,2]
                rows,cols,target = InlayShading(doc,views,primitive,field,inlay,stripCenter,stripWear)
                normals[rows,cols] += (target-normals[rows,cols])*inlay[rows,cols,None]
            normals /= np.maximum(1e-7, np.linalg.norm(normals, axis=2, keepdims=True))
            Store(normalSlot, np.where(padded[:, :, None], (normals+1)*127.5, [128,128,255]))
        orm[:, :, 1] = np.where(padded, np.clip(rough, 39, 196), 0)
        orm[:, :, 2] = np.where(padded, np.clip(metal, 0, 255), 0)
        Store(baseSlot, np.where(padded[:, :, None], color, 0))
        Store(ormSlot, orm)
        stats[part] = np.percentile(orm[:, :, 1][valid], [10, 50, 90]).round(1).tolist()
        print(part, stats[part], flush=True)
    stats.update(FinishSteelAtlas(doc,views,source,Load,Store))
    doc['asset']['extras']['version'] = 'Type38_SightFit24'
    triangles = sum(doc['accessors'][prim['indices']]['count']//3 for mesh in doc['meshes'] for prim in mesh['primitives'])
    assert triangles == baselineTriangles+sum(profileDeltas.values()) and triangles <= 80000
    doc['asset']['extras']['runtimeTriangles'] = triangles
    manifest = json.loads(Original('Data_Type38_511.json'))
    for part,delta in profileDeltas.items():
        manifest['exteriorTriangleDeltas'][part] = manifest['exteriorTriangleDeltas'].get(part,0)+delta
    manifest.update(triangles=triangles, generator='_blender/Script_Type38Surface.py',
                    finishRoughnessP10P50P90=stats, surfaceSources={key: value[3] for key,value in SAMPLES.items()},
                    metalSurfaceSources=METAL_SOURCES,
                    markings=['scale graduations and numerals only'])
    lod = json.loads(Original('Data_Type38NpcLod.json'))
    lod.update(fpsTriangles=triangles,npcTriangles=triangles-4608)
    WriteType38Assets(repo,folder,doc,views,manifest,lod,author)
    if output is None and not author:
        UpdateType38PublishRules(repo,manifest['publishImageRules'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path(__file__).resolve().parents[2]/'tmp/Type38SurfaceSources')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--author', action='store_true',help='retain individual parts for Blender editing')
    args = parser.parse_args()
    Build(args.cache,args.output,args.author)
