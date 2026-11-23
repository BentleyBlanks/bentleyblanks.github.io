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


def RearFace(side, up):
    vertical = (up-.0423)/.014
    horizontal = side/.014
    radius = np.hypot(vertical,horizontal)
    angle = np.arctan2(vertical,horizontal)
    rows = (radius-.25)*12.8
    row = np.rint(rows)
    count = np.maximum(12,np.rint((.25+row/12.8)*75))
    around = angle*count/(2*np.pi) + (row%2)*.5
    footprint = ((rows-row)/.50)**2 + ((around-np.rint(around))/.49)**2
    beads = np.maximum(0,1-footprint)**1.3 * Ramp(.23,.28,radius)*(1-Ramp(.92,.98,radius))
    center = .76*np.exp(-(radius/.15)**2)
    ring = .55*np.exp(-((radius-.201)/.027)**2)
    return beads,center+ring,radius


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
                color = Tint([64,61,57],[105,100,92],.51+.22*flow+.05*stain)
                rough = 97+25*flow+18*stain+4*brush-16*edge
            if handle:
                knob = Ramp(.044,.054,side)
                color = Blend(Tint([155,149,139],[199,193,183],.48+.19*flow),
                              Tint([84,75,67],[121,107,96],.43+.26*flow+.12*stain),knob)
                rough = 68 + 9*flow + 6*stain + knob*(17+3*brush)
            metal = 251 - oxidation*(22 if bare else 41)
            relief = .025*grainSteel + .024*brush
            if disk:
                face = Ramp(.18,.69,normalLength)*Ramp(-.0547,-.0519,length)
                beads,center,_ = RearFace(side,up)
                color = Blend(color,Tint([141,135,125],[210,201,185],.29+.42*beads+.35*center+.09*flow),face)
                rough += (102-31*beads-32*center+6*stain-rough)*face
                relief += face*(2.2*beads + 5.1*center)
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
            normals /= np.maximum(1e-7, np.linalg.norm(normals, axis=2, keepdims=True))
            Store(normalSlot, np.where(padded[:, :, None], (normals+1)*127.5, [128,128,255]))
        orm[:, :, 1] = np.where(padded, np.clip(rough, 39, 196), 0)
        orm[:, :, 2] = np.where(padded, np.clip(metal, 0, 255), 0)
        Store(baseSlot, np.where(padded[:, :, None], color, 0))
        Store(ormSlot, orm)
        stats[part] = np.percentile(orm[:, :, 1][valid], [10, 50, 90]).round(1).tolist()
        print(part, stats[part], flush=True)
    doc['asset']['extras']['version'] = 'Type38_AmberLacquer03'
    triangles = sum(doc['accessors'][prim['indices']]['count']//3 for mesh in doc['meshes'] for prim in mesh['primitives'])
    assert triangles == 70807
    doc['asset']['extras']['runtimeTriangles'] = triangles
    digest = WriteGlb(folder/'Model_Type38_511.glb', doc, views)
    manifest = json.loads(Original('Data_Type38_511.json'))
    manifest['exteriorTriangleDeltas']['Exterior_HandleOval08'] = manifest['exteriorTriangleDeltas'].get('Exterior_HandleOval08',0)-15
    manifest.update(version=5, runtimeSha256=digest, triangles=triangles, generator='_blender/Script_Type38Surface.py',
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
