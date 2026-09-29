"""Package the audited standalone woman asset and copy delivery to her source folder.

Normal Python, after Build -> Validate -> Export -> Audit and browser review.
Original reference images are read only. Screenshots stay in private/local paths.
"""
import json, hashlib, shutil, subprocess
from pathlib import Path

repo=Path(__file__).resolve().parents[2]
asset=repo/'Taierzhuang1938/Model/Character'
local=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CivilianWomanReference_20260929')
references=Path(r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/百姓/08_中年_女子')
review=repo/'tmp/CivilianWomanReference'

def Identity(path):
    data=path.read_bytes()
    return {'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

audit=json.loads((review/'Data_GlbAudit.json').read_text(encoding='utf8'))
binding=json.loads((local/'Data_CivilianWomanBindingAudit.json').read_text(encoding='utf8'))
export=json.loads((local/'Data_CivilianWomanExport.json').read_text(encoding='utf8'))
browser=json.loads((review/'Data_BrowserAudit.json').read_text(encoding='utf8'))
assert not browser['errors'],browser['errors']
assert audit['sha256']==Identity(asset/'Model_TengxianCivilianWomanReference.glb')['sha256'],'Audit is stale'
assert browser['triangles']==sum(m['triangles'] for m in audit['meshes']),'Browser geometry differs'
assert browser['bones']==audit['bodyBones']+audit['faceBones'],'Browser skeleton differs'
manifest={
    'schemaVersion':1,'character':'Middle-aged civilian woman 08','created':'2026-09-29',
    'status':'Standalone reference model; not registered in the runtime cast',
    'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),
    'model':Identity(asset/'Model_TengxianCivilianWomanReference.glb'),
    'sources':[Identity(asset/name) for name in ['Model_TengxianNra05.glb','Model_TengxianNra05Facial.glb']],
    'references':[Identity(references/name) for name in ['三视图.png','正面.png','侧面.png','背面.png']],
    'skeleton':{'contract':'TengxianHumanoidV1','bodyBones':53,'faceBones':13,'maximumExportedInfluences':4,'morphTargets':False,
        'bodyAnimationSource':'Model_TengxianNra05.glb','embeddedAnimations':audit['animations']},
    'geometryReduction':export['geometryReduction'],
    'geometry':{'triangles':sum(m['triangles'] for m in audit['meshes']),'meshes':len(audit['meshes']),'materials':audit['materials']},
    'textures':{'embedded':audit['embeddedImages'],'atlasSize':2048,'channels':['Base','Normal','Roughness'],'groups':['Skin','Uniform','Equipment']},
    'generatedTexture':{'provider':'OpenAI built-in imagegen','source':Identity(local/'References/Texture_CivilianWomanTextileAtlas.png'),
        'promptRecord':'References/Data_ImagegenPrompts.json',
        'purpose':'Four flat textile quadrants: faded indigo jacket, dusty brown trousers, charcoal scarf/shoes, warm gray hemp sack. No clothing/accessory projections.'},
    'editableSource':'Model_CivilianWomanReference.blend','bakedSource':'Model_CivilianWomanReferenceBaked.blend',
    'sourceStorage':'Private Blender directory documented in docs/Data_CivilianWomanReference.md',
    'rebuildScripts':['Script_'+step+'CivilianWomanReference.py' for step in ['Build','Validate','Export','Audit','Package']]+['Script_CivilianWomanTools.py'],
    'verified':{'bodyBindMatrixError':binding['maximumBodyBindMatrixError'],'bodyTranslationError':audit['maximumBodyTranslationError'],
        'bodyQuaternionError':audit['maximumBodyQuaternionError'],'facialPoses':list(binding['poseFrames']),
        'browser':browser},
    'limitations':['Reference interpretation rather than a scan','No game LODs or live cast replacement','No cloth simulation; backpack and scarf follow existing body bones']
}
(asset/'Data_CivilianWomanReference.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
destination=references/'Model_CivilianWomanReference.glb'
shutil.copy2(asset/'Model_TengxianCivilianWomanReference.glb',destination)
assert Identity(destination)['sha256']==manifest['model']['sha256']
shutil.copy2(asset/'Data_CivilianWomanReference.json',local/'Data_CivilianWomanReference.json')
for path in review.glob('Preview_Browser*.png'):shutil.copy2(path,local/'Review'/path.name)
for name in ['Data_GlbAudit.json','Data_BrowserAudit.json']:shutil.copy2(review/name,local/'Review'/name)
print(json.dumps({'model':manifest['model'],'geometry':manifest['geometry'],'deliveredTo':str(destination)},ensure_ascii=False,indent=2))
