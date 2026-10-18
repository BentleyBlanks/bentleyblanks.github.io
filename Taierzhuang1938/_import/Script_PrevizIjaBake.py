"""FirstLevel0105 blockout previz: placeholder IJA clips (signal, bayonet threat, butt strike, hair lift, Type89
discharger crew, parried lunge and fall) and the struck captive's reaction.

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on another clip library,
_import/Script_PrevizIjaClips.py, baked once on the shared-skeleton reference body TengxianNra02 (every Tengxian body,
IJA ones included, is the same TengxianHumanoidV1 skeleton, so one file serves them all). Headless, from the task
worktree root:

    OPENING_PROJECT=<worktree>/Taierzhuang1938 OPENING_RENDER=1 blender --background --python-exit-code 1 \
        --python Taierzhuang1938/_import/Script_PrevizIjaBake.py

OPENING_RENDER=1 writes review stills to tmp/PrevizIja/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/PrevizIja/Animation_TengxianNra02PrevizIja.json + Data_PrevizIjaAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/PrevizIja_20261019 (never the repo).
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_PrevizIjaClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'PrevizIja'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20261019PrevizIjaV1')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PrevizIja_20261019')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
