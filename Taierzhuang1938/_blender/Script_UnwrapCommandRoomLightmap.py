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
inputData['names']=json.dumps(names)
# Reuse a completed atlas only when its chart geometry is identical. The wall
# proxy is X/Z planar, so changes in its shallow Y relief do not change its UVs.
reuseAtlas=False
if (work/'Input.npz').exists() and (work/'Output.npz').exists() and (work/'Output.npz').stat().st_mtime>=(work/'Input.npz').stat().st_mtime:
    with np.load(work/'Input.npz') as previous:
        reuseAtlas=str(previous['names'])==inputData['names']
        if reuseAtlas:
            for i,name in enumerate(names):
                a=previous[f'v{i}'];b=inputData[f'v{i}'];axes=[0,2] if name=='Room_CommandRoomWallSurface' else [0,1,2]
                sameVertices=a.shape==b.shape and (np.allclose(a[:,axes],b[:,axes],atol=.000002,rtol=0) if name=='Room_CommandRoomWallSurface' else np.array_equal(a,b))
                if not sameVertices or not np.array_equal(previous[f'f{i}'],inputData[f'f{i}']):reuseAtlas=False;break
                if name=='Room_CommandRoomWallSurface' and np.ptp(b[:,1])>=.04:reuseAtlas=False;break
if not reuseAtlas:np.savez_compressed(work/'Input.npz',**inputData)
python=os.environ.get('COMMAND_ROOM_PYTHON',r'C:/Users/Bentl/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
env=os.environ.copy();env['PYTHONPATH']=str(ROOT/'tmp/CommandRoomPython')
if reuseAtlas:print('Reusing verified unchanged lightmap charts',flush=True)
else:
    proc=subprocess.run([python,str(GAME/'_blender/Script_PackCommandRoomLightmap.py'),str(work/'Input.npz'),str(work/'Output.npz')],
        env=env,capture_output=True,text=True,timeout=600,creationflags=0x08000000 if os.name=='nt' else 0)
    assert proc.returncode==0,proc.stderr
    print(proc.stdout,flush=True)
uvData=np.load(work/'Output.npz')
for i,ob in enumerate(objects):
    uv=ob.data.uv_layers['LightmapUV'];uv.data.foreach_set('uv',uvData[f'uv{i}'].ravel())
