"""Acquire the exact Commons originals referenced by the user's Type 94 page.

Reference photographs are retained outside the repository. Metadata and hashes
make this acquisition reproducible; thumbnails are local observation aids only.
"""
import hashlib
import http.client
import json
import os
import time
import sys
from pathlib import Path
import urllib.parse
import urllib.request

PROJECT_ROOT = Path(os.environ.get('TYPE94_SOURCE_ROOT', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Type94Tankette'))
REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCES = [
    ('ArmorSchool', 'IJA TK Tankette Display at Armor School History Museum 20130302a.JPG'),
    ('LateProfile', 'Type 94 tankette late model.jpg'),
    ('Column', 'Type 94 tankette column.png'),
    ('Treloar', 'Type 94 Tankette at the Treloar Technology Centre September 2016.jpg'),
    ('Kubinka', 'Type 94 TK – Patriot Museum, Kubinka (26474921729).jpg'),
    ('Kwangtung', 'Type 94 tankettes in Kwangtung, 1939.jpg'),
    ('HongKong', 'Two Japanese Type 94 tankettes were running on a street in Hong Kong Island.jpg'),
    ('EarlyProfile', 'Type 94 TK tankette.jpg'),
    ('Nanjing', 'Nanjing Government Army Type 94 tankettes.png'),
    ('Shuri', 'SC 211480 - Jap tankette knocked out in battle for Shuri. (52517299858).jpg'),
    ('KubinkaOld', 'Type 94 in the Kubinka Museum.jpg'),
    ('LatePlate', 'Model94.jpg'),
]


def ReadUrl(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Type94ReferenceStudy/1.0 (reference asset acquisition)'})
    with urllib.request.urlopen(request, timeout=70) as response:
        return response.read()


def DownloadOriginal(url, path, expectedSize):
    """Stream to a partial file and use standard HTTP resume after disconnects."""
    partial = path.with_suffix(path.suffix + '.partial')
    for attempt in range(3):
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {'User-Agent': 'Type94ReferenceStudy/1.0'}
        if offset:
            headers['Range'] = 'bytes=' + str(offset) + '-'
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=70) as response:
            append = offset and response.status == 206
            with partial.open('ab' if append else 'wb') as output:
                while True:
                    try:
                        chunk = response.read(65536)
                    except http.client.IncompleteRead as error:
                        output.write(error.partial)
                        break
                    if not chunk:
                        break
                    output.write(chunk)
        if not expectedSize or partial.stat().st_size == expectedSize:
            partial.replace(path)
            return
        time.sleep(2)
    raise RuntimeError('Incomplete original retained for resume: ' + str(partial))


def Acquire(item, page):
    name, title = item
    info = page['imageinfo'][0]
    originalUrl = info['url'].split('?')[0]
    path = PROJECT_ROOT / 'References' / ('Reference_' + name + Path(urllib.parse.unquote(originalUrl)).suffix.lower())
    originalRetrieved = path.exists()
    if not path.exists():
        if '--thumbnails' in sys.argv:
            thumbnailUrl = originalUrl.replace('/commons/', '/commons/thumb/') + '/1280px-' + originalUrl.rsplit('/', 1)[1]
            path = path.with_name('Thumbnail_' + path.name.removeprefix('Reference_'))
            if not path.exists():
                path.write_bytes(ReadUrl(thumbnailUrl))
        else:
            DownloadOriginal(originalUrl, path, info.get('size'))
            originalRetrieved = True
    from PIL import Image
    with Image.open(path) as source:
        source.verify()
    with Image.open(path) as source:
        size = list(source.size)
        source = source.convert('RGB')
        source.thumbnail((640, 640))
        source.save(PROJECT_ROOT / 'References' / ('Preview_' + name + '.jpg'), quality=82)
    return {'id': name, 'title': title, 'page': info['descriptionurl'], 'originalUrl': originalUrl,
            'localImage': str(path), 'originalRetrieved': originalRetrieved, 'size': size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'metadata': info.get('extmetadata', {})}


def Main():
    (PROJECT_ROOT / 'References').mkdir(parents=True, exist_ok=True)
    records = []
    query = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata',
                                   'titles': '|'.join('File:' + title for _, title in REFERENCES)})
    cache = PROJECT_ROOT / 'References' / 'Data_CommonsMetadata.json'
    meta = json.loads(cache.read_text(encoding='utf-8')) if '--cached' in sys.argv and cache.exists() else json.loads(ReadUrl('https://commons.wikimedia.org/w/api.php?' + query))
    pages = {page['title']: page for page in meta['query']['pages'].values()}
    (PROJECT_ROOT / 'References' / 'Data_CommonsMetadata.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    for item in REFERENCES:
        try:
            record = Acquire(item, pages['File:' + item[1]])
            records.append(record)
            print(record['id'], record['size'], 'verified', flush=True)
        except Exception as error:
            records.append({'id': item[0], 'title': item[1], 'error': str(error)})
            print(item[0], 'ERROR', str(error), flush=True)
        time.sleep(2)
    manifest = {'notionPage': 'https://app.notion.com/p/40260335331c8122be94e41acca07698',
                'references': sorted(records, key=lambda item: item['id'])}
    (PROJECT_ROOT / 'References' / 'Data_ReferenceAcquisition.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    out = REPO_ROOT / 'Taierzhuang1938' / 'Model' / 'Type94Tankette'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'Data_ReferenceSources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    from PIL import Image, ImageDraw
    valid = [item for item in REFERENCES if any(row['id'] == item[0] and 'error' not in row for row in records)]
    for start in range(0, len(valid), 4):
        sheet = Image.new('RGB', (640, 560), '#ddd9d0')
        draw = ImageDraw.Draw(sheet)
        for offset, (name, _) in enumerate(valid[start:start+4]):
            with Image.open(PROJECT_ROOT / 'References' / ('Preview_' + name + '.jpg')) as preview:
                preview.thumbnail((312, 250))
                x, y = (offset % 2) * 320, (offset // 2) * 280
                sheet.paste(preview, (x + (320-preview.width)//2, y + 22))
                draw.text((x+8,y+5), name, fill='black')
        sheet.save(PROJECT_ROOT / 'References' / ('Preview_Sheet' + str(start//4 + 1) + '.jpg'), quality=83)


if __name__ == '__main__':
    Main()
