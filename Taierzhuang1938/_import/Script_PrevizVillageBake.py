"""FirstLevel0610 blockout previz: placeholder village clips (villagers, Nier, Geng, NRA escorts, IJA in the
village: crouch / duck prone / sit on the cart tail / panic run / crawl through the dog hole / climb out of the
cellar / stabbed / dragged / cling / bite / hug / push the vat / yank back / carry on the back / bayonet, drag,
grenade, lift-fling, piss, pin, shoulder charge, gate smash, wall climb, shout-point).

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on another clip library,
_import/Script_PrevizVillageClips.py, baked once on the shared-skeleton reference body TengxianNra02 (every Tengxian
body is the same TengxianHumanoidV1 skeleton, so one file serves them all). Headless, from the task worktree root:

    OPENING_PROJECT=<worktree>/Taierzhuang1938 OPENING_RENDER=1 blender --background --python-exit-code 1 \
        --python Taierzhuang1938/_import/Script_PrevizVillageBake.py

OPENING_RENDER=1 writes review stills to tmp/PrevizVillage/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/PrevizVillage/Animation_TengxianNra02PrevizVillage.json + Data_PrevizVillageAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/PrevizVillage_20261019 (never the repo).

V2 (2026-10-20): VilHandsUpClimbOut re-authored for the white box's 2 m straight-walled cellar and VilPushVat laid out on the
back-door geometry (the vat shoved 1.7 m east, then the bolt and the leaf); baked with OPENING_CLIPS=VilHandsUpClimbOut,VilPushVat,
the other 28 clips' frames merged from the committed file untouched. Bump OPENING_VERSION (and Data_BlockoutPrevizClips) with every rebake.
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_PrevizVillageClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'PrevizVillage'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20261019PrevizVillageV2')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PrevizVillage_20261019')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
