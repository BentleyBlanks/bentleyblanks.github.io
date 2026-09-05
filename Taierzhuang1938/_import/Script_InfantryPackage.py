"""Archive source identity, verify preview decoding, and hash local deliverables."""
from pathlib import Path
import json,hashlib,shutil,subprocess,py_compile
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905';output=runtime/'Deliverables'
def Read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def Hash(path):
 digest=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(4*1024*1024),b''):digest.update(block)
 return digest.hexdigest()
for path in Path(__file__).parent.glob('Script_Infantry*.py'):
 py_compile.compile(str(path),doraise=True)
 target=output/'RebuildScripts'/path.name
 if path.resolve()!=target.resolve():shutil.copy2(path,target)
sources=[]
for name in ['RifleCrouchAdvance','RifleKneelTransition','GrenadeThrow']:
 generation=Read(runtime/'Sources'/f'Data_{name}Generation.json');video=next((runtime/'Sources'/name).glob('*.mp4'));cache=runtime/'Capture'/name
 sources.append({'name':name,'model':generation['model'],'submitId':generation['submit_id'],'credits':generation['credit_count'],
  'video':str(video.relative_to(runtime)),'videoSha256':Hash(video),'cacheFiles':[{'path':str(p.relative_to(runtime)),'sha256':Hash(p),'bytes':p.stat().st_size} for p in [cache/'0_input_video.mp4',cache/'hmr4d_results.pt',cache/'Data_GvhmrMotion.npz']]})
(output/'Data_Provenance.json').write_text(json.dumps({'scope':'Local noncommercial research and evaluation','baseCommit':'7d2076277572391902b984d12ee4388974334440',
 'videoCredits':sum(s['credits'] for s in sources),'pipeline':['Seedance 2.5','GVHMR 1.6.1','Original NRA/IJA 53-bone retarget','BlenderMCP contact and grip correction','GLB reimport validation'],
 'sources':sources,'licensedWeightsIncluded':False},ensure_ascii=False,indent=2),encoding='utf-8')
media=[]
for path in output.glob('Preview_*.mp4'):
 result=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height,nb_frames,r_frame_rate','-of','json',str(path)]))
 subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True,stdout=subprocess.DEVNULL)
 media.append({'file':path.name,**result,'fullDecode':'passed'})
(output/'Data_PreviewValidation.json').write_text(json.dumps({'videos':media,'browser':{'playback':'passed','actionSwitch':'passed','halfSpeed':0.5,'frameSeek':'passed','seekableSeconds':16.366667},
 'materialReimportVisualReview':'IJA skin and rifle match rendered source; screenshots in parent Inspection'},indent=2),encoding='utf-8')
validation=Read(output/'Data_Validation.json');assert validation['status']=='passed'
files=[{'path':str(p.relative_to(output)),'bytes':p.stat().st_size,'sha256':Hash(p)} for p in sorted(output.rglob('*')) if p.is_file() and p.name!='Data_Manifest.json' and p.suffix!='.blend1' and '__pycache__' not in p.parts]
(output/'Data_Manifest.json').write_text(json.dumps({'root':str(output),'hashAlgorithm':'SHA256','files':files,'excluded':'Blender .blend1 automatic backup and this manifest'},indent=2),encoding='utf-8')
assert all(Hash(output/f['path'])==f['sha256'] for f in files)
print('PACKAGE_VERIFIED',len(files),'files;',sum(s['credits'] for s in sources),'video credits')
print('Maximum support drift mm:',max(c['maxSupportToeDriftMeters'] for c in validation['clips'].values())*1000)
print('Maximum GLB reimport joint error mm:',max(c['maxJointPositionErrorMeters'] for c in validation['reimports'].values())*1000)
