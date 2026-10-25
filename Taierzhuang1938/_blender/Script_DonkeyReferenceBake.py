"""Open the frozen bare V3 intermediate; preserve both it and the cart source."""
import bpy,json,hashlib,shutil
from pathlib import Path

project=Path(bpy.context.scene['DonkeyCartProject'])
parent=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261023')
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261025/ReferenceFitV29')
source=parent/'ReferenceFitV4/Scene_DonkeyBeforeReferenceFit.blend'
if not source.is_file():raise RuntimeError('Missing preserved bare V3 intermediate: '+str(source))
sourceSha=hashlib.sha256(source.read_bytes()).hexdigest()
record=json.loads((parent/'Data_Derivation.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
if scene.get('DonkeyCoatRevision')!='20261023FurV3' or scene.get('DonkeyReferenceFitRevision'):
    raise RuntimeError('Reference fit must start from the unchanged V3 intermediate')
if bpy.data.objects.get('DonkeyCartRig'):raise RuntimeError('Bare V3 source contains a cart')
scene['DonkeyCartProject']=str(project);scene['DonkeySourceRoot']=str(base);scene['DonkeyReferenceInputRoot']=str(parent)
scene['BlenderMcpTask']='DonkeyReferenceRebuild'
(base/'Review').mkdir(parents=True,exist_ok=True);(base/'SourceTextures').mkdir(exist_ok=True)
for name in ('Image_NakedAnatomyGuide.png','Data_NakedGuideGeneration.json'):
    shutil.copy2(parent/'ReferenceFitV4'/name,base/name)
for path in (parent/'SourceTextures').glob('Data_*Generation.json'):
    shutil.copy2(path,base/'SourceTextures'/path.name)
record['referenceSource']={'path':str(source),'sha256':sourceSha,'version':'20261023FurV3','preserved':True}
(base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
print(json.dumps({'referenceSource':str(source),'sha256':sourceSha,'destination':str(base/'Scene_Donkey.blend')}))
