"""Rebuild the cosmetic grip shell and bake the museum-inspired game surfaces."""
import argparse
import hashlib
import io
import json
import subprocess
import urllib.request
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


def RearOutline(angle):
    delta = (np.rad2deg(angle)-190+180)%360-180
    return PchipInterpolator([-180,-40,-29,-19,-8,2,13,20,28,39,180],
                             [0,0,.013,.104,.257,.282,.243,.140,.035,0,0])(delta)


def RearFace(side, up):
    vertical = (up-.0423)/.014
    horizontal = side/.014
    radius = np.hypot(vertical,horizontal)
    angle = np.arctan2(vertical,horizontal)
    rows = (radius-.25)*8.75
    row = np.rint(rows)
    count = np.maximum(12,np.rint(np.maximum(.25+row/8.75,.22)*58))
    around = angle*count/(2*np.pi) + (row%2)*.5
    footprint = ((rows-row)/.50)**2 + ((around-np.rint(around))/.49)**2
    beads = np.maximum(0,1-footprint)**1.08 * Ramp(.22,.26,radius)*(1-Ramp(.92,.98,radius/(1+RearOutline(angle))))
    center = .76*np.exp(-(radius/.15)**2)
    ring = .55*np.exp(-((radius-.201)/.027)**2)
    return beads,center+ring,radius


def ShapeRearMedallion(doc, views, primitive):
    attrs = primitive['attributes']
    source = Attribute(doc, views, attrs['POSITION'], 3)
    centerX,centerY = (source.max(axis=0)[:2]+source.min(axis=0)[:2])*.5
    radius = np.ptp(source[:,0])*.5
    contact = source[:,2].min()
    rim = source[:,2].max()-.00062
    segments = 72
    angles = np.arange(segments+1)*2*np.pi/segments
    direction = np.column_stack((np.cos(angles),np.sin(angles)))
    ear = RearOutline(angles)
    crown = [(0.045,.029),(.10,.028),(.143,.045),(.175,.071),(.201,.065),
             (.225,.041),(.285,.037),(.43,.034),(.62,.027),(.79,.018),(.93,.006),(.975,0)]
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
        xy = direction*scale*(1+tab*ear[:,None])
        axial = rim+(contact-rim)*advance-radius*.035*xy[:,1]**2*(1-advance)
        chart = np.column_stack((.75+.23*advance*np.ones_like(angles),.025+.83*angles/(2*np.pi)))
        sideRings.append(Ring(xy,axial,chart))
    for inner,outer in zip(sideRings,sideRings[1:]):
        Connect(inner,outer)
    back = Ring(direction*.87,contact,direction*.030+np.array([.804,.936]))
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
        beads,center,radius = RearFace(side,up)
        boss = (1-Ramp(.19,.36,radius))*(1-np.exp(-(radius/.113)**2))
        return .00023*beads + .00097*center + .00066*boss + .0095*(1-np.minimum(radius,1.3)**2)
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
        if handle:
            ShapeHandle(doc, views, primitive)
        if disk:
            ShapeRearMedallion(doc, views, primitive)
        field, padded, valid = SurfaceAtlas(doc, views, primitive, (width, height))
        if part == 'T38_460G_WoodGroove_VisualCandidate':
            orm[~padded,0] = 0
        side, up, length, normalSide, normalUp, normalLength, bend = np.moveaxis(field, 2, 0)
        angle = .4 * np.sin(11.3 * length) + .15 * np.sin(31 * length)
        wood = 'Wood' in part
        transverse = (up * .92 + side * .42 + length * .023 + .0018 * np.sin(16 * length))
        along = length + side * .19
        band = part == 'Exterior_MiddleBand57'
        bare = band or part in ('Exterior_HandleOval08', 'T38_435F2_VisualBackingRearEnd', 'T38_440D2_IndependentVisibleRecess', 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH', 'SightDetailV3_DecorativeConvexRoundSurface', 'Exterior_FoldedFrame12', 'SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY')
        weights = np.stack([normalSide,normalUp,normalLength]) ** 4
        weights /= np.maximum(weights.sum(axis=0), .0001)
        def SteelPatch(scale, bias):
            result = np.zeros_like(length)
            for weight, horizontal, vertical in zip(weights, [length,length,side], [up,side,up], strict=True):
                result += weight * Sample(source['steel'], horizontal * scale + bias, vertical * scale * 1.17 + bias * .7, True)
            return np.clip((result - 155) / 66, -1.5, 1.5)
        stain = SteelPatch(8.7, .43)
        grainSteel = SteelPatch(42, .16)
        edge = np.clip((bend - .025) * 2.7, 0, 1)
        edge *= np.clip(.40 + .36 * grainSteel + .23 * stain, .04, 1)
        rubbed = np.clip(.33 + .36 * stain + .16 * grainSteel + .50 * edge, 0, 1)
        if wood:
            separate = part == 'Wood_UpperFittedCrown05'
            across = (.13 if separate else .73) + transverse * 1.10 + side * side * 16 + .0035 * np.sin(8.4 * length)
            down = (.63 if separate else .34) - along * 1.44
            rgbScan = Sample(source['grain'], across, down)
            poreScan = Sample(source['pores'], across, down)
            glossScan = Sample(source['woodGloss'], across, down)
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
                shoulder = Ramp(-.596,-.521,length)*(1-Ramp(-.394,-.352,length))
                color = Blend(color,Tint([65,22,9],[134,51,16],amber),shoulder*.72)
            else:
                foreTip = 1-Ramp(-.91,-.69,length)
                color = Blend(color,Tint([48,17,8],[116,49,19],amber),foreTip*.84)
                handBed = np.exp(-((length+.29)/.18)**2)
                color = Blend(color,Tint([88,35,12],[199,92,24],amber),handBed*.43)
            color *= (1-(.17 if separate else .25)*fleck)[:,:,None]
            if not separate:
                heel = Ramp(.12,.245,length)*np.clip(.62-.28*stain,0,1)
                color = Blend(color,Tint([53,21,10],[113,46,18],amber),heel*.63)
                woodOil = (.34*grainSteel+.60*stain+.35*SteelPatch(2.6,.23))
                color *= (1+np.clip(woodOil,-1,1)*(.055+.070*sun))[:,:,None]
                quiet = Ramp(.038,.16,length)*.47
                color = Blend(color,Tint([88,32,13],[157,68,27],.49+.14*stain),quiet)
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
            if not separate:
                mellow = rearPanel*np.clip(.72+.22*rearward-.24*warmPath,0,1)
                varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-.47*mellow))
                varnish[:,:,1] = np.where(padded,np.clip(varnish[:,:,1]+33*mellow,0,142),0)
                rough += 16*mellow
            metal = np.zeros_like(rough)
            relief = (poreScan-132)*.0027 - .10*fleck - .43*scratch - .62*chip
            if not separate:
                distal = Ramp(-.673,-.616,length)
                edgeDist = np.hypot(np.maximum(np.maximum(-.673-length,length+.599),0),up-(.0284+.0019*distal))
                inlay = (1-Ramp(.00150,.00212,edgeDist))*Ramp(.006,.010,side)
                rolled = (1-Ramp(.0001,.00225,edgeDist))**.63
                scuff = PaintBandScuff(doc, views, primitive, (width,height))*np.clip(.74+.22*grainSteel,.22,1)
                color = Blend(color,Tint([54,28,17],[101,49,20],amber),scuff*.88)
                color = Blend(color, Tint([96,84,72],[138,124,105],.45+.26*rolled+.11*stain), inlay)
                metal = inlay * 250
                varnish[:, :, 0] = np.rint(varnish[:, :, 0]*(1-inlay)*(1-.50*scuff))
                rough += 31*scuff
                rough += inlay * (97-21*rolled+6*stain-rough)
                relief = relief*(1-inlay) + (1.12*rolled+.36*inlay)*Ramp(.006,.010,side)-.25*scuff
            Store(coat['clearcoatTexture'], varnish)
        else:
            jacket = 'CoverSkin' in part or 'CoverHalf' in part or 'LowerFacing' in part
            lightTube = part in ('Exterior_LongRound44','Exterior_FrontOuterTube76')
            collar = part == 'T38_435F2_IndependentTailNeckExterior'
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
            fine = Sample(source['steel'], along*33 + .12, (up*.83 + side*.53)*162 + .63, True)
            brush = np.clip((fine - 159)/77, -1, 1)
            rough = (94 if bare or collar else 104) + 16*flow + 13*stain + 4*brush - 20*edge
            if jacket or band:
                rough += 9*flow + 8*stain
            if lightTube:
                exposed = part == 'Exterior_LongRound44'
                color = Tint([150,151,149],[194,192,183],.60+.15*flow+.04*stain) if exposed else Tint([58,57,54],[99,96,90],.46+.17*flow+.08*stain)
                rough = (68 if exposed else 86) + 7*flow + 5*stain + 4*brush
            if band:
                color = Tint([116,113,107],[170,166,156],.48+.22*flow+.05*stain)
                rough = 87+24*flow+17*stain+5*brush-15*edge
            if jacket:
                color = Tint([71,69,64],[117,111,101],.51+.22*flow+.05*stain)
                rough = 97+25*flow+18*stain+4*brush-16*edge
            if handle:
                knob = Ramp(.044,.054,side)
                color = Blend(Tint([114,110,100],[159,153,142],.48+.19*flow),
                              Tint([101,87,75],[148,130,113],.43+.26*flow+.12*stain),knob)
                rough = 48 + 6*flow + 4*stain + knob*(21+5*brush+4*grainSteel)
            metal = 251 - oxidation*(22 if bare else 41)
            if handle:
                metal -= knob*(42+16*oxidation)
            if jacket:
                metal -= 16+7*oxidation
            relief = .025*grainSteel + .024*brush
            if disk:
                face = Ramp(.18,.69,normalLength)*Ramp(-.0547,-.0519,length)
                beads,center,radius = RearFace(side,up)
                centerPlate = 1-Ramp(.14,.22,radius)
                wear = Ramp(.10,.62,beads)
                diskColor = Tint([132,123,110],[232,224,207],.25+.63*wear+.25*center+.06*flow)
                diskColor = Blend(diskColor,np.array([154,145,133],dtype='f'),centerPlate*.60)
                color = Blend(color,diskColor,face)
                rough += (168-68*wear-57*center-17*centerPlate+7*stain-rough)*face
                metal += (218+30*wear+9*center+9*centerPlate+4*flow-metal)*face
                relief += face*(1.48*beads + .78*center)
            if part == 'Exterior_FoldedFrame12':
                marks = FrameEngraving(Image.fromarray(Load(material['normalTexture'])))
                color = Tint([108,104,97],[160,155,142],.50+.19*flow+.06*stain)
                color = Blend(color, np.array([39,39,38], dtype='f'), marks*.84)
                rough = 112+10*flow+6*brush+24*marks
            if part == 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH':
                color = Tint([154,146,128],[198,187,159],.57+.12*flow+.05*stain)
                rough = 108+11*flow+7*brush
        if 'normalTexture' in material:
            normalSlot = material['normalTexture']
            normals = Load(normalSlot).astype('f') / 127.5 - 1
            if not wood and part != 'Exterior_FoldedFrame12':
                normals[:, :, :2] *= .30 if not disk else .08
            if wood or part == 'T38_430L_VisibleUpperShoulderCoordination':
                normals[:, :, :2] = 0
                normals[:, :, 2] = 1
            gradientV, gradientU = np.gradient(gaussian_filter(relief, .55))
            direction = np.dstack((-gradientU, gradientV)) * (.86 if wood else .92 if disk else .69)
            limit = .90 if disk else .33 if wood else .18
            normals[:, :, :2] += np.clip(direction, -limit, limit)
            if disk:
                rows,cols,tangentSpace,weight = MedallionRelief(doc,views,primitive,field,valid,padded)
                normals[rows,cols] += (tangentSpace-normals[rows,cols])*weight[:,None]
            normals /= np.maximum(1e-7, np.linalg.norm(normals, axis=2, keepdims=True))
            Store(normalSlot, np.where(padded[:, :, None], (normals+1)*127.5, [128,128,255]))
        orm[:, :, 1] = np.where(padded, np.clip(rough, 39, 196), 0)
        orm[:, :, 2] = np.where(padded, np.clip(metal, 0, 255), 0)
        Store(baseSlot, np.where(padded[:, :, None], color, 0))
        Store(ormSlot, orm)
        stats[part] = np.percentile(orm[:, :, 1][valid], [10, 50, 90]).round(1).tolist()
        print(part, stats[part], flush=True)
    doc['asset']['extras']['version'] = 'Type38_CrownRelief06'
    triangles = sum(doc['accessors'][prim['indices']]['count']//3 for mesh in doc['meshes'] for prim in mesh['primitives'])
    assert triangles == 72088
    doc['asset']['extras']['runtimeTriangles'] = triangles
    digest = WriteGlb(folder/'Model_Type38_511.glb', doc, views)
    manifest = json.loads(Original('Data_Type38_511.json'))
    manifest['exteriorTriangleDeltas']['Exterior_HandleOval08'] = manifest['exteriorTriangleDeltas'].get('Exterior_HandleOval08',0)-15
    manifest['exteriorTriangleDeltas']['T38_440D2_IndependentVisibleRecess'] = manifest['exteriorTriangleDeltas'].get('T38_440D2_IndependentVisibleRecess',0)+1281
    manifest.update(version=8, runtimeSha256=digest, triangles=triangles, generator='_blender/Script_Type38Surface.py',
                    finishRoughnessP10P50P90=stats, surfaceSources={key: value[3] for key,value in SAMPLES.items()},
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
