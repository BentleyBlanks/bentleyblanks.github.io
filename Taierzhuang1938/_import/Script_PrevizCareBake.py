"""FirstLevel0105 blockout previz placeholder clips: the wounded, bandaging, the blanket drag, the litter.

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on the clip library
_import/Script_PrevizCareClips.py, baked once on the shared-skeleton reference body TengxianNra02 (every NRA body
is the same TengxianHumanoidV1 skeleton). Headless, from the task worktree root:

    OPENING_PROJECT=<worktree>/Taierzhuang1938 OPENING_RENDER=1 blender --background --python-exit-code 1 \
        --python Taierzhuang1938/_import/Script_PrevizCareBake.py

OPENING_RENDER=1 writes review stills to tmp/PrevizCare/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/PrevizCare/Animation_TengxianNra02PrevizCare.json + Data_PrevizCareAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/PrevizCare_20261019 (never the repo).
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_PrevizCareClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'PrevizCare'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20261019PrevizCareV1')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PrevizCare_20261019')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
