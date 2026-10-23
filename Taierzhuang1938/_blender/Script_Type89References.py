"""Download the single Type89 reference set, preserving originals and metadata.

No generated images. Commons file links are from the supplied Notion page.
Run with system Python (Pillow), not inside Blender.
"""
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request
import urllib.error
from PIL import Image, ImageDraw, ImageOps

sourceDir = pathlib.Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/References')
fileNames = [
    'Type_89_I-Go_medium_tanks.png',
    'Type_89_Yi-Go_at_Tsuchira.jpg',
    'Type-89-Aberdeen.0003cg4s.jpg',
    'Battle_of_Khalkhin_Gol-Japanese_Type_89_Chi-Ro_midium_tank.jpg',
    'Villa_Escudero_Japanese_World_War_II_Type_89_Chi-Ro_Medium_Tank.jpg',
    'Type_89_test_driving,_Japan_in_1929.png',
    'Capa_robert_2013_71_1_453900_displaysize.jpg',
    'Een_buitgemaakte_Japanse_89_I-Go_middelzware_tank_in_gebruik_bij_KNIL-troepen_op_Java.jpg',
    'IJA_Type_89_medium_tank_Ko_earlymodel.jpg',
    'NH_77804.jpg',
    'Typ_89_I-Go_aufhängung_laufräder.jpg',
    'Type89A_I-Go_SNLF.jpg',
    'Type_89_Chi-Ro3.jpg',
    'Type_89_I-Go_at_Villa_Escudero,_Quezon_Province,_Philippines.jpg',
    'Type_89_Japanese_tank.jpg',
    'Imperial_Japanese_Army_Type_89_Medium_Tank_Otsu_front_view_at_JGSDF_Camp_Tsuchiura_September_28,_2025.jpg',
    'Imperial_Japanese_Army_Type_89_Medium_Tank_Otsu_left_front_view_at_JGSDF_Camp_Tsuchiura_September_28,_2025_01.jpg',
    'Imperial_Japanese_Army_Type_89_Medium_Tank_Otsu_left_front_view_at_JGSDF_Camp_Tsuchiura_September_28,_2025_02.jpg',
    'Imperial_Japanese_Army_Type_89_Medium_Tank_Otsu_left_side_view_at_JGSDF_Camp_Tsuchiura_September_28,_2025.jpg',
    'Imperial_Japanese_Army_Type_89_Medium_Tank_Otsu_right_front_view_at_JGSDF_Camp_Tsuchiura_September_28,_2025.jpg',
]


def ReadUrl(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Type89ReferenceResearch/1.0 (visual asset research)'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def DownloadOne(index, fileName, page):
    info = page['imageinfo'][0]
    originalUrl = info['url'].split('?')[0]
    path = sourceDir / ('Reference_%02d%s' % (index, pathlib.Path(fileName).suffix.lower()))
    status = 'original'
    if not path.exists():
        try:
            path.write_bytes(ReadUrl(originalUrl))
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            status = 'original HTTP 429; Wikimedia-recommended thumbnail retained'
            path = sourceDir / ('Reference_%02d_1280%s' % (index, pathlib.Path(fileName).suffix.lower()))
            if not path.exists():
                path.write_bytes(ReadUrl(info['thumburl']))
    original = Image.open(path).convert('RGB')
    preview = original.copy()
    preview.thumbnail((640, 640), Image.Resampling.LANCZOS)
    preview.save(sourceDir / ('Preview_%02d.jpg' % index), quality=83)
    return {'id': index, 'file': path.name, 'downloadStatus': status, 'commonsTitle': page['title'], 'sourceUrl': info['descriptionurl'], 'originalUrl': originalUrl, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'width': original.width, 'height': original.height, 'originalWidth': info['width'], 'originalHeight': info['height'], 'metadata': info['extmetadata']}


def Main():
    sourceDir.mkdir(parents=True, exist_ok=True)
    query = urllib.parse.urlencode({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|sha1', 'iiurlwidth': 1280, 'format': 'json', 'titles': '|'.join('File:' + name for name in fileNames)})
    data = json.loads(ReadUrl('https://commons.wikimedia.org/w/api.php?' + query))
    pages = {page['title'].replace(' ', '_'): page for page in data['query']['pages'].values()}
    manifestPath = sourceDir / 'Data_ReferenceManifest.json'
    savedRows = {row['id']: row for row in json.loads(manifestPath.read_text(encoding='utf8'))} if manifestPath.exists() else {}
    rows = []
    for index, fileName in enumerate(fileNames, 1):
        try:
            if index in savedRows:
                rows.append(savedRows[index])
                continue
            row = DownloadOne(index, fileName, pages['File:' + fileName])
            rows.append(row)
            print('Saved reference %02d: %s' % (index, row['downloadStatus']), flush=True)
        except Exception as error:
            print('Reference %02d unavailable: %s' % (index, error), flush=True)
    manifestPath.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf8')
    for start in range(0, len(rows), 4):
        sheet = Image.new('RGB', (640, 520), '#262626')
        draw = ImageDraw.Draw(sheet)
        for offset, row in enumerate(rows[start:start+4]):
            image = Image.open(sourceDir / row['file']).convert('RGB')
            image.thumbnail((316, 226), Image.Resampling.LANCZOS)
            x, y = (offset % 2) * 320, (offset // 2) * 260
            sheet.paste(image, (x + (320-image.width)//2, y + 24 + (226-image.height)//2))
            draw.text((x+5, y+6), '%02d %s' % (row['id'], row['commonsTitle'][5:42]), fill='white')
        sheet.save(sourceDir / ('Preview_Contact%02d.jpg' % (start//4+1)), quality=84)
    print(json.dumps([{'id': row['id'], 'file': row['file'], 'size': [row['width'], row['height']], 'description': row['metadata'].get('ImageDescription', {}).get('value',''), 'categories': row['metadata'].get('Categories', {}).get('value','')} for row in rows], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    Main()
