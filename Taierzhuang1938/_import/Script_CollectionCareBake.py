"""06 casualty collection clips (docs/Data_CollectionCare20260927.md): wounded on the straw, medics
bandaging and pressing, Zhou reclined against the low wall.

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on another clip library,
_import/Script_CollectionCareClips.py, baked once on the shared-skeleton reference body TengxianNra02
(every NRA body is the same TengxianHumanoidV1 skeleton, so one file serves them all). Through BlenderMCP,
from the task worktree root:

    node scripts/Script_BlenderMcp.mjs start --task CollectionCare
    node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['OPENING_PROJECT']=r'<worktree>/Taierzhuang1938'"
    node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_CollectionCareBake.py
    node scripts/Script_BlenderMcp.mjs stop

or headless: OPENING_PROJECT=<...>/Taierzhuang1938 blender --background --python-exit-code 1 --python <this file>.
OPENING_RENDER=1 writes review stills to tmp/CollectionCare/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/CollectionCare/Animation_TengxianNra02CollectionCare.json + Data_CollectionCareAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/CollectionCare_20260927 (never the repo).
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_CollectionCareClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'CollectionCare'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20260927CollectionCareV1')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CollectionCare_20260927')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
