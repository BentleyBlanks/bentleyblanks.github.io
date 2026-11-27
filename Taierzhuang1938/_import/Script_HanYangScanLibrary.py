"""Fetch the declared CC0 material inputs and verify every source payload."""
import concurrent.futures
import hashlib
import io
import json
import os
import time
from pathlib import Path

definitions = {
    'black_walnut_veneer_02': ['Diffuse', 'Rough', 'nor_gl', 'Displacement'],
    'metal_plate_02': ['Diffuse', 'Rough', 'nor_gl', 'Metal'],
    'fine_grained_wood': ['Diffuse', 'Rough', 'nor_gl'],
    'rusty_metal_04': ['Diffuse', 'Rough', 'nor_gl', 'Metal', 'Displacement'],
}


def OpenScan(library, source):
    from PIL import Image

    content = (library / source['file']).read_bytes()
    assert hashlib.sha256(content).hexdigest() == source['sha256'], source['file']
    return Image.open(io.BytesIO(content)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)


def ScanRecesses(displacement, asset):
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    # Separate the pores and pits from the shape of the scan's original panel.
    scale = {'black_walnut_veneer_02': .0095, 'rusty_metal_04': .034}[asset]
    height = np.asarray(displacement, dtype=np.float32) / 65535
    height = ndimage.gaussian_filter(height, .86, mode='wrap')
    depth = ndimage.gaussian_filter(height, 12., mode='wrap') - height
    return Image.fromarray(np.uint8(np.round(255 * np.clip(depth / scale, 0, 1))))


def Range(job):
    import requests

    source, start, end = job
    for attempt in range(4):
        try:
            resp=requests.get(source['url'],headers={'Range':f'bytes={start}-{end}'},timeout=(12,40))
            resp.raise_for_status()
            if resp.status_code==200 and len(resp.content)==source['size']:
                return resp.content[start:end+1]
            assert resp.status_code==206 and resp.headers['Content-Range']==f'bytes {start}-{end}/{source["size"]}'
            assert len(resp.content)==end+1-start
            return resp.content
        except Exception:
            if attempt==3:raise
            time.sleep(attempt+1)


def Main():
    import requests

    archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
    library = Path(os.environ.get('HANYANG_SCAN_DIR', str(archive/'ExteriorFinish_20261122'/'SurfaceScans')))
    library.mkdir(parents=True, exist_ok=True)
    rows, files = [], []
    for asset, roles in definitions.items():
        response = requests.get('https://api.polyhaven.com/files/'+asset,timeout=30)
        response.raise_for_status()
        for role in roles:
            extension = 'png' if role == 'Displacement' else 'jpg'
            source = response.json()[role]['2k'][extension]
            files.append((asset,role,source))

    with concurrent.futures.ThreadPoolExecutor(16) as pool:
        pending=[]
        for asset, role, source in files:
            target=library/source['url'].rsplit('/',1)[1]
            exists=target.is_file() and hashlib.md5(target.read_bytes()).hexdigest()==source['md5']
            chunks=[] if exists else [pool.submit(Range,(source,start,min(start+196607,source['size']-1))) for start in range(0,source['size'],196608)]
            pending.append((asset,role,source,target,chunks))
        for asset,role,source,target,chunks in pending:
            data=b''.join(chunk.result() for chunk in chunks) if chunks else target.read_bytes()
            assert len(data)==source['size'] and hashlib.md5(data).hexdigest()==source['md5']
            if chunks:target.write_bytes(data)
            rows.append(dict(asset=asset,role=role,file=target.name,url=source['url'],sha256=hashlib.sha256(data).hexdigest(),license='CC0-1.0'))
            print(asset,role,len(data),flush=True)
    (library/'Data_ScanSources.json').write_text(json.dumps(rows,indent=2)+'\n')
    assert rows==json.loads(Path(__file__).with_name('Data_HanYangScanSources.json').read_text()),'upstream material changed; review before rebuilding'


if __name__ == '__main__':
    Main()
