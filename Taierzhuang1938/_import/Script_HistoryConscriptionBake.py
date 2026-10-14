"""Preserve native archival image pixels for the Sichuan conscription notes.

Usage: python Script_HistoryConscriptionBake.py --source-dir <research folder>
Expected sources: sichuan_bingyi.pdf, leshan_1943.jpg, zhongjiang_1945.jpg.
The PDF and original photos stay outside this repository. No generative edits.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from pypdf import PdfReader


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    source = parser.parse_args().source_dir
    project = Path(__file__).resolve().parent.parent
    output = project / 'Texture/Menu/History'
    sources = [
        ('ConscriptionProcedure', 'sichuan_bingyi.pdf', 'https://www.scdfz.org.cn/upload/main/contentmanage/article/file/201702232017118370.pdf'),
        ('LeshanConscription1943', 'leshan_1943.jpg', 'https://www.krzzjn.com/uploadfile/2019/0301/20190301094155192.jpg'),
        ('ZhongjiangConscription1945', 'zhongjiang_1945.jpg', 'https://www.krzzjn.com/uploadfile/2023/0621/20230621110407146.jpg'),
    ]
    records = []
    for name, filename, url in sources:
        original = source / filename
        if original.suffix == '.pdf':
            if len(PdfReader(original).pages) != 42:
                raise ValueError('Unexpected source chapter length')
            # The PDF page contains multiple glyph/image objects. Render the complete
            # original page so its diagram, headings and printed folio stay together.
            with tempfile.TemporaryDirectory() as temp:
                prefix = Path(temp) / 'Procedure'
                subprocess.run(['pdftoppm', '-f', '12', '-l', '12', '-r', '144', '-png', '-singlefile', str(original), str(prefix)], check=True)
                image = Image.open(prefix.with_suffix('.png')).copy()
        else:
            image = Image.open(original)
        target = output / f'Texture_History{name}Image.webp'
        image.convert('RGB').save(target, 'WEBP', lossless=original.suffix == '.pdf', quality=95, method=6)
        records.append({'file': target.relative_to(project).as_posix(), 'source': url,
                        'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                        'width': image.width, 'height': image.height,
                        'method': 'Complete PDF page 550 rendered at 144 dpi; lossless WebP' if original.suffix == '.pdf' else 'Native photograph dimensions, WebP quality 95; no resampling'})
    (project / '_import/Data_HistoryConscriptionImages.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(records, ensure_ascii=False))


if __name__ == '__main__':
    Main()
