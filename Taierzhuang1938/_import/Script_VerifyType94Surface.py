"""Check actual GLB material slots against the retained texture masters.

This complements the geometric/export audit: it catches a valid but stale or
misassigned baked map, and checks the exported normal-map strengths.
"""
import argparse,hashlib,io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    study=json.loads(args.manifest.read_text(encoding='utf-8'))
    glb=Path(study['sourceGlb']);payload=glb.read_bytes()
    assert hashlib.sha256(payload).hexdigest()==study['sha256']
    size=struct.unpack_from('<I',payload,12)[0]
    data=json.loads(payload[20:20+size]);binary=payload[28+size:]
    folder=Path(study['sourceBlend']).parent/('Textures/High'+study['revision'])
    bake=json.loads((folder/'Data_PbrBake.json').read_text(encoding='utf-8'))
    channels={(row['role'],row['channel']):Path(row['file'])for row in bake['textures']}
    for channel in ['Base','Orm']:channels['Paint',channel]=Path(study['edgeWear']['outputs'][channel+'Wear']['file'])
    def Pixels(path):return np.array(Image.open(path).convert('RGB'))
    def Embedded(texture):
        image=data['images'][data['textures'][texture['index']]['source']]
        view=data['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
        return Pixels(io.BytesIO(binary[start:start+view['byteLength']]))
    checks=[]
    for role in ['Paint','Track','Rubber','Steel']:
        material=next(m for m in data['materials']if m['name']=='Material_Type94'+role)
        pbr=material['pbrMetallicRoughness']
        for channel,texture in [('Base',pbr['baseColorTexture']),('Orm',pbr['metallicRoughnessTexture']),('Normal',material['normalTexture'])]:
            expected=Pixels(channels[role,channel]);actual=Embedded(texture)
            same=actual.shape==expected.shape and np.array_equal(actual,expected)
            checks.append(dict(check=role+' '+channel+' actual embedded pixels match the retained master',passed=bool(same),size=list(expected.shape[1::-1])))
        scale=material['normalTexture'].get('scale',1.)
        expectedScale=study.get('normalStrengths',{}).get(role,1.)
        checks.append(dict(check=role+' exported normal strength',passed=abs(scale-expectedScale)<1e-6,actual=scale,expected=expectedScale))
        checks.append(dict(check=role+' AO and metal/roughness use the same actual ORM pixels',passed=np.array_equal(Embedded(material['occlusionTexture'])[:,:,0],Embedded(pbr['metallicRoughnessTexture'])[:,:,0])))
    report=dict(sha256=study['sha256'],checks=checks,passed=all(row['passed']for row in checks),scope='Exact exported material bindings and pixels; no reference-fidelity acceptance')
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']]),indent=2))
    if not report['passed']:raise SystemExit(1)


if __name__=='__main__':Main()
