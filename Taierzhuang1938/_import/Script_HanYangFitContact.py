"""Transfer the new Blender contact bake onto the fitted exterior joins."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

import moderngl
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial import ConvexHull

from Script_HanYang173RDilateTextures import WriteGlb
from Script_HanYangFitCleanup import SEAT, TAIL, VERSION, WOOD
from Script_HanYangMaterialOcclusion import StrengthenVisibility
from Script_HanYangPackContactAtlases import ContactRed
from Script_HanYangWearAndEdges import (
    AtlasImage, Bake, EDGE_FRAGMENT, EDGE_VERTEX, MODEL, PartStreams, ReadAsset, REPORT, Smoothstep,
)


STOCK = 'MainWood_ContinuousLowerShoulder'
COLLAR = 'ReceiverOuterCollar'
JOIN_PARTS = {TAIL, WOOD, SEAT, STOCK, COLLAR}


def Weight(name, points, plate):
    x, y, z = points.T
    if name in (WOOD, SEAT):
        planes = (points[:, [0,2]]@plate[:, :2].T+plate[:, 2]).max(axis=1)
        return (1.-Smoothstep(.00058, .0042, abs(planes)))*Smoothstep(.0543,.0587,y)
    if name==TAIL:
        lead = 1.-Smoothstep(-.118,-.108,z)
        heel = Smoothstep(-.092,-.080,z)*Smoothstep(.0062,.0102,abs(x))
        return np.maximum(lead,heel)
    if name==COLLAR:
        return Smoothstep(-.150,-.125,z)*Smoothstep(.031,.039,y)
    if name==STOCK:
        heel = Smoothstep(-.097,-.082,z)*(1.-Smoothstep(-.062,-.050,z))
        return heel*Smoothstep(.027,.035,y)*(1.-Smoothstep(.0037,.0087,abs(abs(x)-.0106)))
    return np.zeros(len(points),dtype=np.float32)


def Main(stage, bakeDirectory, geometryContact, output):
    assert stage.resolve()!=output.resolve()
    report=json.loads((stage/REPORT).read_text(encoding='utf8'))
    shapeHash=sha256((stage/MODEL).read_bytes()).hexdigest()
    bake=json.loads((bakeDirectory/'Data_ContactAtlasBake.json').read_text(encoding='utf8'))
    assert shapeHash==bake['sourceSha256']==report['gameSha256']
    assert report['exteriorFinish']['version']==VERSION
    assert sha256(geometryContact.read_bytes()).hexdigest()==report['exteriorFinish']['materialOcclusion']['baseSha256']
    oldDoc, oldBlocks=ReadAsset(geometryContact)
    doc,blocks=ReadAsset(stage/MODEL)
    for key in ('images','textures','meshes','nodes'):
        assert oldDoc[key]==doc[key],key
    records={item['name']:item for item in report['texturePayloads']}
    parts=list(PartStreams(doc,blocks,[node for node in doc['nodes'] if 'mesh' in node]))
    seat=next(streams['POSITION'] for node,_,streams,_ in parts if node['name']==SEAT)
    plate=ConvexHull(seat[:, [0,2]]).equations
    slots={slot for node,slot,_,_ in parts if node['name'] in JOIN_PARTS}

    context=moderngl.create_standalone_context()
    program=context.program(vertex_shader=EDGE_VERTEX,fragment_shader=EDGE_FRAGMENT)
    stats={}
    try:
        for slot in sorted(slots):
            material=doc['materials'][slot]
            image=AtlasImage(doc,material['occlusionTexture'])
            view=image['bufferView']
            with Image.open(BytesIO(blocks[view])) as original:
                rgb=np.array(original.convert('RGB'))
            size=rgb.shape[:2][::-1]
            batches=[]
            for node,current,streams,indices in parts:
                if current==slot:
                    weight=Weight(node['name'], streams['POSITION'], plate).astype('<f4')
                    batches.append(({'uv':streams['TEXCOORD_0'],'rounded':weight},indices))
            mask,=Bake(context,program,size,(2,),batches)
            hit=mask[:,:,1]==255
            assert hit.any(),material['name']
            near=distance_transform_edt(~hit,return_distances=False,return_indices=True)
            weight=mask[near[0],near[1],0].astype(np.float32)/255
            if not weight.any():
                continue
            with Image.open(BytesIO(oldBlocks[view])) as imageInput:
                pure=np.asarray(imageInput.convert('RGB'))[:,:,0]
            decoded=np.load(bakeDirectory/bake['atlases'][material['name']]['file'],allow_pickle=False)
            newVisibility=StrengthenVisibility(ContactRed(decoded,*size))
            oldVisibility=StrengthenVisibility(pure)
            base=rgb[:,:,0].astype(np.float32)/255
            micro=np.where(oldVisibility>.011,np.minimum(1.,base/np.maximum(oldVisibility,.011)),1.)
            repaired=newVisibility*micro
            red=np.uint8(np.round(255*np.clip(base+weight*(repaired-base),0,1)))
            difference=int(np.count_nonzero(red!=rgb[:,:,0]))
            rgb[:,:,0]=red
            stream=BytesIO()
            Image.fromarray(rgb).save(stream,'WEBP',lossless=True,method=4)
            content=stream.getvalue()
            assert np.array_equal(np.asarray(Image.open(BytesIO(content)).convert('RGB')),rgb)
            blocks[view]=content
            records[image['name']].update(sha256=sha256(content).hexdigest(),sourceSha256=sha256(rgb.tobytes()).hexdigest())
            stats[image['name']]=difference
    finally:
        program.release()
        context.release()
    report['exteriorFinish']['fitCleanup']['contactMaps']=stats
    output.mkdir(parents=True,exist_ok=True)
    target=output/MODEL
    WriteGlb(target,doc,blocks)
    report['gameSha256']=sha256(target.read_bytes()).hexdigest()
    (output/REPORT).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'contactMaps':stats,'sha256':report['gameSha256']},indent=2))


if __name__=='__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
