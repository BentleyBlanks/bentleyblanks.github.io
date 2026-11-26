"""Pack the Type38 game meshes and their authored PBR charts by animation group."""
import copy
import io
import json
import subprocess

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation


MARGIN = 24
GUTTER = 16
ATLAS_LIMIT = 4096
PUBLISH_LIMIT = 2048
FRAME_LOD = 'Exterior_FoldedFrame12'
SHARED_CHART_HOST = 'T38_430B_ContinuousLowerFacing_VisualOnly'
PUBLISH_FILE = 'Taierzhuang1938/Data_PublishPathRules.json'
PUBLISH_ATLAS_PREFIX = 'Taierzhuang1938/Model/Type38_511/Model_Type38_511.glb#image/'
SOURCE_PUBLISH_REVISION = 'cbccafedb'


def Slots(material):
    for key,value in material.items():
        if not isinstance(value,dict):
            continue
        if key.endswith('Texture') and 'index' in value:
            yield key,value
        else:
            yield from Slots(value)


def RoleMap(repo):
    source = repo/'Taierzhuang1938/Data_Type38_511.mjs'
    command = 'import {pathToFileURL} from "node:url";const {TYPE38_511:d}=await import(pathToFileURL(process.argv[1]));console.log(JSON.stringify(d));'
    data = json.loads(subprocess.check_output(['node','--input-type=module','-e',command,str(source)],cwd=repo))
    return {**{name:role for group,role in (
        ('bolt','Bolt'),('dustCover','Cover'),('frontSight','FrontSight'),('rearSight','RearSight'),('wood','Wood')
    ) for name in data[group]},data['trigger']:'Trigger'}


def SourcePublishRules(repo):
    # Read the last unpacked rules. Current image indices address the atlases.
    raw = subprocess.check_output(['git','show',f'{SOURCE_PUBLISH_REVISION}:{PUBLISH_FILE}'],cwd=repo)
    return {int(rule['path'][len(PUBLISH_ATLAS_PREFIX):]):rule for rule in json.loads(raw)['rules']
            if rule['path'].startswith(PUBLISH_ATLAS_PREFIX)}


def UpdateType38PublishRules(repo, imageRules):
    sourceRules = SourcePublishRules(repo)
    records = []
    for index, entry in enumerate(imageRules):
        rule = sourceRules.get(entry['source']) if 'source' in entry else entry
        if rule:
            output = {'path': PUBLISH_ATLAS_PREFIX+str(index)}
            output.update({key:value for key,value in rule.items() if key!='path'})
            records.append('    { '+json.dumps(output,ensure_ascii=False)[1:-1]+' },')
    file = repo/PUBLISH_FILE
    lines = file.read_text(encoding='utf8').splitlines()
    first = next(i for i, line in enumerate(lines) if PUBLISH_ATLAS_PREFIX in line)
    updated = lines[:first]+records+[line for line in lines[first:] if PUBLISH_ATLAS_PREFIX not in line]
    content = '\n'.join(updated)+'\n'
    json.loads(content)
    if content != '\n'.join(lines)+'\n':
        file.write_text(content,encoding='utf8')


def Layout(entries):
    """Choose a small, block-aligned shelf atlas at the input texel density."""
    boxes = sorted(entries,key=lambda item:(-item['crop'][3],-item['crop'][2],item['serial']))
    scales = boxes[0]['scales']
    padForResize = min(scales)<1
    sizeLimit = min(ATLAS_LIMIT,int(PUBLISH_LIMIT/max(scales)))
    plans = []
    minimum = max(item['crop'][2]+2*GUTTER for item in boxes)
    widths = {0}
    for box in boxes:
        outerWidth = box['crop'][2]+2*GUTTER
        widths.update({width+outerWidth for width in widths if width+outerWidth<=sizeLimit})
    for limit in sorted(widths):
        if limit<minimum:
            continue
        shelves = []
        origins = {}
        for item in boxes:
            width,height = np.array(item['crop'][2:])+2*GUTTER
            shelf = next((s for s in shelves if s[0]+width<=limit and height<=s[1]),None)
            if shelf is None:
                shelf = [0,height,sum(s[1] for s in shelves)]
                shelves.append(shelf)
            origins[item['serial']] = [int(shelf[0]+GUTTER),int(shelf[2]+GUTTER)]
            shelf[0] += width
        width = int((max(s[0] for s in shelves)+3)//4*4)
        height = int((sum(s[1] for s in shelves)+3)//4*4)
        if padForResize:
            # The publisher accepts power-of-two ceilings. Include resize padding
            # in the area comparison so narrow layouts do not win on empty space.
            if width>=height:
                width = 1<<(width-1).bit_length()
            else:
                height = 1<<(height-1).bit_length()
        if max(width,height)<=sizeLimit:
            plans.append((width*height,max(width,height),width,height,origins))
    return min(plans,key=lambda p:p[:4])[2:] if plans else None


def PackType38(doc, views, repo):
    roles = RoleMap(repo)
    sourceRules = SourcePublishRules(repo)
    roots = doc['scenes'][doc['scene']]['nodes']
    assert len(roots)==len(doc['nodes']) and not any('children' in n for n in doc['nodes'])
    packed = {key:[] for key in ('nodes','meshes','materials','textures','images','accessors','bufferViews')}
    packed.update(asset=copy.deepcopy(doc['asset']),extensionsUsed=doc.get('extensionsUsed',[]),
                  scene=0,scenes=[dict(name='Scene',nodes=[])],samplers=doc['samplers'],buffers=[dict(byteLength=0)])
    payload = []
    sourceImages = {}
    sourceTextures = {}
    imageRules = []
    decoded = {}
    groups = {}

    def Blob(image):
        return views[doc['images'][image]['bufferView']]

    def Raster(image):
        if image not in decoded:
            decoded[image] = Image.open(io.BytesIO(Blob(image)))
        return decoded[image]

    def Array(index):
        accessor = doc['accessors'][index]
        width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        kind = {5123:'<u2',5125:'<u4',5126:'<f4'}[accessor['componentType']]
        return np.frombuffer(views[accessor['bufferView']],dtype=kind).reshape(-1,width)

    def View(blob, target=None):
        slot = len(payload)
        payload.append(blob)
        item = dict(buffer=0,byteLength=len(blob))
        if target:
            item['target'] = target
        packed['bufferViews'].append(item)
        return slot

    def ImageSlot(blob,name,mime,rule):
        image = len(packed['images'])
        packed['images'].append(dict(name=name,mimeType=mime,bufferView=View(blob)))
        imageRules.append(rule)
        return image

    def CopyTexture(index):
        if index not in sourceTextures:
            texture = doc['textures'][index]
            image = texture['source']
            if image not in sourceImages:
                source = doc['images'][image]
                sourceImages[image] = ImageSlot(Blob(image),source['name'],source['mimeType'],dict(source=image))
            sourceTextures[index] = len(packed['textures'])
            packed['textures'].append({**texture,'source':sourceImages[image]})
        return sourceTextures[index]

    def Accessor(data, ref, index=False):
        value = copy.deepcopy(ref)
        if index:
            value['componentType'] = 5123 if data.max()<=65535 else 5125
            data = data.astype('<u2' if value['componentType']==5123 else '<u4')
        else:
            data = data.astype('<f4')
        value['count'] = len(data)
        value['bufferView'] = View(data.tobytes(),34963 if index else 34962)
        for key,stat in (('min',np.min),('max',np.max)):
            if key in value:
                value[key] = stat(data,axis=0).tolist()
        slot = len(packed['accessors'])
        packed['accessors'].append(value)
        return slot

    for serial in roots:
        node = doc['nodes'][serial]
        part = node['extras']['SourceObject']
        primitive, = doc['meshes'][node['mesh']]['primitives']
        material = doc['materials'][primitive['material']]
        rule = copy.deepcopy(material)
        rule.pop('name',None)
        textures = [doc['textures'][slot['index']] for _,slot in Slots(material)]
        dimensions = {Raster(t['source']).size for t in textures}
        compatible = part not in (FRAME_LOD,SHARED_CHART_HOST) and len(dimensions)==1 and all(
            slot.get('texCoord',0)==0 and not slot.get('extensions') for _,slot in Slots(material))
        for _,slot in Slots(rule):
            slot['index'] = doc['textures'][slot['index']].get('sampler',-1)
        role = roles.get(part,'Body')
        uv = Array(primitive['attributes']['TEXCOORD_0'])
        entry = dict(serial=serial,part=part,node=node,primitive=primitive,material=material,role=role)
        if compatible and uv.min()>=0 and uv.max()<=1:
            size, = dimensions
            lo = np.maximum(0,np.floor(uv.min(axis=0)*size).astype(int)-MARGIN)
            hi = np.minimum(size,np.ceil(uv.max(axis=0)*size).astype(int)+MARGIN)
            scales = tuple(min(1,sourceRules.get(t['source'],{}).get('maxSize',2048)/max(size)) for t in textures)
            entry.update(size=size,crop=[int(x) for x in np.r_[lo,hi-lo]],scales=scales)
            key = (role,tuple(sorted(primitive['attributes'])),json.dumps(rule,sort_keys=True),scales)
        else:
            key = (part,)
        groups.setdefault(key,[]).append(entry)

    def WriteBatch(entries):
        role = entries[0]['role']
        multi = len(entries)>1
        part = entries[0]['part']
        label = f'Type38_{role}Batch{len(packed["nodes"])+1:02d}' if multi else part
        material = copy.deepcopy(entries[0]['material'])
        material['name'] = label
        equal = all([(key,slot['index']) for key,slot in Slots(entry['material'])]==
                    [(key,slot['index']) for key,slot in Slots(entries[0]['material'])] for entry in entries)
        tiles = {}
        if equal:
            for _,slot in Slots(material):
                slot['index'] = CopyTexture(slot['index'])
        else:
            width,height,origins = Layout(entries)
            reused = {}
            for order,(channel,slot) in enumerate(Slots(material)):
                incoming = [list(Slots(entry['material']))[order][1] for entry in entries]
                signature = tuple(item['index'] for item in incoming)
                if signature in reused:
                    slot['index'] = reused[signature]
                    continue
                sources = [Raster(doc['textures'][item['index']]['source']) for item in incoming]
                mode = 'RGBA' if any(src.mode=='RGBA' for src in sources) else 'RGB'
                atlas = Image.new(mode,(width,height))
                for entry,image in zip(entries,sources,strict=True):
                    left,top,w,h = entry['crop']
                    x,y = origins[entry['serial']]
                    cut = image.convert(mode).crop((left,top,left+w,top+h))
                    block = np.pad(np.asarray(cut),((GUTTER,GUTTER),(GUTTER,GUTTER),(0,0)),mode='edge')
                    atlas.paste(Image.fromarray(block),(x-GUTTER,y-GUTTER))
                    tiles[entry['serial']] = dict(sourceSize=entry['size'],sourceRect=entry['crop'],
                                                 atlasOrigin=[x,y],atlasSize=[width,height])
                stream = io.BytesIO()
                atlas.save(stream,'PNG',compress_level=6)
                maximum = min(PUBLISH_LIMIT,max(256,int((1<<(max(width,height)-1).bit_length())*entries[0]['scales'][order])))
                encoding = 'ktx2-bc7'
                if mode=='RGBA' and channel not in ('baseColorTexture','emissiveTexture','specularColorTexture'):
                    values = np.asarray(atlas)
                    if np.any((values[:,:,3]==0)&np.any(values[:,:,:3]!=0,axis=2)):
                        encoding = 'png'
                image = ImageSlot(stream.getvalue(),f'Texture_{label}_{channel}','image/png',
                                  dict(format=encoding,maxSize=maximum))
                sampler = doc['textures'][slot['index']].get('sampler')
                slot['index'] = len(packed['textures'])
                reused[signature] = slot['index']
                packed['textures'].append(dict(source=image,**({'sampler':sampler} if sampler is not None else {})))
        mat = len(packed['materials'])
        packed['materials'].append(material)
        reference = entries[0]['primitive']
        vertices = {key:[] for key in reference['attributes']}
        indices = []
        sections = []
        vertexStart = indexStart = 0
        for entry in entries:
            old = entry['primitive']
            pose = entry['node']
            values = {key:Array(index).copy() for key,index in old['attributes'].items()}
            if multi:
                assert 'matrix' not in pose and 'scale' not in pose
                if 'rotation' in pose:
                    rot = Rotation.from_quat(pose['rotation']).as_matrix().T
                    for key in ('POSITION','NORMAL','TANGENT'):
                        if key in values:
                            values[key][:,:3] = values[key][:,:3]@rot
                if 'translation' in pose:
                    values['POSITION'] += np.asarray(pose['translation'],dtype='f')
            tile = tiles.get(entry['serial'])
            if tile:
                orig = np.asarray(tile['sourceSize'])
                rect = np.asarray(tile['sourceRect'][:2])
                values['TEXCOORD_0'][:] = (values['TEXCOORD_0']*orig-rect+tile['atlasOrigin'])/tile['atlasSize']
            face = Array(old['indices']).astype(np.uint32)+vertexStart
            count = len(values['POSITION'])
            mask = dict(part=entry['part'],vertexStart=vertexStart,vertexCount=count,indexStart=indexStart,indexCount=len(face))
            if tile:
                mask['tile'] = tile
            sections.append(mask)
            for key,array in values.items():
                vertices[key].append(array)
            indices.append(face)
            vertexStart += count
            indexStart += len(face)
        attrs = {key:Accessor(np.concatenate(items),doc['accessors'][reference['attributes'][key]])
                 for key,items in vertices.items()}
        elements = Accessor(np.concatenate(indices),doc['accessors'][reference['indices']],index=True)
        mesh = len(packed['meshes'])
        packed['meshes'].append(dict(name=label,primitives=[dict(attributes=attrs,indices=elements,material=mat)]))
        if multi:
            node = dict(name=label,mesh=mesh,extras=dict(SourceObject=label,SourceRanges=sections))
        else:
            node = {**entries[0]['node'],'mesh':mesh}
        packed['scenes'][0]['nodes'].append(len(packed['nodes']))
        packed['nodes'].append(node)

    for entries in groups.values():
        cohort = []
        for entry in entries:
            if cohort and not Layout([*cohort,entry]):
                WriteBatch(cohort)
                cohort = []
            cohort.append(entry)
        WriteBatch(cohort)
    packed['asset']['extras'].update(renderMeshes=len(packed['meshes']),sourceParts=len(roots))
    return packed,payload,imageRules
