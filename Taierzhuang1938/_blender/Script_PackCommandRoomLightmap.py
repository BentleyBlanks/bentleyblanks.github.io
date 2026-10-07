"""Offline xatlas UV1 charting; numpy + xatlas 0.0.11, no runtime dependency."""
import argparse,json
from pathlib import Path
import numpy as np
import xatlas

parser=argparse.ArgumentParser();parser.add_argument('input',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();source=np.load(args.input);names=json.loads(str(source['names']))
atlas=xatlas.Atlas();planar={}
for i,name in enumerate(names):
    vertices=source[f'v{i}'];faces=source[f'f{i}']
    if name=='Room_CommandRoomWallSurface':
        # The relief is a single-valued height field over X/Z. Chart a planar
        # proxy and interpolate its packed UVs onto the full-resolution skin;
        # per-triangle chart growth on 100k nearly planar faces is unnecessary.
        lo=vertices.min(axis=0);hi=vertices.max(axis=0);y=float(vertices[:,1].mean())
        assert hi[1]-lo[1]<.04, 'Wall is no longer a shallow X/Z height field'
        planar[i]=(lo,hi)
        proxy=np.array([[lo[0],y,lo[2]],[hi[0],y,lo[2]],[hi[0],y,hi[2]],[lo[0],y,hi[2]]],dtype=np.float32)
        atlas.add_mesh(proxy,np.array([[0,1,2],[0,2,3]],dtype=np.uint32))
    else:atlas.add_mesh(vertices,faces)
charts=xatlas.ChartOptions();charts.max_iterations=4
pack=xatlas.PackOptions();pack.resolution=2048;pack.padding=3;pack.bilinear=True
atlas.generate(chart_options=charts,pack_options=pack)
assert atlas.atlas_count==1,f'Expected one lightmap, got {atlas.atlas_count}'
result={}
for i,name in enumerate(names):
    mapping,indices,uv=atlas[i]
    if i in planar:
        lo,hi=planar[i];corners=[]
        for vertex in [0,1,2,3]:
            matches=uv[mapping==vertex]
            assert len(matches) and np.allclose(matches,matches[0]), 'Planar wall proxy split into incompatible charts'
            corners.append(matches[0])
        assert np.allclose(corners[2],corners[1]+corners[3]-corners[0],atol=1e-6)
        vertices=source[f'v{i}'];s=(vertices[:,0]-lo[0])/(hi[0]-lo[0]);t=(vertices[:,2]-lo[2])/(hi[2]-lo[2])
        wallUv=corners[0]+s[:,None]*(corners[1]-corners[0])+t[:,None]*(corners[3]-corners[0])
        result[f'uv{i}']=wallUv[source[f'f{i}']].reshape((-1,2))
        continue
    assert np.array_equal(mapping[indices],source[f'f{i}']),f'Triangle order changed: {name}'
    result[f'uv{i}']=uv[indices].reshape((-1,2))
np.savez_compressed(args.output,**result)
print(json.dumps({'charts':atlas.chart_count,'size':[atlas.width,atlas.height],'utilization':atlas.utilization}),flush=True)
