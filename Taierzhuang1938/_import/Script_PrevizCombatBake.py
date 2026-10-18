"""FirstLevel0105 previz: NRA combat placeholder clips (_import/Script_PrevizCombatClips.py) -- blown back, leg hit,
diving prone, crawling with a grenade bundle, climbing out of a trench, two men supporting a hopping wounded man, a
shoulder shove and a crouched run towing someone behind.

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on another clip library, baked once on the
shared-skeleton reference body TengxianNra02 (every NRA body is the same TengxianHumanoidV1 skeleton). Headless, from the
task worktree root:

    OPENING_PROJECT=<worktree>/Taierzhuang1938 OPENING_RENDER=1 \
      "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --python-exit-code 1 \
      --python Taierzhuang1938/_import/Script_PrevizCombatBake.py

OPENING_RENDER=1 writes review stills to tmp/PrevizCombat/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/PrevizCombat/Animation_TengxianNra02PrevizCombat.json + Data_PrevizCombatAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/PrevizCombat_20261019 (never the repo).
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_PrevizCombatClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'PrevizCombat'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20261019PrevizCombatV1')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PrevizCombat_20261019')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
