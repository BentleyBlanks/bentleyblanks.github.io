"""Contact sheet of the death-impact renders (system Python + Pillow, run outside Blender).

    python Taierzhuang1938/_import/Script_DeathImpactMontage.py [clip ...]

Reads <private>/renders/<clip>/{side,front}_<n>_<ms>.png (written by Script_DeathImpactRagdollBake.py with
DEATH_IMPACT_RENDER=1) and writes <private>/sheets/<clip>.png: top row side view, bottom row front view,
one column per sampled time. The sheets stay on this machine (OneDrive), not in the repository.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DeathImpact_20260930')
clips = sys.argv[1:] or sorted(p.name for p in (private / 'renders').iterdir() if p.is_dir())
(private / 'sheets').mkdir(exist_ok=True)
for clip in clips:
    folder = private / 'renders' / clip
    rows = []
    for view in ('side', 'front'):
        files = sorted(folder.glob(view + '_*.png'), key=lambda p: int(p.stem.split('_')[1]))
        rows.append(files)
    w = h = 360
    cols = max(len(r) for r in rows)
    sheet = Image.new('RGB', (cols * w, 2 * h), (30, 30, 30))
    draw = ImageDraw.Draw(sheet)
    for r, files in enumerate(rows):
        for c, f in enumerate(files):
            sheet.paste(Image.open(f).convert('RGB'), (c * w, r * h))
            draw.text((c * w + 8, r * h + 6), '%s t=%.2fs' % (['side', 'front'][r], int(f.stem.split('_')[2]) / 1000), fill=(255, 255, 0))
    out = private / 'sheets' / (clip + '.png')
    sheet.save(out)
    print(out)
