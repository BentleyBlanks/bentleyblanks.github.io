"""Offline xatlas UV1 charting; numpy + xatlas 0.0.11, no runtime dependency."""
import argparse,json
from pathlib import Path
import numpy as np
import xatlas

parser=argparse.ArgumentParser();parser.add_argument('input',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();source=np.load(args.input);names=json.loads(str(source['names']))
atlas=xatlas.Atlas()
for i,name in enumerate(names):atlas.add_mesh(source[f'v{i}'],source[f'f{i}'])
charts=xatlas.ChartOptions();charts.max_iterations=4
pack=xatlas.PackOptions();pack.resolution=2048;pack.padding=3;pack.bilinear=True
atlas.generate(chart_options=charts,pack_options=pack)
assert atlas.atlas_count==1,f'Expected one lightmap, got {atlas.atlas_count}'
result={}
for i,name in enumerate(names):
    mapping,indices,uv=atlas[i]
    assert np.array_equal(mapping[indices],source[f'f{i}']),f'Triangle order changed: {name}'
    result[f'uv{i}']=uv[indices].reshape((-1,2))
np.savez_compressed(args.output,**result)
print(json.dumps({'charts':atlas.chart_count,'size':[atlas.width,atlas.height],'utilization':atlas.utilization}),flush=True)
