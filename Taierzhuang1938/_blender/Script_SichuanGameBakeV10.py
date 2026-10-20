"""Project the retained HighV10 materials onto every actual GameV10 mesh.

Run in the owned GameV10 MCP scene, after BuildGameUv. No source geometry,
original UVs, or coordinate anchors are moved. Per-target progress and partial
images are retained so an interrupted channel need not invalidate earlier ones.
"""
import bpy, json, time, hashlib
from pathlib import Path

PARTS=('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals')


def Evidence(path):
    path=Path(path);data=path.read_bytes()
    return {'path':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def BakeGame(root, reviewPath, channels=('Base','Normal','Roughness','Ao')):
    scene=bpy.context.scene;review=Path(reviewPath);review.mkdir(parents=True,exist_ok=True)
    assert root.name=='Pack_Root' and scene.get('BlenderMcpTask')=='SichuanBlanketPack'
    assert 'GameV10' in bpy.data.filepath
    low=[o for o in root.children_recursive if o.type=='MESH']
    assert sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in low)<=3000
    highRoot=bpy.data.objects['High_Pack_Root']
    sources={name:[o for o in (bpy.data.objects['High_'+name],*bpy.data.objects['High_'+name].children_recursive)
                   if o.type=='MESH']for name in PARTS}
    # Root-level source geometry (the original bundle is itself a mesh) is
    # included in its own part. Original anchors remain parented and unmoved.
    sourceInfo=[]
    for name,objects in sources.items():
        for obj in objects:
            materials=[]
            for mat in obj.data.materials:
                if not mat:continue
                shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                assert shader is not None,('Missing real source shader',obj.name,mat.name)
                socket=shader.inputs['Roughness']
                materials.append({'name':mat.name,'roughnessLinked':socket.is_linked,
                                  'roughnessDefault':float(socket.default_value)})
            sourceInfo.append({'name':obj.name,'part':name,'materials':materials})
    def Part(obj):
        while obj.parent and obj.name not in PARTS:obj=obj.parent
        assert obj.name in PARTS
        return obj.name
    def ProjectionSources(obj):
        partSources=sources[Part(obj)]
        exact=obj.get('SourceHighObject','')
        names=set(obj.get('BakeSourceNames','').split(','))-{''}
        chosen=[o for o in partSources if o.name==exact or o.get('PackSourceName',o.name) in names]
        if 'RepairPatch' in obj.name:
            chosen.extend(o for o in partSources if 'Stitch' in o.name or 'RepairThread' in o.name)
        assert chosen,('Missing explicit high projection source',obj.name,exact,names)
        return list(dict.fromkeys(chosen))
    def RaySettings(obj):
        part=Part(obj)
        if 'Twine' in obj.name:return .001,.004
        if part=='Pack_Sandals':return .002,.010
        if part=='Pack_Binding' or 'CottonRetainers' in obj.name:return .0015,.008
        if part=='Pack_Jacket':return .005,.015
        if part=='Pack_StrawMat':return .004,.015
        return .006,.020
    operations=[{'target':obj.name,'part':Part(obj),'sources':[s.name for s in ProjectionSources(obj)],
                 'selectedToActive':True,'bakeType':'EMIT'}for obj in low]
    record={'sourceBlend':Evidence(root['SourceBlend']),'sources':sourceInfo,'projection':operations,
            'bakeScene':bpy.data.filepath,'resolution':2048,'coordinateAnchorsMoved':False,
            'normalProjection':'Cycles tangent selected-to-active; original source bump and normal nodes',
            'aoProjection':'Source material local occlusion, 0.025m distance, 65 percent fibre contrast'}
    (review/'Data_BakeProjection.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    progress={'stage':'Starting','started':time.time(),'completed':[]}
    def Progress(stage,**kwargs):
        progress.update(stage=stage,**kwargs)
        (review/'Data_BakeProgress.json').write_text(json.dumps(progress,indent=2),encoding='utf-8')
        print('GAME_BAKE_V10',json.dumps({k:v for k,v in progress.items()if k!='completed'}),flush=True)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8'
    scene.render.bake.normal_space='TANGENT';scene.render.bake.margin=0
    savedVisibility={o:(o.hide_render,o.hide_get())for o in scene.objects if o.type=='MESH'}
    allSources={o for values in sources.values()for o in values}
    sourceMaterials={m for o in allSources for m in o.data.materials if m}
    savedOutputs={};added={m:[]for m in sourceMaterials};targets=[]
    for mat in sourceMaterials:
        output=next(n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
        savedOutputs[mat]=(output,[(link.from_socket,link.to_socket)for link in output.inputs['Surface'].links])
    try:
        for o in savedVisibility:o.hide_render=True;o.hide_set(True)
        for channel in channels:
            imageName='Bake_GameV10_'+channel
            existing=bpy.data.images.get(imageName)
            if existing:bpy.data.images.remove(existing)
            image=bpy.data.images.new(imageName,2048,2048,alpha=True,float_buffer=False)
            image.generated_color=(0,0,0,0)
            image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
            for mat in sourceMaterials:
                nodes,links=mat.node_tree.nodes,mat.node_tree.links
                output,oldLinks=savedOutputs[mat]
                for link in list(output.inputs['Surface'].links):links.remove(link)
                shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
                if channel=='Normal':
                    for a,b in oldLinks:links.new(a,b)
                else:
                    emission=nodes.new('ShaderNodeEmission');added[mat].append(emission)
                    if channel in ('Base','Roughness'):
                        socket=shader.inputs['Base Color' if channel=='Base' else 'Roughness']
                        if socket.is_linked:links.new(socket.links[0].from_socket,emission.inputs['Color'])
                        else:
                            value=socket.default_value
                            emission.inputs['Color'].default_value=tuple(value) if channel=='Base' else (value,value,value,1)
                    else:
                        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=True
                        ao.inputs['Distance'].default_value=.025
                        mult=nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=.65
                        add=nodes.new('ShaderNodeMath');add.operation='ADD';add.inputs[1].default_value=.35
                        added[mat].extend((ao,mult,add));links.new(ao.outputs['AO'],mult.inputs[0])
                        links.new(mult.outputs[0],add.inputs[0]);links.new(add.outputs[0],emission.inputs['Color'])
                    links.new(emission.outputs[0],output.inputs['Surface'])
            targetMaterial=bpy.data.materials.new('Material_GameV10BakeTarget_'+channel)
            targetMaterial.use_nodes=True
            node=targetMaterial.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
            targetMaterial.node_tree.nodes.active=node;targets.append(targetMaterial)
            path=review/('Bake_'+channel+'.png')
            for index,obj in enumerate(low):
                part=Part(obj);high=ProjectionSources(obj);extrusion,distance=RaySettings(obj)
                Progress('Projecting',channel=channel,target=obj.name,part=part,index=index,total=len(low))
                oldMaterials=list(obj.data.materials);oldIndices=[p.material_index for p in obj.data.polygons]
                obj.data.materials.clear();obj.data.materials.append(targetMaterial)
                for p in obj.data.polygons:p.material_index=0
                obj.data.uv_layers.active=obj.data.uv_layers['GameUV']
                obj.data.uv_layers['GameUV'].active_render=True
                for selected in list(bpy.context.selected_objects):selected.select_set(False)
                obj.hide_render=False;obj.hide_set(False);obj.select_set(True)
                for highObj in high:
                    highObj.hide_render=False;highObj.hide_set(False);highObj.select_set(True)
                bpy.context.view_layer.objects.active=obj;bpy.context.view_layer.update()
                try:
                    with bpy.context.temp_override(active_object=obj,object=obj,selected_objects=[obj,*high],selected_editable_objects=[obj,*high]):
                        bpy.ops.object.bake(type='NORMAL' if channel=='Normal' else 'EMIT',
                            use_clear=index==0,margin=0,use_selected_to_active=True,
                            cage_extrusion=extrusion,max_ray_distance=distance)
                finally:
                    obj.data.materials.clear()
                    for mat in oldMaterials:obj.data.materials.append(mat)
                    for p,mi in zip(obj.data.polygons,oldIndices):p.material_index=mi
                    for highObj in high:highObj.hide_render=True;highObj.hide_set(True)
                    obj.hide_render=True;obj.hide_set(True)
                image.filepath_raw=str(path);image.file_format='PNG';image.save()
                progress['completed'].append({'channel':channel,'target':obj.name})
            for mat in sourceMaterials:
                output,oldLinks=savedOutputs[mat];links=mat.node_tree.links
                for link in list(output.inputs['Surface'].links):links.remove(link)
                for a,b in oldLinks:links.new(a,b)
                for n in added[mat]:mat.node_tree.nodes.remove(n)
                added[mat].clear()
            Progress('ChannelSaved',channel=channel,path=str(path))
        Progress('Complete',elapsed=time.time()-progress['started'])
        return record
    finally:
        for mat,(output,oldLinks) in savedOutputs.items():
            links=mat.node_tree.links
            for link in list(output.inputs['Surface'].links):links.remove(link)
            for a,b in oldLinks:links.new(a,b)
            for n in added[mat]:mat.node_tree.nodes.remove(n)
        for o,(render,viewport)in savedVisibility.items():o.hide_render=render;o.hide_set(viewport)


if __name__=='__main__':
    BakeGame(bpy.data.objects['Pack_Root'],Path(bpy.context.scene['SichuanGameOutput'])/'Bake')
