"""Bake CC0 soil scans on the existing Type89 mud footprints."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse
import json

import cv2
import numpy as np
from PIL import Image

from Script_Type89BattleWearGame import Bilinear, Count, Export, Interpolate, Linear, Normalize, Srgb, TrackControls
from Script_Type89BattleWearMasks import Glb, RECIPE, ScreenTriangle, Smooth
from Script_Type89ContactAoPack import Encode
from Script_Type89Sediment import TRACK_CONTROL
from Script_Type89SedimentBake import CopyInputs, PrimitiveData, TrackVariant
from Script_Type89SoilMaterial import BODY_SIZE, Choice, NAMES, PROFILE, PROFILE_TEXT, ROOT, RelocateUv, TILE


GLB = ROOT+'.glb'
CENTRES = ((.21,.25),(.63,.28),(.34,.74),(.80,.66))


def Read(file):
    return json.loads(file.read_text(encoding='utf-8'))


def Mix(a,b,weight):
    return a+(b-a)*weight


def Luma(rgb):
    return rgb @ np.asarray((.2126,.7152,.0722),np.float32)


def CalibratedColor(source,target):
    rgb = Linear(source)
    luminance = np.maximum(.001,Luma(rgb))
    median = np.median(luminance)
    chroma = np.clip(rgb/luminance[:,:,None],.60,1.55)
    chroma /= np.median(chroma,axis=(0,1))
    fine = luminance/np.maximum(.001,cv2.GaussianBlur(luminance,(0,0),2.4))
    contrast = np.clip((luminance/median)**1.23*np.clip(fine,.5,1.6)**.27,.18,2.65)
    return np.clip(contrast[:,:,None]*Linear(target)*(.58+.42*chroma),0,1)


def AsField(source):
    return source.astype(np.float32)/255


def LoadScans(version):
    values = {}
    for key,row in PROFILE['source'].items():
        file = version/'Maps'/'Scan'/row['file']
        assert sha256(file.read_bytes()).hexdigest()==row['sha256'],file
        monochrome = key in ('DampHeight','DampAmbient','DampRoughness')
        values[key] = np.asarray(Image.open(file).convert('L' if monochrome else 'RGB'))
    for key in ('Damp','Dry'):
        values[key+'Base'] = CalibratedColor(values[key+'Base'],PROFILE[key.lower()+'MedianSrgb'])
    return values


def ScanArea(inputs,centre,extent,size=256):
    physical = PROFILE['scanWidthM']
    dimensions = (size,size)
    y,x = np.meshgrid(np.arange(size,dtype=np.float32),np.arange(size,dtype=np.float32),indexing='ij')
    u = centre[0]+((x+.5)/size-.5)*extent[0]/physical
    v = centre[1]+((y+.5)/size-.5)*extent[1]/physical
    result = {}
    for name,image in inputs.items():
        remap = cv2.remap(image,u*image.shape[1]-.5,v*image.shape[0]-.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
        result[name] = remap
    return result,dimensions


def Tile(source,centre,extent,variant,clod):
    maps,(width,height) = ScanArea(source,centre,extent,TILE)
    y,x = np.ogrid[-1:1:complex(height),-1:1:complex(width)]
    radius = np.sqrt((x*.89)**2+(y*.85)**2)
    heightField = AsField(maps['DampHeight'])
    roughScan = AsField(maps['DampRoughness'])
    pockets = AsField(maps['DampAmbient'])
    # The scanned topography stays registered with the pores. Raised grains
    # and worn fracture edges dry sooner than the soil pressed into a seam.
    dry = np.clip(.15+(.43 if clod else .29)*Smooth(.43,1.05,radius)
                  +.34*Smooth(.39,.73,heightField)+(variant-1.5)*.04,0,.92)
    base = Mix(maps['DampBase'],maps['DryBase'],dry[:,:,None])
    rough = Mix(.49+.31*roughScan,.80+.16*roughScan,dry)
    ao = (.72+.28*np.clip(pockets,0,1)**1.25)
    normal = maps['DampNormal'].astype(np.float32)/127.5-1
    # Amplify the scanned angular changes without turning the pores into
    # a broad shadow baked into the base colour.
    normal[:,:,:2] *= (1.10+.50*dry)[:,:,None]
    normal[:,:,2] = np.maximum(.15,normal[:,:,2])
    normals = np.rint((Normalize(normal)+1)*127.5).astype(np.uint8)
    relief = np.stack((rough,ao,heightField),axis=-1)
    return {'Base':Srgb(base),'Normal':normals,
            'Orm':np.rint(np.stack(((.70 if clod else 1)*ao,rough,np.zeros_like(rough)),axis=-1)*255).astype(np.uint8),
            'Control':np.rint(relief*255).astype(np.uint8)}


def ReadMap(model,name):
    image = next(i for i in model.doc['images'] if i['name'].removesuffix('.png')==name)
    return np.array(Image.open(BytesIO(model.Bytes(image['bufferView']))))


def Tiles(orm,model):
    # Keep the original body UVs and chart padding fully outside the new
    # slots, including the constant UV0 patch for the old recess material.
    occupied = np.zeros((BODY_SIZE,BODY_SIZE),np.uint8)
    checked = set()
    for _,_,part,role in model.Geometry():
        if role not in {'Body','Glass'} or part['indices'] in checked:
            continue
        checked.add(part['indices'])
        uv = np.rint(model.Access(part['attributes']['TEXCOORD_0'])*BODY_SIZE*16).astype(np.int32)
        triangles = model.Access(part['indices']).reshape(-1,3)
        for t in triangles:
            cv2.fillConvexPoly(occupied,uv[t],1,lineType=cv2.LINE_8,shift=4)
    occupied = cv2.dilate(occupied,np.ones((25,25),np.uint8))
    occupied |= (orm[:,:,0]!=255)|(orm[:,:,2]!=0)
    result = []
    for _ in CENTRES:
        ii = cv2.integral(occupied)
        window = ii[TILE:,TILE:]+ii[:-TILE,:-TILE]-ii[TILE:,:-TILE]-ii[:-TILE,TILE:]
        possible = np.argwhere(window[24:-24,24:-24]==0)+24
        assert len(possible)
        y,x = (int(v) for v in possible[len(possible)//2])
        occupied[y-12:y+TILE+12,x-12:x+TILE+12]=1
        result.append([x,y,TILE,TILE])
    return result


def Packed(tiles,channel):
    values=[item[channel] for item in tiles]
    return np.concatenate([np.concatenate(values[i:i+2],axis=1) for i in (0,2)])


def TreadSamples(p,table):
    u = (.5+p[:,0]/.350)*TILE-.5
    v = (.5-p[:,1]/.184)*TILE-.5
    return Bilinear(table,u,v)


def TreadPaint(model,source,fields):
    track = TrackControls(source/TRACK_CONTROL)
    old = {name:ReadMap(model,'Texture_Type89GameTrack'+name) for name in NAMES}
    new = {name:value.copy() for name,value in old.items()}
    dimensions = new['Base'].shape[1::-1]
    active = set()
    baked = np.zeros(dimensions[::-1],bool)
    fields = [{**entry,'linear':Linear(entry['Base']),'direction':entry['Normal'].astype(np.float32)/127.5-1,
               'rough':entry['Orm'][:,:,1:2].astype(np.float32)/255} for entry in fields]
    probes = {}
    for node,_,part,role in model.Geometry():
        if role!='Track' or not node['name'].startswith('Mesh_TrackLink') or node['mesh'] in active:
            continue
        active.add(node['mesh'])
        variant = TrackVariant(model,part)
        p,n,t,w = PrimitiveData(model,part)
        uv = model.Access(part['attributes']['TEXCOORD_0'])*dimensions
        packed = fields[variant]
        probes[variant] = 0
        for ids in model.Access(part['indices']).reshape(-1,3):
            samples = ScreenTriangle(uv[ids],dimensions)
            if samples is None:
                continue
            y,x,r,s = samples
            position = Interpolate(p[ids],r,s)
            normal = Normalize(Interpolate(n[ids],r,s))
            coat,_,_ = track.Sample(position,normal,variant)
            cake = Smooth(.16,.77,coat[:,2])
            weight = Smooth(.18,.79,cake)*(1-.36*coat[:,3])
            used = weight>.02
            if not used.any():
                continue
            selected = (y[used],x[used])
            weight = weight[used,None]
            probes[variant] += int(np.count_nonzero(weight>.38))
            baked[selected] = True
            position = position[used]
            ambient = Linear(old['Base'][selected])
            pigment = TreadSamples(position,packed['linear'])
            new['Base'][selected] = Srgb(Mix(ambient,pigment,weight))
            natural = TreadSamples(position,packed['rough'])[:,0]
            original = old['Orm'][selected].astype(np.float32)/255
            original[:,1] = Mix(original[:,1],natural,weight[:,0])
            original[:,2] *= 1-weight[:,0]
            new['Orm'][selected] = np.rint(255*original).astype(np.uint8)
            tangent = Normalize(Interpolate(t[ids],r[used],s[used]))
            bitangent = np.cross(normal[used],tangent)*np.sign(Interpolate(w[ids,None],r[used],s[used]))
            dustNormal = TreadSamples(position,packed['direction'])
            field = np.column_stack((dustNormal[:,:2]/np.maximum(.19,dustNormal[:,2:]),np.zeros(len(position))))
            vectors = old['Normal'][selected].astype(np.float32)/127.5-1
            vectors[:,:2] *= 1-.43*weight
            vectors[:,:2] += .88*weight*np.column_stack(((field*tangent).sum(axis=-1),(field*bitangent).sum(axis=-1)))
            new['Normal'][selected] = np.rint((1+Normalize(vectors))*127.5).astype(np.uint8)
    assert len(active)==4 and np.all(new['Orm'][:,:,0]==old['Orm'][:,:,0])
    return new,probes,int(baked.sum())


def PackMaps(model,before,version):
    CopyInputs(before,version)
    scans = LoadScans(version)
    directory = version/'Game'/'Maps'
    images = version/'Maps'/'High'
    clod = [Tile(scans,c,(.36,.27),index,True) for index,c in enumerate(CENTRES)]
    field = [Tile(scans,c,(.43,.255),index,False) for index,c in enumerate(CENTRES)]
    body = {name:ReadMap(model,'Texture_Type89GameBody'+name) for name in NAMES}
    layout = Tiles(body['Orm'],model)
    for box,values in zip(layout,clod,strict=True):
        x,y,w,h = box
        for name in NAMES:
            body[name][y:y+h,x:x+w] = values[name]
    tread,regions,affected = TreadPaint(model,version/'Maps'/'Controls',field)
    updated = {}
    for group,maps in [('Body',body),('Track',tread)]:
        for channel,image in maps.items():
            name = 'Texture_Type89Game'+group+channel+'.png'
            Image.fromarray(image).save(directory/name,compress_level=4)
            updated[name] = {'sha256':sha256(image.tobytes()).hexdigest(),
                'metallicSha256':sha256(image[:,:,2].tobytes()).hexdigest() if channel=='Orm' else None}
    for group,tiles,channels in [('Clod',clod,NAMES),('Tread',field,('Base','Control'))]:
        for channel in channels:
            Image.fromarray(Packed(tiles,channel)).save(images/('Texture_Type89Soil'+group+channel+'.png'),compress_level=4)
    data = {'schema':'Type89SoilMaterialReviewV1','revision':PROFILE['revision'],
            'baselineSha256':PROFILE['baselineSha256'],'reference':PROFILE['reference'],
            'recipeSha256':sha256(PROFILE_TEXT.encode()).hexdigest(),'clodTiles':layout,
            'trackSoilTexels':affected,'denseTreadTexels':regions,'maps':updated}
    (version/'Review'/'Data_SoilMaterialReview.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(layout,regions,affected,flush=True)


def Runtime(model,version):
    file = version/'Review'/'Data_SoilMaterialReview.json'
    report = Read(file)
    package = Export(model)
    changed = set()
    for image in model.doc['images']:
        name = image['name'].removesuffix('.png')+'.png'
        if name not in report['maps']:
            continue
        view = image['bufferView']
        pixels = np.array(Image.open(version/'Game'/'Maps'/name))
        assert sha256(pixels.tobytes()).hexdigest()==report['maps'][name]['sha256']
        package.buffers[view] = Encode(pixels,image['mimeType'])
        changed.add(view)
    assert len(changed)==6
    layout = report['clodTiles']
    material = next(i for i,mat in enumerate(package.document['materials']) if mat['extras']['Type89Role']=='Body')
    used = {}
    count = 0
    for node in model.doc['nodes']:
        if not node.get('extras',{}).get('battleWearMud'):
            continue
        variant = Choice(node['name'])
        part = package.document['meshes'][node['mesh']]['primitives'][0]
        attrs = part['attributes']
        uv = RelocateUv(model.Access(attrs['TEXCOORD_0']),layout[variant],RECIPE['tracks']['mudTile'])
        attrs['TEXCOORD_0'] = package.Access(uv,'TEXCOORD',2)
        if len(uv) not in used:
            used[len(uv)] = package.Access(np.broadcast_to(np.array([.625,.5],np.float32),(len(uv),2)),'TEXCOORD',2)
        attrs['TEXCOORD_1'] = used[len(uv)]
        part['material'] = material
        part.setdefault('extras',{})['Type89SurfaceRole'] = 'Mud'
        count += 1
    assert count==17
    root = next(node for node in package.document['nodes'] if node['name']==ROOT)
    highHash = sha256((version/'Scene_Type89MediumTankHighPbr.blend').read_bytes()).hexdigest()
    root['extras']['surfaceRevision'] = PROFILE['revision']
    root['extras']['gameBake']['highSourceSha256'] = highHash
    package.document['asset']['extras']['Type89SoilMaterial'] = {
        'revision':PROFILE['revision'],'baselineSha256':PROFILE['baselineSha256'],'reference':PROFILE['reference'],
        'recipeSha256':report['recipeSha256'],'activeMudClods':count,'textureTilePixels':TILE,
        'geometryAndArticulationExact':True}
    output = version/'Game'/'Runtime'/GLB
    output.parent.mkdir(parents=True,exist_ok=True)
    pending = output.with_suffix('.build.glb')
    package.Write(pending)
    actual = Glb(pending)
    assert Count(actual)==Count(model) and Count(actual)['renderedTriangles']==79997
    assert all(actual.doc[key]==model.doc[key] for key in ('materials','textures','scenes'))
    assert all(actual.Bytes(i)==model.Bytes(i) for i in range(len(model.doc['bufferViews'])) if i not in changed)
    assert all(a==b or a['name']==ROOT for a,b in zip(actual.doc['nodes'],model.doc['nodes'],strict=True))
    pending.replace(output)
    report['runtime'] = {**Count(actual),'sha256':sha256(actual.data).hexdigest(),'bytes':len(actual.data),
        'materials':len(actual.doc['materials']),'highSourceSha256':highHash,
        'gameSourceSha256':sha256((version/'Game'/'Scene_Type89MediumTankGamePbr.blend').read_bytes()).hexdigest()}
    file.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(report['runtime'],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('target',type=Path)
    parser.add_argument('stage',choices=('maps','runtime'))
    args=parser.parse_args()
    model=Glb(args.baseline/'Game'/'Runtime'/GLB)
    assert sha256(model.data).hexdigest()==PROFILE['baselineSha256']
    if args.stage=='maps':
        PackMaps(model,args.baseline,args.target)
    else:
        Runtime(model,args.target)
