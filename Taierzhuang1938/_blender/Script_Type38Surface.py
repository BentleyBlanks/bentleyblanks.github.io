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
    return layers


def Attribute(doc, views, index, width):
    field = doc['accessors'][index]
    return np.frombuffer(views[field['bufferView']], dtype={5123: '<u2', 5125: '<u4', 5126: '<f4'}[field['componentType']]).reshape(-1, width)


def SurfaceAtlas(doc, views, primitive, size):
    attrs = primitive['attributes']
    points = Attribute(doc, views, attrs['POSITION'], 3)
    uv = Attribute(doc, views, attrs['TEXCOORD_0'], 2) * size - .5
    smooth = Attribute(doc, views, attrs['NORMAL'], 3)
    faces = Attribute(doc, views, primitive['indices'], 3).astype(np.int32)
    unique, weld = np.unique(np.round(points, 6), axis=0, return_inverse=True)
    accum = np.zeros((len(unique), 3), np.float32)
    cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    cross /= np.maximum(1e-12, np.linalg.norm(cross, axis=1, keepdims=True))
    for corner in range(3):
        np.add.at(accum, weld[faces[:, corner]], cross)
    accum /= np.maximum(1e-8, np.linalg.norm(accum, axis=1, keepdims=True))
    bend = np.linalg.norm(cross[:, None] - accum[weld[faces]], axis=2)
    field = np.zeros((size[1], size[0], 7), np.float32)
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
        field[top + row, left + col] = values[0] + weightB[hit, None] * (values[1]-values[0]) + weightC[hit, None] * (values[2]-values[0])
        valid[top + row, left + col] = True
    assert valid.any()
    distance, near = distance_transform_edt(~valid, return_indices=True)
    pad = (~valid) & (distance <= 18)
    field[pad] = field[near[0, pad], near[1, pad]]
    return field, valid | pad, valid


def Sample(layer, horizontal, vertical, reflect=False):
    height, width = layer.shape
    if reflect:
        horizontal = 1 - np.abs(np.mod(horizontal, 2) - 1)
        vertical = 1 - np.abs(np.mod(vertical, 2) - 1)
    return cv2.remap(layer, (horizontal % 1 * (width-1)).astype('f'), (vertical % 1 * (height-1)).astype('f'),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype('f')


def Tint(dark, light, factor):
    return np.array(dark, dtype='f') + factor[:, :, None] * (np.array(light, dtype='f') - dark)


def Blend(first, second, mask):
    return first + (second - first) * mask[:, :, None]


def Ramp(low, high, value):
    phase = np.clip((value-low)/(high-low), 0, 1)
    return phase*phase*(3-2*phase)


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
    rings, segments = 31, 32
    phase = np.array([.002,.01,.02,.035,.055,.083,.12,.17,.22,.27,.32,.37,.41,.45,.49,
                      .53,.57,.61,.65,.69,.73,.77,.81,.85,.88,.91,.935,.957,.975,.988,.997])
    profile = PchipInterpolator([0,.006,.03,.075,.13,.30,.39,.46,.50,.56,.64,.74,.80,.87,.92,.96,.985,1],
                                [0,.63,.72,.54,.43,.42,.45,.49,.60,.83,1.05,1.16,1.17,1.12,.97,.75,.49,0])
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
        uv.extend(np.column_stack((.02+.96*np.full_like(angles,along),.02+.96*angles/(2*np.pi))))
    stride = segments+1
    for ring in range(rings-1):
        for section in range(segments):
            near = ring*stride+section
            far = near+stride
            indices.extend([(near,near+1,far),(far,near+1,far+1)])
    for tip in [False,True]:
        axis = 1 if tip else -1
        for section in range(segments):
            polar = len(positions)
            positions.append([upper[0] if tip else lower[0],origin[1]+(extent*.035 if tip else 0),origin[2]])
            normals.append([axis,0,0])
            angle = (angles[section]+angles[section+1])*.5
            tangents.append([0,-axis*np.cos(angle),-axis*np.sin(angle),-1])
            uv.append([.98 if tip else .02,.02+.96*(section+.5)/segments])
            start = section+((rings-1)*stride if tip else 0)
            indices.append((start,start+1,polar) if tip else (polar,start+1,start))
    assert len(indices)==1984
    for slot, values in [(primitive['attributes'][key],np.asarray(value,'<f4')) for key,value in
                         [('POSITION',positions),('NORMAL',normals),('TANGENT',tangents),('TEXCOORD_0',uv)]] + [(primitive['indices'],np.asarray(indices,'<u2').reshape(-1,1))]:
        accessor = doc['accessors'][slot]
        accessor['count'] = len(values)
        views[accessor['bufferView']] = values.tobytes()
        for key, function in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key] = function(values,axis=0).tolist()


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
             (.225,.092),(.285,.081),(.43,.072),(.62,.056),(.79,.037),(.93,.012),(.975,0)]
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
    shoulder = [(0,.975,1),(.018,.995,1),(.047,1,1),(.11,.994,.95),
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
        return .00034*beads + .00165*lip + .0115*(1-np.minimum(radius,1.3)**2)
    step = .000045
    gradX = (Height(side+step,up)-Height(side-step,up))/(2*step)
    gradY = (Height(side,up+step)-Height(side,up-step))/(2*step)
    target = np.column_stack((-gradX,-gradY,np.ones_like(side)))
    target /= np.linalg.norm(target,axis=1,keepdims=True)
    tangentSpace = np.column_stack((np.sum(target*frameT,axis=1),np.sum(target*frameB,axis=1),np.sum(target*frameN,axis=1)))
    weight = Ramp(.56,.83,frameN[:,2])*Ramp(-.053,-.0519,field[rows,cols,2])
    return rows,cols,tangentSpace,weight


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
    grain = np.clip((Sample(source['Metal009Color'],u,v)-148)/13,-1.7,1.7)
    brush = np.clip((Sample(source['Metal009Roughness'],u,v)-119)/24,-1.8,1.8)
    patina = np.clip((Sample(source['Metal046BColor'],u*.81+.16,v+.4)-63)/20,-1.5,1.5)
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
    # The two photographs resolve a narrow stripe on the stem and a stretched
    # reflection at the outer oval. Fade directional detail at the pole,
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
        anisotropyStrength=.43,anisotropyRotation=0,anisotropyTexture=directionMap)
    for extension in ('KHR_materials_anisotropy','KHR_texture_transform'):
        if extension not in doc['extensionsUsed']:
            doc['extensionsUsed'].append(extension)
    store(atlas['baseColorTexture'],base)
    store(atlas['metallicRoughnessTexture'],orm)
    return {name:np.percentile(rough[mask],[10,50,90]).round(1).tolist() for name,mask in coverage.items()}


def Build(cache):
    repo = Path(__file__).resolve().parents[2]
    folder = repo / 'Taierzhuang1938/Model/Type38_511'
    def Original(file):
        return subprocess.check_output(['git', '-C', str(repo), 'show', f'8fd3c955:Taierzhuang1938/Model/Type38_511/{file}'])
    doc, views, baseline = ReadGlb(Original('Model_Type38_511.glb'))
    assert baseline == '285f3258e5bf03d56f1aff6e9390a985e1640a98282e009a6ee30d9a27dda3bb'
    source = ReadSamples(cache)
    stats = {}
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
        if loop:
            loopTriangles = PoseDisplayLoop(doc, views, primitive)
        if handle:
            ShapeHandle(doc, views, primitive)
        if disk:
            ShapeRearMedallion(doc, views, primitive)
        trim = part == 'Exterior_FrontWindowBacking49'
        if trim:
            ShapeWindowTrim(doc, views, primitive)
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
        band = part == 'Exterior_MiddleBand57'
        bare = band or part in ('Exterior_HandleOval08', 'T38_435F2_VisualBackingRearEnd', 'T38_440D2_IndependentVisibleRecess', 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH', 'SightDetailV3_DecorativeConvexRoundSurface', 'Exterior_FoldedFrame12', 'SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY')
        patinaMap = source['steel'] if wood else source['Metal046BColor']
        weights = np.stack([normalSide,normalUp,normalLength]) ** 4
        weights /= np.maximum(weights.sum(axis=0), .0001)
        def SteelPatch(scale, bias):
            result = np.zeros_like(length)
            for weight, horizontal, vertical in zip(weights, [length,length,side], [up,side,up], strict=True):
                result += weight * Sample(patinaMap, horizontal * scale + bias, vertical * scale * 1.17 + bias * .7, wood)
            center,spread = (155,66) if wood else (63,20)
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
            rgbScan = Sample(source['grain'], across, down)
            poreScan = Sample(source['pores'], across, down)
            glossScan = Sample(source['woodGloss'], across, down)
            if separate:
                stain = np.clip((Sample(source['grain'],.24+transverse*.84,.32-along*.64)-32)/30,-1.05,1.05)
                grainSteel = np.clip((glossScan-59)/42,-1,1)
                edge = np.clip((bend-.11)*1.8,0,1)*np.clip(.46+.27*stain+.18*grainSteel,0,1)
            fibre = np.clip((rgbScan - 15) / 49, 0, 1.3)
            pore = np.clip((132 - poreScan) / 51, -.7, 1.15)
            handling = np.exp(-((length-.025) / .115) ** 2) + .65 * np.exp(-((length+.5) / .16) ** 2)
            handling *= np.clip(.56 + .27 * normalSide ** 2 + .23 * stain, 0, 1)
            amber = np.clip(.46 + .39 * fibre + .047 * stain + .052 * angle, .09, .98)
            sun = Ramp(-.79,-.661,length)*(1-Ramp(-.23,-.065,length))
            warmWrist = np.exp(-((length+.035)/.17)**2)
            vessels = PoreField(length,transverse+side*side*13)
            fleck = np.clip((pore-.12)*.73 + (.37-fibre)*.50 + .76*vessels,0,1)
            honey = Tint([116,53,5],[237,136,20],amber)
            oldLacquer = Tint([38,12,6],[91,30,12],amber)
            rim = 1-Ramp(-.625,-.606,length)
            color = Blend(oldLacquer,Tint([68,22,10],[129,49,21],amber),rim) if separate else Blend(
                Tint([62,22,9],[158,66,22],amber),honey,np.clip(.06+.94*sun+.12*warmWrist,0,1))
            if separate:
                shoulder = Ramp(-.603,-.552,length)*(1-Ramp(-.394,-.352,length))
                crown = Ramp(.10,.85,normalUp)
                glaze = np.clip(.28+.65*crown+.12*rgbScan/64+.06*stain,0,1)*shoulder
                lacquerGrain = np.clip(.33+.64*fibre+.12*stain,0,1.06)
                color = Blend(color,Tint([120,35,4],[237,93,13],lacquerGrain),glaze)
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
                insetTone = Tint([68,33,15],[146,89,34],np.clip(.41+.40*fibre+.085*stain,0,1))
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
            rough = 102 + .49*(glossScan-60) + 15*fleck + 11*stain - 27*handling + breach*47 + 23*scratch+33*chip
            coat = material['extensions']['KHR_materials_clearcoat']
            coat['clearcoatFactor'] = .96
            varnish = Load(coat['clearcoatTexture'])
            varnish[:, :, 0] = np.where(padded, np.clip(206 + 19*handling - 20*fleck - 114*breach-68*scratch-117*chip, 0, 238), 0)
            varnish[:, :, 1] = np.where(padded, np.clip(63 + .33*(glossScan-60) + 12*fleck + 7*stain - 13*handling + 48*breach, 34, 132), 0)
            if separate:
                glossVariation = .47*(glossScan-60) + 13*stain + 6*grainSteel
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1] + glaze*(8+glossVariation),34,139),0)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.10*glaze*fleck))
                sheltered = Ramp(-.3775,-.3718,length)*(1-Ramp(-.3642,-.3624,length))*Ramp(.42,.80,normalUp)
                color = Blend(color,Tint([38,13,7],[91,32,15],amber),sheltered*.71)
                grainTone = np.clip(.54*(fibre-.55)+.13*stain,-.32,.30)
                color *= (1+sheltered*grainTone)[:,:,None]
                warmPocket = sheltered*Ramp(-.3705,-.3655,length)
                color = Blend(color,Tint([57,20,8],[115,44,17],amber),warmPocket*.36)
                innerRim = sheltered*(1-Ramp(-.371,-.367,length))
                color = Blend(color,Tint([61,26,11],[122,54,23],amber),innerRim*.64)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.48*sheltered))
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1]+28*sheltered,0,150),0)
                rough += 17*sheltered
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
            relief = (poreScan-132)*.0027 - .10*fleck - .43*scratch - .62*chip
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
            Store(coat['clearcoatTexture'], varnish)
        else:
            jacket = 'CoverSkin' in part or 'CoverHalf' in part or 'LowerFacing' in part
            lightTube = part in ('Exterior_LongRound44','Exterior_FrontOuterTube76')
            collar = part == 'T38_435F2_IndependentTailNeckExterior'
            shoulder = part == 'T38_430L_VisibleUpperShoulderCoordination'
            if bare or collar or lightTube:
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
            brush = np.clip((Sample(source['Metal009Roughness'],grainU,grainV)-119)/24,-1.8,1.8)
            rough = (94 if bare or collar else 104) + 16*flow + 13*stain + 4*brush - 20*edge
            if lightTube:
                exposed = part == 'Exterior_LongRound44'
                if exposed:
                    polished = Ramp(-.900,-.646,length)
                    color = Tint([46,47,47],[116,114,106],.30+.43*polished+.14*flow+.065*stain)
                    rough = 79-24*polished+8*flow+5*stain+4*brush
                    silver = Ramp(-.696,-.653,length)
                    silver *= np.clip(.96+.12*flow+.035*grainSteel,.72,1)
                    polishedSteel = Tint([133,132,127],[204,202,192],.48+.18*flow+.095*stain)
                    color = Blend(color,polishedSteel,silver)
                    distalOxide = 1-Ramp(-.850,-.780,length)
                    reflectance = 1.056+.184*Ramp(-.750,-.692,length)+.235*distalOxide
                    color = (color+14.025)*reflectance[:,:,None]**(1/2.4)-14.025
                    rough += silver*(91+12*flow+5*stain+5*brush-rough)
                else:
                    color = Tint([58,57,54],[99,96,90],.46+.17*flow+.08*stain)
                    rough = 86+7*flow+5*stain+4*brush
            metal = 251 - oxidation*(22 if bare else 41)
            if part == 'Exterior_LongRound44':
                metal -= (1-silver)*(108+15*oxidation+12*distalOxide)
            if trim:
                color = Tint([39,37,33],[90,83,73],.42+.26*flow+.09*stain)
                color = Blend(color,np.array([132,124,109],dtype='f'),.35*edge)
                rough = 143+16*flow+13*stain-26*edge
                metal = 207+19*edge-9*oxidation
            relief = .025*grainSteel + .024*brush
            if shoulder or jacket or band or handle:
                grain = np.clip((Sample(source['Metal009Color'],grainU,grainV)-148)/13,-1.7,1.7)
                scoring = np.clip((Sample(source['Metal009Displacement'],grainU,grainV)-147)/71,-1.7,1.7)
                # The band wraps in U. All its layers must close at the same azimuth.
                tarnishU = grainU if band else grainU*.73
                speckleU = grainU*(5 if band else 5.1)
                tarnish = np.clip((Sample(source['Metal046BRoughness'],tarnishU+.16,grainV+.41)-90)/23,-1.5,1.5)
                speckle = np.clip((Sample(source['Metal046BRoughness'],speckleU+.45,grainV*4+.29)-90)/17,-1.8,1.8)
                pits = Ramp(.27,1.30,speckle)
                if shoulder or jacket:
                    crown = Ramp(-.10,.95,normalUp)
                    rub = np.clip(.31+.44*crown+.24*flow+.15*stain+.23*edge,0,1)
                    if shoulder:
                        color = Tint([40,38,33],[143,138,124],.22+.66*rub+.047*grain-.08*pits)
                        rough = 97-37*rub+10*brush+5*tarnish+5*speckle
                        metal = 246+9*rub-3*tarnish
                    else:
                        color = Tint([59,55,49],[155,149,138],.12+.64*rub+.055*grain)
                        rough = 122-40*rub+12*brush+7*tarnish+6*speckle
                        metal = 217+29*rub-8*tarnish
                elif band:
                    rub = np.clip(.60+.22*stain+.14*grainSteel+.16*edge,0,1)
                    color = Tint([99,95,86],[174,169,156],.32+.51*rub+.073*grain)
                    rough = 110-30*rub+26*brush+9*tarnish+4*flow
                    metal = 231+18*rub-5*tarnish
                else:
                    knob = Ramp(.044,.054,side)
                    rub = np.clip(.49+.18*flow+.15*stain+.09*grain,0,1)
                    bareOval = Tint([129,113,111],[193,183,181],.63+.085*speckle+.07*flow)
                    oval = Blend(bareOval,np.array([93,70,60],dtype='f'),pits*.54)
                    outward = Ramp(.030,.039,side)
                    neck = Tint([188,161,151],[261,243,246],.34+.50*rub)
                    neck = (neck+14.025)*(1.17-.33*outward[:,:,None])**(1/2.4)-14.025
                    color = Blend(neck,oval,knob)
                    neckRough = 66-3*outward+4*brush+3*tarnish
                    rough = neckRough+knob*(88.5+5*speckle+16*pits+3*grain-neckRough)
                    neckMetal = 251-2*tarnish
                    outerEnd = Ramp(.875,.955,(np.arange(width,dtype='f')+.5)/width)
                    metal = neckMetal+knob*(251-49*pits-3*outerEnd-neckMetal)
                relief = .15*scoring+.056*tarnish-.25*pits
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
                centerPlate = 1-Ramp(.14,.22,radius)
                wear = Ramp(.10,.62,beads)
                diskColor = Tint([132,123,110],[232,224,207],.25+.63*wear+.25*center+.06*flow)
                diskColor = Blend(diskColor,np.array([154,145,133],dtype='f'),centerPlate*.60)
                color = Blend(color,diskColor,face)
                rough += (154-73*wear-53*center-15*centerPlate+9*stain-rough)*face
                metal += (218+30*wear+9*center+9*centerPlate+4*flow-metal)*face
                relief += face*(1.48*beads + .78*center)
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
        if 'normalTexture' in material:
            normalSlot = material['normalTexture']
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
    doc['asset']['extras']['version'] = 'Type38_PolishedGrip16'
    triangles = sum(doc['accessors'][prim['indices']]['count']//3 for mesh in doc['meshes'] for prim in mesh['primitives'])
    assert triangles == 72088+loopTriangles-924 and triangles <= 80000
    doc['asset']['extras']['runtimeTriangles'] = triangles
    digest = WriteGlb(folder/'Model_Type38_511.glb', doc, views)
    manifest = json.loads(Original('Data_Type38_511.json'))
    manifest['exteriorTriangleDeltas']['Exterior_HandleOval08'] = manifest['exteriorTriangleDeltas'].get('Exterior_HandleOval08',0)-15
    manifest['exteriorTriangleDeltas']['Exterior_RetainedImportedBody74'] = manifest['exteriorTriangleDeltas'].get('Exterior_RetainedImportedBody74',0)+loopTriangles-924
    manifest['exteriorTriangleDeltas']['T38_440D2_IndependentVisibleRecess'] = manifest['exteriorTriangleDeltas'].get('T38_440D2_IndependentVisibleRecess',0)+1281
    manifest.update(version=18, runtimeSha256=digest, triangles=triangles, generator='_blender/Script_Type38Surface.py',
                    finishRoughnessP10P50P90=stats, surfaceSources={key: value[3] for key,value in SAMPLES.items()},
                    metalSurfaceSources=METAL_SOURCES,
                    markings=['scale graduations and numerals only'])
    for record, image in zip(manifest['imagePayloads'], doc['images'], strict=True):
        chunk = views[image['bufferView']]
        record.update(bytes=len(chunk), sha256=hashlib.sha256(chunk).hexdigest())
    for name, record in [('Data_Type38_511.json', manifest), ('Data_Type38NpcLod.json', {**json.loads(Original('Data_Type38NpcLod.json')), 'sourceSha256':digest, 'fpsTriangles':triangles, 'npcTriangles':triangles-4608})]:
        (folder/name).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Finished:', digest, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path(__file__).resolve().parents[2]/'tmp/Type38SurfaceSources')
    Build(parser.parse_args().cache)
