"""Add localized wear and refine the visible rear profile of the Type38 game asset."""
import argparse
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_Type38EdgeHighlights import BevelMask
from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RearFinish import BakeRearFinish
from Script_Type38SeatFit import Part, Store, Unit
from Script_Type38Surface import Attribute, Ramp, RearOutline, SaveType38Assets, ScanOffset, SurfaceAtlas


STOCK = 'T38_460G_WoodGroove_VisualCandidate'
UPPER = 'Wood_UpperFittedCrown05'
PLATE = 'Exterior_SeatedTang05'
DISK = 'T38_440D2_IndependentVisibleRecess'
WOOD = {STOCK, UPPER}
COVER = {'T38_430B_IndependentLeftCoverSkin', 'T38_430B_RetainedRightCoverHalf'}
STEEL = COVER | {'T38_430L_VisibleUpperShoulderCoordination', PLATE}


def RefineDisk(doc, views):
    disk = Part(doc, views, DISK)
    _, arrays, subset, _ = disk
    points, normals, tangents = [array[subset] for array in arrays]
    node = next(node for node in doc['nodes'] if node['extras']['SourceObject'] == DISK)
    primitive, = doc['meshes'][node['mesh']]['primitives']
    uv = Attribute(doc, views, primitive['attributes']['TEXCOORD_0'], 2)[subset]
    center = points[np.argmin(np.sum((uv-[.408,.48])**2,axis=1))]
    start, end = points[:,2].min(), points[:,2].max()
    width = max(points[:,0].max()-center[0], (points[:,1].max()-points[:,1].min())*.5)

    def Warp(vertices):
        out = vertices.copy()
        xy = vertices[:,:2] - center[:2]
        radius = np.linalg.norm(xy,axis=1) / width
        angle = np.arctan2(xy[:,1],xy[:,0])
        shoulder = RearOutline(angle)
        front = Ramp(.34,.86,(vertices[:,2]-start)/(end-start))
        scale = 1 - .67 * shoulder / (1 + shoulder) * Ramp(.42,.86,radius) * front
        out[:,:2] = center[:2] + xy * scale[:,None]
        crown = np.maximum(0,vertices[:,2]-center[2])
        out[:,2] -= .20*crown*front
        return out

    moved = Warp(points)
    step = np.eye(3)*.000008
    jacobian = np.stack([(Warp(points+axis)-Warp(points-axis))/.000016 for axis in step],axis=2)
    normal = Unit(np.linalg.solve(jacobian.transpose(0,2,1),normals[:,:,None])[:,:,0])
    tangent = np.einsum('nij,nj->ni',jacobian,tangents[:,:3])
    tangent -= normal*np.sum(tangent*normal,axis=1,keepdims=True)
    Store(doc,views,disk,(moved,normal,np.column_stack((Unit(tangent),tangents[:,3]))))
    return float(np.max(np.linalg.norm(moved[:,:2]-center[:2],axis=1)/width))


def GrainNoise(u,v,seed):
    x,y = np.floor(u).astype('i'),np.floor(v).astype('i')
    s,t = Ramp(0,1,u-x),Ramp(0,1,v-y)
    tile = x+65537*y
    a,b = ScanOffset(tile,seed),ScanOffset(tile+1,seed)
    c,d = ScanOffset(tile+65537,seed),ScanOffset(tile+65538,seed)
    base = a+s*(b-a)
    return base+t*(c+s*(d-c)-base)


def Streaks(length, cross, seed, count, span, levels, size):
    rng = np.random.default_rng(seed)
    layers = np.zeros_like(length)
    for _ in range(count):
        z = rng.uniform(*span)
        lateral = rng.uniform(*levels)
        reach = rng.uniform(*size)
        width = rng.uniform(.00017,.00086)
        along = (length-z)/reach
        slope = rng.uniform(-.11,.11)
        turned = cross-lateral-slope*(length-z)-.00025*np.sin(4*along)
        line = (1-Ramp(.12,1,np.abs(turned)/width)) * (1-Ramp(.32,1,np.abs(along)))
        np.maximum(layers,line*rng.uniform(.43,1),out=layers)
    return layers


def WoodWear(field, part):
    side,up,length,normalSide = np.moveaxis(field[:,:,:4],2,0)
    grip = Ramp(-.655,-.575,length)*(1-Ramp(-.295,-.228,length))
    wrist = .86*Ramp(-.219,-.156,length)*(1-Ramp(-.053,.012,length))
    sideMask = Ramp(.21,.69,np.abs(normalSide))
    coverage = np.maximum(grip,wrist)*sideMask
    if part == UPPER:
        coverage *= .46
    cross = up+.23*side
    stain = GrainNoise(length*27+2,cross*216+7,821)
    wear = GrainNoise(length*84+5,cross*440+2,319)
    fibre = GrainNoise(length*105,cross*1540,167)
    rub = coverage*Ramp(.46,.78,.68*wear+.32*stain)
    dust = coverage*(.27+.55*Ramp(.21,.77,stain))
    for z, y, longRadius, heightRadius, tilt in (
        (-.514,.016,.016,.0045,.17),(-.440,.021,.018,.0040,-.11),
        (-.368,.014,.011,.0031,.32),(-.128,.013,.009,.0038,-.24),
    ):
        along = (length-z)/longRadius
        across = (cross-y-tilt*(length-z))/heightRadius
        abrasion = (1-Ramp(.14,1,np.hypot(along,across)+.22*(fibre-.5)))
        rub = np.maximum(rub,coverage*abrasion*(.57+.35*wear))
    scratches = Streaks(length,cross,643,37,(-.608,-.263),(.004,.028),(.0024,.018))
    scratches = np.maximum(scratches,Streaks(length,cross,949,23,(-.185,-.061),(-.007,.018),(.0024,.013)))
    scratches *= coverage*(.65+.35*fibre)
    return dust,rub,scratches


def MetalWear(field, valid, part):
    side,up,length = np.moveaxis(field[:,:,:3],2,0)
    curve = BevelMask(field[:,:,:7],valid,False,False)
    cross = up+.46*side
    stone = GrainNoise(length*122+7,cross*350+5,610)
    fine = GrainNoise(length*230+1,cross*760+4,955)
    if part == PLATE:
        streak = Streaks(length,side,771,38,(-.057,-.008),(-.013,.012),(.003,.017))
        along = Ramp(-.058,-.050,length)*(1-Ramp(-.014,-.006,length))
        patch = np.exp(-((side-.0012-.10*(length+.03))/.0061)**2)*along
        smaller = .70*np.exp(-((side+.0041+.12*(length+.026))/.0039)**2-((length+.026)/.0095)**2)
        patch = np.maximum(patch,smaller)
        patch *= Ramp(.25,.68,.67*stone+.33*fine)*Ramp(.22,.72,field[:,:,4])
        exposure = np.maximum(.90*patch,.76*streak)
        oxide = .36*(1-patch)*Ramp(.25,.83,stone)
    else:
        streak = Streaks(length,cross,209,62,(-.325,-.062),(.016,.070),(.0018,.012))
        exposure = .25*streak*Ramp(.26,.77,fine)
        oxide = .37*Ramp(.18,.82,stone)
    interruptions = .15+.84*Ramp(.35,.69,.35*stone+.65*fine)
    turn = Ramp(.17,.70,np.abs(field[:,:,5]))*(1-Ramp(.86,.98,np.abs(field[:,:,5])))
    edge = np.maximum(curve,.55*turn*Ramp(.11,.34,field[:,:,6]))*interruptions
    return oxide,np.maximum(exposure,.86*edge),streak


def BakeServiceWear(doc, views):
    original = {}
    edits = {}
    parts = set()

    def ImageIndex(info):
        return doc['textures'][info['index']]['source']

    def Load(index):
        if index not in edits:
            image = doc['images'][index]
            with Image.open(io.BytesIO(views[image['bufferView']])) as source:
                original[index] = np.array(source)
            edits[index] = original[index].copy()
        return edits[index]

    for node in doc['nodes']:
        extra = node['extras']
        primitive, = doc['meshes'][node['mesh']]['primitives']
        material = doc['materials'][primitive['material']]
        pbr = material['pbrMetallicRoughness']
        slices = [(row['part'], (row['indexStart'], row['indexCount']))
                  for row in extra.get('SourceRanges', [])] or [(extra['SourceObject'], None)]
        for part, span in slices:
            if part not in WOOD|STEEL and part != DISK:
                continue
            color = Load(ImageIndex(pbr['baseColorTexture']))
            orm = Load(ImageIndex(pbr['metallicRoughnessTexture']))
            size = color.shape[:2][::-1]
            ratio = min(1,1536/max(size))
            grid = tuple(max(1,round(v*ratio)) for v in size)
            field, _, valid = SurfaceAtlas(doc,views,primitive,grid,padding=0,indexSpan=span)
            depth, near = distance_transform_edt(~valid,return_indices=True)
            margin = (~valid)&(depth<=4)

            def Resize(data, image):
                shaped = np.where(valid,data,0)
                shaped[margin] = data[near[0,margin],near[1,margin]]
                return cv2.resize(shaped,image.shape[:2][::-1],interpolation=cv2.INTER_LINEAR)

            if part == DISK:
                normal = Load(ImageIndex(material['normalTexture']))
                radius = np.hypot(field[:,:,0],field[:,:,1]-.0423)
                beads = Ramp(.0028,.0052,radius)*Ramp(.52,.93,field[:,:,5])
                amount = .26*Resize(beads,normal)
                height = np.zeros(normal.shape[:2],dtype=np.float32)
            else:
                wood = part in WOOD
                recipe = WoodWear(field,part) if wood else MetalWear(field,valid,part)
                ageing, rub, cuts = recipe
                shade, worn, marks = [Resize(layer,color) for layer in recipe]
                rgb = color[:,:,:3].astype('f')
                if wood:
                    alloy = cv2.resize(orm[:,:,2].astype('f'),size)
                    timber = 1-Ramp(15,65,alloy)
                    faded = rgb*np.array([.68,.81,.94],dtype='f')
                    bare = np.clip(rgb*.82+[39,32,26],0,255)
                    rgb += ((faded-rgb)*shade[:,:,None]*.81+(bare-rgb)*worn[:,:,None]*.58
                            + marks[:,:,None]*[17.0,13.0,9.0])*timber[:,:,None]
                else:
                    weather = rgb*.88
                    lift = 68 if part==PLATE else 45
                    bare = np.clip(rgb*.76+lift,0,255)
                    rgb += (weather-rgb)*shade[:,:,None]+(bare-rgb)*worn[:,:,None]
                color[:,:,:3] = np.rint(np.clip(rgb,0,255))

                ageing, rub, cuts = [Resize(layer,orm) for layer in recipe]
                solid = (orm[:,:,1]>0).astype('f')
                if wood:
                    timber = (1-Ramp(15,65,orm[:,:,2].astype('f')))*solid
                    delta = (19*ageing+19*cuts-11*rub)*timber
                    coat = material['extensions']['KHR_materials_clearcoat']['clearcoatTexture']
                    varnish = Load(ImageIndex(coat))
                    exposure = Resize(recipe[1],varnish)
                    broken = Resize(recipe[2],varnish)
                    lacquered = (varnish[:,:,0]>0).astype('f')
                    varnish[:,:,0] = np.rint(varnish[:,:,0]*(1-lacquered*(.35*exposure+.36*broken)))
                    varnish[:,:,1] = np.rint(np.clip(varnish[:,:,1]+lacquered*(12*exposure+26*broken),0,255))
                else:
                    delta = (15*ageing-27*rub+6*cuts)*solid
                    orm[:,:,2] = np.rint(np.clip(orm[:,:,2]+7*rub*solid,0,255))
                orm[:,:,1] = np.rint(np.clip(orm[:,:,1]+delta,0,255))
                normalInfo = material.get('normalTexture')
                if normalInfo is None:
                    parts.add(part)
                    continue
                normal = Load(ImageIndex(normalInfo))
                amount = np.zeros(normal.shape[:2],dtype=np.float32)
                height = -.37*Resize(recipe[2],normal)
                if wood:
                    alloy = cv2.resize(orm[:,:,2].astype('f'),normal.shape[:2][::-1])
                    height *= 1-Ramp(15,65,alloy)

            dv,du = np.gradient(gaussian_filter(height,.61))
            changed = (np.abs(du)+np.abs(dv)+amount) > .002
            vectors = normal[changed,:3].astype('f')/127.5-1
            vectors[:,:2] *= 1-amount[changed,None]
            vectors[:,0] -= du[changed]*.68
            vectors[:,1] += dv[changed]*.68
            normal[changed,:3] = np.rint((Unit(vectors)+1)*127.5)
            parts.add(part)

    images = []
    for index,pixels in edits.items():
        if np.array_equal(pixels,original[index]):
            continue
        target = doc['images'][index]
        stream = io.BytesIO()
        Image.fromarray(pixels).save(stream,'PNG',compress_level=6)
        views[target['bufferView']] = stream.getvalue()
        target['mimeType'] = 'image/png'
        images.append(index)
    return {'parts':sorted(parts),'images':sorted(images)}


def FinishServiceWear(repo, doc, views):
    profile = RefineDisk(doc,views)
    ao = BakeRearFinish(repo,doc,views,polishMetal=False,partsFilter=COVER|{
        DISK,PLATE,STOCK,'T38_435F2_IndependentTailNeckExterior',
    })
    result = BakeServiceWear(doc,views)
    result.update(diskOutlineRatio=profile,contactImages=ao['images'])
    doc['asset']['extras']['version'] = 'Type38_ServiceWear30'
    print('Service wear',result,flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc,views,digest = ReadGlb((args.input/'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input/'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input/'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    assert doc['asset']['extras']['version'] == 'Type38_SeatedPlate29'
    manifest['serviceWear'] = FinishServiceWear(repo, doc, views)
    SaveType38Assets(args.output,doc,views,manifest,lod,author=manifest['renderMeshes']==manifest['parts'])
