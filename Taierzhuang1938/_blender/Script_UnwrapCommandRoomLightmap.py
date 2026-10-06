"""Chart real surface topology in xatlas, then return the UVs to Blender."""
import bmesh,subprocess,sys
work=ROOT/'tmp/CommandRoomAtlas';work.mkdir(parents=True,exist_ok=True)
names=[];inputData={}
for i,ob in enumerate(objects):
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
    ob.data.validate(clean_customdata=False)
    if 'LightmapUV' in ob.data.uv_layers:ob.data.uv_layers.remove(ob.data.uv_layers['LightmapUV'])
    ob.data.uv_layers.new(name='LightmapUV');ob.data.uv_layers.active_index=1
    factor=density.get(ob.data.materials[0].name,1)
    inputData[f'v{i}']=np.array([list(ob.matrix_world@v.co) for v in ob.data.vertices],dtype=np.float32)*factor
    inputData[f'f{i}']=np.array([list(p.vertices) for p in ob.data.polygons],dtype=np.uint32)
    names.append(ob.name)
inputData['names']=json.dumps(names);np.savez_compressed(work/'Input.npz',**inputData)
python=os.environ.get('COMMAND_ROOM_PYTHON',r'C:/Users/Bentl/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
env=os.environ.copy();env['PYTHONPATH']=str(ROOT/'tmp/CommandRoomPython')
proc=subprocess.run([python,str(GAME/'_blender/Script_PackCommandRoomLightmap.py'),str(work/'Input.npz'),str(work/'Output.npz')],
    env=env,capture_output=True,text=True,timeout=600,creationflags=0x08000000 if os.name=='nt' else 0)
assert proc.returncode==0,proc.stderr
print(proc.stdout,flush=True)
uvData=np.load(work/'Output.npz')
for i,ob in enumerate(objects):
    uv=ob.data.uv_layers['LightmapUV'];uv.data.foreach_set('uv',uvData[f'uv{i}'].ravel())
