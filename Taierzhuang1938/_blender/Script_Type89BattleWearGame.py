"""Bake the high-source weathering controls into the G55 runtime UVs.

The V16 selected-to-active normal/AO and the full rigid assembly are the
donor. This pass adds only weathering on those UVs and a compact mesh for the largest
mud deposits. Track tile variants share positions, indices, and tangent
buffers, and move with the individual links.
"""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse
import json
import struct

import cv2
import numpy as np
from PIL import Image

from Script_Type89BattleWearMasks import (
    ARMOR_ROLES, DEPTH_SCALE, PIXELS, PROFILE_TEXT, RECIPE, TRACK_VIEW_HALF,
    Glb, Noise, ReadRgb, ScreenTriangle, Shots, Smooth, ToBlender,
)


ROLES = ARMOR_ROLES|{'Glass','Track'}
PAINT_ROLES = {'Armor','CastArmor','Guard'}
PROJECTION = RECIPE['projection']
PALETTE = RECIPE['finish']
CHANNELS = ('Base','Normal','Orm')


def Normalize(vectors):
    return vectors/np.maximum(np.linalg.norm(vectors,axis=-1,keepdims=True),1e-10)


def Interpolate(values,u,v):
    uv = np.stack((u,v),axis=-1)
    return values[0]+uv@(values[1:]-values[0])


def Linear(rgb):
    rgb = np.asarray(rgb,dtype=np.float32)/255
    return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)


def Srgb(color):
    color = np.clip(color,0,1)
    return np.rint(255*np.where(color<=.0031308,color*12.92,1.055*color**(1/2.4)-.055)).astype(np.uint8)


def Bilinear(image, x, y):
    x = np.clip(x,0,image.shape[1]-1.001)
    y = np.clip(y,0,image.shape[0]-1.001)
    left,top = x.astype(int),y.astype(int)
    u,v = (x-left).astype(np.float32)[:,None],(y-top).astype(np.float32)[:,None]
    result = image[top,left]*(1-u)+image[top,left+1]*u
    following = image[top+1,left]*(1-u)+image[top+1,left+1]*u
    return result*(1-v)+following*v


def Gradient(height, metresPerPixelX, metresPerPixelY):
    x = cv2.Sobel(height,cv2.CV_32F,1,0,ksize=3,scale=1/(8*metresPerPixelX))
    y = cv2.Sobel(height,cv2.CV_32F,0,1,ksize=3,scale=-1/(8*metresPerPixelY))
    return x,y


class Projection:
    def __init__(self,shot,controls):
        self.shot = shot
        stem = controls/('Texture_Type89Wear'+shot.name)
        dep,height,dust = np.moveaxis(ReadRgb(stem.with_name(stem.name+'Relief.png')).astype(np.float32)/65535,-1,0)
        finish = ReadRgb(stem.with_name(stem.name+'Finish.png')).astype(np.float32)/65535
        relief = (height-.5)*PROJECTION['heightRangeM']
        right,up = Gradient(relief,1/PIXELS,1/PIXELS)
        self.samples = np.dstack((finish,dust,(dep-.5)/DEPTH_SCALE,relief,right,up))
        self.touched = cv2.integral(np.any(self.samples[:,:,:4]>.003,axis=-1).astype(np.uint8))

    def MayTouch(self, points):
        projection = self.shot.Project(points)
        bounds = np.floor(projection[:,:2].min(axis=0)-2).astype(int),np.ceil(projection[:,:2].max(axis=0)+2).astype(int)
        a,b = np.clip(bounds,(0,0),self.shot.size)
        q = self.touched
        return q[b[1],b[0]]+q[a[1],a[0]]-q[b[1],a[0]]-q[a[1],b[0]] > 0

    def Sample(self, points, normals):
        x,y,z = self.shot.Project(points).T
        array = Bilinear(self.samples,x-.5,y-.5)
        distance = np.abs(z-array[:,4])
        visible = 1-Smooth(PROJECTION['depthBias'],PROJECTION['depthFade'],distance)
        facing = Smooth(PROJECTION['normalStart'],PROJECTION['normalEnd'],normals@self.shot.axis)
        weight = visible*facing
        derivative = array[:,6,None]*self.shot.right+array[:,7,None]*self.shot.up
        return array[:,:4]*weight[:,None], array[:,5]*weight, derivative*weight[:,None]


class TrackControls:
    def __init__(self, file):
        stacked = ReadRgb(file).astype(np.float32)/65535
        size = stacked.shape[0]//2
        self.tile = []
        for variant in range(4):
            a,b = (variant//2)*size,(variant%2)*size
            earth,height,dust = np.moveaxis(stacked[a:a+size,b:b+size],-1,0)
            height = (height-.5)*.017
            right,up = Gradient(height,2*TRACK_VIEW_HALF[0]/size,2*TRACK_VIEW_HALF[1]/size)
            self.tile.append(np.dstack((earth,dust,height,right,up)))

    def Sample(self, points,normals,variant):
        x,y,z = points.T
        nx,_,nz = normals.T
        selected = self.tile[variant]
        size = selected.shape[0]
        u = (x/(2*TRACK_VIEW_HALF[0])+.5)*size-.5
        v = (.5-y/(2*TRACK_VIEW_HALF[1]))*size-.5
        values = Bilinear(selected,u,v)
        land = Smooth(-.008,.023,z)*Smooth(-.19,.61,nz)
        side = Smooth(-.018,.010,z)*.82*Smooth(.36,.79,np.abs(nx))
        weight = np.maximum(land,side)
        result = np.zeros((len(points),4),np.float32)
        result[:,2:] = values[:,:2]*weight[:,None]
        derivative = np.column_stack((values[:,3:5],np.zeros(len(points),np.float32)))*weight[:,None]
        return result,values[:,2]*weight,derivative


class Atlas:
    def __init__(self, inputImages):
        self.image = {channel:array.copy() for channel,array in inputImages.items()}
        self.base = inputImages
        shape = self.image['Base'].shape[:2]
        self.size = shape[::-1]
        self.mapped = np.zeros(shape,np.uint8)
        self.changed = np.zeros(shape,bool)

    def Apply(self,y,x,role,normal,tangent,hand,masks,heights,grad):
        if not len(x):
            return
        self.mapped[y,x] = 1
        if role not in ARMOR_ROLES|{'Track'}:
            return
        if role not in PAINT_ROLES|{'Track'}:
            relevant = (np.max(masks,axis=1)>.002)|(np.abs(heights)>3e-5)
            if not np.any(relevant):
                return
            y,x,normal,tangent,hand,masks,heights,grad = (
                value[relevant] for value in (y,x,normal,tangent,hand,masks,heights,grad))
        base = Linear(self.base['Base'][y,x,:3])
        orm = self.base['Orm'][y,x,:3].astype(np.float32)/255
        if role in PAINT_ROLES:
            paint = PALETTE['paintTint']
            shade = paint['level']+(paint['upward']-paint['level'])*Smooth(.13,.85,normal[:,2])
            paint = Smooth(.012,.065,np.max(base,axis=1))
            base *= (1-(1-shade)*paint)[:,None]
        if role=='Track':
            tint = PALETTE['trackGrime']
            base *= tint['baseMultiplier']
            orm[:,1] = np.maximum(orm[:,1],tint['roughnessFloor'])
        masks[:,0] = 1-(1-masks[:,0])**PROJECTION['sootPower']
        for index,name in [(0,'soot'),(2,'mud'),(3,'dust'),(1,'exposedSteel')]:
            amount = masks[:,index]
            config = PALETTE[name]
            base += (Linear(config['base'])-base)*amount[:,None]
            orm[:,1] += (config['roughness']-orm[:,1])*amount
            if role not in {'Rubber','Exhaust'}:
                orm[:,2] += (config['metallic']-orm[:,2])*amount
        cavity = Smooth(0,.0032,-heights)
        packed = self.image['Orm']
        orm[:,0] *= 1-.23*cavity-.14*masks[:,2]
        packed[y,x,:3] = np.rint(orm*255).astype(np.uint8)
        color = Srgb(base)
        donor = self.base['Base'][y,x,:3]
        darkDonor = donor.max(axis=1)<18
        color[darkDonor] = donor[darkDonor]
        self.image['Base'][y,x,:3] = color
        derivative = np.abs(grad).max(axis=1)>.004
        if np.any(derivative):
            yy,xx,n,t,d = y[derivative],x[derivative],normal[derivative],tangent[derivative],grad[derivative]
            sign = np.sign(hand[derivative])[:,None]
            b = np.cross(n,t)*sign
            dT = (t*d).sum(axis=1)
            dB = (b*d).sum(axis=1)
            old = self.base['Normal'][yy,xx,:3].astype(np.float32)/127.5-1
            old[:,:2] -= np.column_stack((dT,dB))*.82
            self.image['Normal'][yy,xx,:3] = np.rint((Normalize(old)*.5+.5)*255).astype(np.uint8)
        self.changed[y,x] = True

    def Pad(self):
        # Fill at most two texels of existing gutter. Never displace an
        # adjacent shell, any alpha texel or interior AO outside the bake.
        margins = ((0,1),(1,0),(0,-1),(-1,0))
        source = self.changed
        free = self.mapped==0
        for _ in range(2):
            found = np.zeros_like(free)
            for dy,dx in margins:
                shifted = np.roll(source,(dy,dx),axis=(0,1))
                moved = free&shifted&~found
                if dy:
                    moved[0 if dy>0 else -1,:] = False
                if dx:
                    moved[:,0 if dx>0 else -1] = False
                y,x = np.where(moved)
                for pixels in self.image.values():
                    pixels[y,x,:3] = pixels[y-dy,x-dx,:3]
                found |= moved
            free &= ~found
            source = found

    def Save(self, files):
        self.Pad()
        for channel,output in files.items():
            Image.fromarray(self.image[channel]).save(output, compress_level=4)


def Textures(model):
    maps,indices = {},{}
    for index,image in enumerate(model.doc['images']):
        key = image['name'].removeprefix('Texture_Type89Game').removesuffix('.png')
        atlas = next(group for group in ('Body','Guard','Track') if key.startswith(group))
        channel = key[len(atlas):]
        content = model.Bytes(image['bufferView'])
        maps.setdefault(atlas,{})[channel] = np.array(Image.open(BytesIO(content)))
        indices[index] = (atlas,channel)
    return maps,indices


def Parts(model,group):
    for node,world,primitive,role in model.Geometry():
        if group=='Track' and node['name']!='Mesh_TrackLinkLeft000':
            continue
        if (group=='Track')!=(role=='Track') or (group=='Guard')!=(role=='Guard') or role not in ROLES:
            continue
        attributes = primitive['attributes']
        transform = world[:3,:3]
        offset = world[:3,3]
        if role=='Track':
            transform = np.eye(3,dtype=np.float32)
            offset = 0
        positions = ToBlender(model.Access(attributes['POSITION'])@transform.T+offset)
        normals = ToBlender(model.Access(attributes['NORMAL'])@transform.T)
        tangents = model.Access(attributes['TANGENT'])
        tangent = ToBlender(tangents[:,:3]@transform.T)
        uv = model.Access(attributes['TEXCOORD_0'])
        indices = model.Access(primitive['indices']).reshape(-1,3)
        yield node['name'],role,positions,normals,tangent,tangents[:,3:4],uv,indices


def Bake(inputAtlas,parts,projections,track=None,variant=None):
    atlas = Atlas(inputAtlas)
    for name,role,positions,normals,tangents,hands,uv,indices in parts:
        if role in ARMOR_ROLES:
            visible = [projection for projection in projections if projection.MayTouch(positions)]
        else:
            visible = []
        for ids in indices:
            sample = ScreenTriangle(uv[ids]*atlas.size,atlas.size)
            if sample is None:
                continue
            y,x,u,v = sample
            atlas.mapped[y,x] = 1
            if name=='Mesh_BowRoundPortCover' or (role not in PAINT_ROLES|{'Track'} and not visible):
                continue
            normal = Normalize(Interpolate(normals[ids],u,v))
            tangent = Normalize(Interpolate(tangents[ids],u,v))
            hand = Interpolate(hands[ids],u,v)[:,0]
            points = Interpolate(positions[ids],u,v)
            if role=='Track':
                masks,height,derivative = track.Sample(points,normal,variant)
            else:
                masks = np.zeros((len(y),4),np.float32)
                height = np.zeros(len(y),np.float32)
                derivative = np.zeros((len(y),3),np.float32)
                for projection in visible:
                    # Avoid sampling zero masks across the whole body atlas.
                    if projection.MayTouch(positions[ids]):
                        coat,relief,slope = projection.Sample(points,normal)
                        masks = np.maximum(masks,coat)
                        height += relief
                        derivative += slope
            atlas.Apply(y,x,role,normal,tangent,hand,masks,height,derivative)
    print('Baked',atlas.size, 'variant',variant,'in-place mapped PBR texels',int(atlas.changed.sum()),flush=True)
    return atlas


def OutputMaps(version, group):
    return {channel:version/'Game'/'Maps'/('Texture_Type89Game'+group+channel+'.png') for channel in CHANNELS}


def EarthTile(images,busy):
    recipe = RECIPE['tracks']['mudTile']
    x,y = recipe['offsetPixels']
    half = recipe['halfSizePixels']
    clip = np.s_[y-half-4:y+half+4,x-half-4:x+half+4]
    assert not busy[clip].any(), 'Clod swatch must be clear of all tread UV islands'
    side = half*2+8
    irregular = Noise((side,side),557)
    noise = np.random.default_rng(1887).normal(0,.04,(side,side)).astype(np.float32)
    elevation = cv2.GaussianBlur(irregular,(3,3),.9)+noise
    components = np.array([41,29,22])+elevation[:,:,None]*np.array([39,32,27])
    normalX,normalY = Gradient(elevation*.0025,.0036,.0036)
    normal = Normalize(np.dstack((-normalX,-normalY,np.ones_like(irregular))))
    images['Base'][clip] = np.rint(components).astype(np.uint8)
    images['Normal'][clip] = np.rint((normal*.5+.5)*255).astype(np.uint8)
    images['Orm'][clip] = np.stack((np.full_like(irregular,178),246+elevation*12,4+irregular*3),axis=-1).astype(np.uint8)


def TrackAtlases(model,inputAtlas,controls,version):
    size = PROJECTION['trackTileSize']
    target = size*2
    assert target==RECIPE['tracks']['mudTile']['dimensionsPixels']
    result = {name:np.zeros((target,target,3),np.uint8) for name in CHANNELS}
    busy = np.zeros((target,target),bool)
    track = TrackControls(controls/'Texture_Type89TrackEarthControls.png')
    for variant in range(4):
        tile = Bake(inputAtlas, Parts(model,'Track'),[],track,variant)
        row,column = (variant//2)*size,(variant%2)*size
        selection = np.s_[row:row+size,column:column+size]
        tile.Pad()
        for name in CHANNELS:
            result[name][selection] = tile.image[name][:,:,:3]
        busy[selection] = cv2.dilate(tile.mapped,np.ones((9,9),np.uint8)).astype(bool)
    EarthTile(result,busy)
    for name,file in OutputMaps(version,'Track').items():
        Image.fromarray(result[name]).save(file,compress_level=4)


def RuntimeClods(rows):
    # The clay rides all the way around the original wheel path. Preserve the
    # footprint and fit the raised vertices below the inner front fender.
    outerLimit = .042
    prepared = deepcopy(rows)
    for row in prepared:
        if not row['parent'].startswith('Mesh_TrackLink'):
            continue
        vertices = np.asarray(row['vertices'])
        peak = np.max(vertices[:,2])
        if peak<=outerLimit:
            continue
        level = row['centre'][2]
        ratio = (outerLimit-level)/(peak-level)
        raised = vertices[:,2]>level
        vertices[raised,2] = level+(vertices[raised,2]-level)*ratio
        row['vertices'] = vertices.tolist()
    return prepared


class Export:
    def __init__(self, model):
        self.document = deepcopy(model.doc)
        self.buffers = [model.Bytes(i) for i in range(len(model.doc['bufferViews']))]

    def Access(self,values,attribute,length):
        array = np.ascontiguousarray(values,dtype='<u2' if length==1 else '<f4')
        payload = array.tobytes()
        views = self.document['bufferViews']
        index = len(views)
        views.append(dict(buffer=0,byteLength=len(payload),target=34963 if length==1 else 34962))
        self.buffers.append(payload)
        value = {'bufferView':index,'componentType':5123 if length==1 else 5126,
                 'count':len(array),'type':'SCALAR' if length==1 else 'VEC'+str(length)}
        if attribute=='POSITION':
            value.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
        accessors = self.document['accessors']
        accessors.append(value)
        return len(accessors)-1

    def Images(self, replaced,version):
        for index,(group,channel) in replaced.items():
            image = self.document['images'][index]
            self.buffers[image['bufferView']] = OutputMaps(version,group)[channel].read_bytes()
            image['mimeType'] = 'image/png'
        for texture in self.document['textures']:
            extension = texture.get('extensions',{})
            if 'EXT_texture_webp' in extension:
                texture['source'] = extension.pop('EXT_texture_webp')['source']
                if not extension:
                    texture.pop('extensions')
        for key in ('extensionsUsed','extensionsRequired'):
            if key in self.document:
                self.document[key] = [extension for extension in self.document[key] if extension!='EXT_texture_webp']

    def BakeShoeVariants(self, model, variants):
        nodes,meshes = self.document['nodes'],self.document['meshes']
        base = next(node['mesh'] for node in nodes if node['name']=='Mesh_TrackLinkLeft000')
        mesh = deepcopy(meshes[base])
        source = mesh['primitives'][0]['attributes']['TEXCOORD_0']
        uv = model.Access(source)*.5
        ids = []
        for variant in range(4):
            copy = deepcopy(mesh)
            copy['name'] = 'Type89TrackShoeEarth'+str(variant)
            offset = np.array((variant%2,variant//2),np.float32)*.5
            copy['primitives'][0]['attributes']['TEXCOORD_0'] = self.Access(uv+offset,'TEXCOORD_0',2)
            if variant==0:
                meshes[base] = copy
                ids.append(base)
            else:
                ids.append(len(meshes))
                meshes.append(copy)
        assert len(variants)==162
        for node in nodes:
            name = node['name']
            if name in variants:
                assert node['mesh']==base
                node['mesh'] = ids[variants[name]]
        return mesh['primitives'][0]['material']

    def AddClods(self, rows,material):
        nodes,meshes = self.document['nodes'],self.document['meshes']
        byName = {node['name']:node for node in nodes}
        recipe = RECIPE['tracks']['mudTile']
        for row in rows:
            vertices = np.array(row['vertices'],np.float32)
            faces = np.array(row['faces'],np.uint16)
            cross = np.cross(vertices[faces[:,1]]-vertices[faces[:,0]],vertices[faces[:,2]]-vertices[faces[:,0]])
            normals = np.zeros_like(vertices)
            for i in range(3):
                np.add.at(normals,faces[:,i],cross)
            normals = Normalize(normals)
            direction = np.asarray(row.get('tangent',[1,0,0]),np.float32)
            tangent = Normalize(direction-normals*(normals@direction)[:,None])
            directions = np.array([1,1,-1],np.float32)
            def ToGame(values):
                return values[:,[0,2,1]]*directions
            planar = row.get('planar', vertices[:,:2]-np.asarray(row['centre'][:2]))
            local = np.asarray(planar)/np.asarray(row['radii'][:2])/1.29
            pixels = np.array(recipe['offsetPixels']) + local*np.array([1,-1])*recipe['halfSizePixels']
            uv = pixels/recipe['dimensionsPixels']
            attrs = {
                'POSITION':self.Access(ToGame(vertices),'POSITION',3),
                'NORMAL':self.Access(ToGame(normals),'NORMAL',3),
                'TANGENT':self.Access(np.column_stack((ToGame(tangent),-np.ones(len(tangent),np.float32))),'TANGENT',4),
                'TEXCOORD_0':self.Access(uv,'TEXCOORD_0',2),
            }
            mesh = {'primitives':[dict(attributes=attrs,material=material,
                indices=self.Access(faces.ravel(),'indices',1))],'name':row['name']}
            byName[row['parent']].setdefault('children',[]).append(len(nodes))
            nodes.append({'name':row['name'],'mesh':len(meshes),'extras':{'battleWearMud':True}})
            meshes.append(mesh)

    def Write(self, path):
        offset = 0
        chunks = []
        for view,original in zip(self.document['bufferViews'],self.buffers,strict=True):
            view.update(byteOffset=offset,byteLength=len(original))
            raw = bytes(original)+b'\0'*((-len(original))%4)
            chunks.append(raw)
            offset += len(raw)
        self.document['buffers'][0]['byteLength'] = offset
        jsonBytes = json.dumps(self.document,separators=(',',':'),ensure_ascii=True).encode()
        jsonBytes += b' '*((-len(jsonBytes))%4)
        header = struct.pack('<4sIIII',b'glTF',2,28+len(jsonBytes)+offset,len(jsonBytes),0x4e4f534a)
        with path.open('wb') as stream:
            stream.write(header)
            stream.write(jsonBytes)
            stream.write(struct.pack('<II',offset,0x004e4942))
            stream.writelines(chunks)


def Count(model):
    nodes = meshes = triangles = 0
    for _,node,_ in model.Nodes():
        nodes += 1
        if 'mesh' in node:
            meshes += 1
            for primitive in model.doc['meshes'][node['mesh']]['primitives']:
                triangles += model.doc['accessors'][primitive['indices']]['count']//3
    return dict(nodes=nodes,meshInstances=meshes,renderedTriangles=triangles)


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('version',type=Path)
    parser.add_argument('--pack-only',action='store_true')
    args = parser.parse_args()
    version = args.version
    controls = version/'Maps'/'Controls'
    high = version/'Scene_Type89MediumTankHighPbr.blend'
    geometry = json.loads((version/'Data_BattleWearGeometry.json').read_text(encoding='utf-8'))
    model = Glb(args.baseline)
    assert sha256(model.data).hexdigest()==RECIPE['baselineRuntimeSha256']
    if not args.pack_only:
        source,_ = Textures(model)
        (version/'Game'/'Maps').mkdir(parents=True,exist_ok=True)
        projections = [Projection(shot,controls) for shot in Shots()]
        for group in ('Body','Guard'):
            atlas = Bake(source[group], Parts(model,group),projections)
            atlas.Save(OutputMaps(version,group))
        TrackAtlases(model,source['Track'],controls,version)
    output = version/'Game'/'Runtime'
    output.mkdir(parents=True,exist_ok=True)
    rawFile = output/'Model_Type89MediumTank.glb'
    _,images = Textures(model)
    destination = Export(model)
    destination.Images(images,version)
    trackRole = destination.BakeShoeVariants(model,geometry['trackVariants'])
    deposits = RuntimeClods(geometry['heroClods'])
    destination.AddClods(deposits,trackRole)
    runtimeGeometry = {'trackVariants':geometry['trackVariants'],'heroClods':deposits}
    (version/'Game'/'Data_BattleWearRuntimeGeometry.json').write_text(
        json.dumps(runtimeGeometry,indent=2)+'\n',encoding='utf-8')
    root = next(node for node in destination.document['nodes'] if node['name']=='Model_Type89MediumTank')
    finish = {'revision':RECIPE['revision'],'reference':RECIPE['referenceEdition'],
              'materialRecipeSha256':sha256(PROFILE_TEXT.encode()).hexdigest(),
              'baselineRuntimeSha256':RECIPE['baselineRuntimeSha256'],
              'highSourceSha256':sha256(high.read_bytes()).hexdigest(),
              'addedMudTriangles':geometry['gameClodTriangles'],
              'trackTiles':4}
    root['extras'].update(surfaceRevision=RECIPE['revision'],battleWearReference=RECIPE['referenceEdition'])
    root['extras']['gameBake']['highSourceSha256'] = finish['highSourceSha256']
    root['extras']['gameBake']['weathering'] = 'V6 projected soot, shallow impact relief, rough soil and link-local and hull-local dimensional clods.'
    destination.document['asset']['extras']['Type89BattleWear'] = finish
    destination.Write(rawFile)
    count = Count(Glb(rawFile))
    base = Count(model)
    assert count['renderedTriangles']==base['renderedTriangles']+geometry['gameClodTriangles']<=80000, count
    assert count['meshInstances']==base['meshInstances']+len(geometry['heroClods'])
    summary = {**finish,**count,'baselineRenderedTriangles':base['renderedTriangles'],
               'textureSizes':{'Body':4096,'Guard':1024,'Track':2048},
               'highTrackFragments':geometry['highTrackFragments'],
               'highHullClods':geometry['highHullClods']}
    (version/'Data_BattleWearBake.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary),flush=True)


if __name__=='__main__':
    Main()
