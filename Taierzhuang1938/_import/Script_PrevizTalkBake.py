"""White-box previz talk / gesture clips (docs/Data_EditorBlockout.md §14, Data_BlockoutPrevizClips.mjs).

Runs the 01-02 opening frame loop (_import/Script_OpeningStoryboardBake.py) on another clip library,
_import/Script_PrevizTalkClips.py, baked once on the shared-skeleton reference body TengxianNra02 (every
TengxianHumanoidV1 body -- NRA and IJA -- has the same bone names, so one file serves them all). Headless, from the
task worktree root:

    OPENING_PROJECT=<worktree>/Taierzhuang1938 OPENING_RENDER=1 blender --background --python-exit-code 1 \
        --python Taierzhuang1938/_import/Script_PrevizTalkBake.py

or through BlenderMCP (node scripts/Script_BlenderMcp.mjs start --task PrevizTalk / exec --file ... / stop).
OPENING_RENDER=1 writes review stills to tmp/PrevizTalk/BlenderReview; OPENING_CLIPS bakes a subset.
Output: Animation/PrevizTalk/Animation_TengxianNra02PrevizTalk.json + Data_PrevizTalkAnimation.json.
The editable scene goes to OneDrive AI/Models/Blender/Taierzhuang1938/PrevizTalk_20261019 (never the repo).
"""
import os, runpy
from pathlib import Path

project = Path(os.environ['OPENING_PROJECT'])
os.environ['OPENING_LIBRARY'] = str(project / '_import/Script_PrevizTalkClips.py')
os.environ['OPENING_LIBRARY_NAME'] = 'PrevizTalk'
os.environ.setdefault('OPENING_LIBRARY_MODELS', 'TengxianNra02')
os.environ.setdefault('OPENING_VERSION', '20261019PrevizTalkV2')
os.environ.setdefault('OPENING_BLEND_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PrevizTalk_20261019')
runpy.run_path(str(project / '_import/Script_OpeningStoryboardBake.py'), run_name='__main__')
