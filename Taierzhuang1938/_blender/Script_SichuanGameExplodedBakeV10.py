"""Bake actual, direction-isolated high cloth surfaces with translated anchors.

The delivery geometry stays at its authored position. Temporary groups prevent
one layer of folded cloth from intercepting another layer's projection rays.
Complete high geometry remains present for ambient occlusion. No missed core
sample is filled or synthesized by this script.
"""
import bpy,json,time,hashlib,runpy
from pathlib import Path

PARTS=('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals')
CHANNELS=('Base','Normal','Roughness','Ao')


def Evidence(path):
    path=Path(path);data=path.read_bytes()
    return {'path':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def BakeExploded(root,reviewPath,parts=PARTS,channels=CHANNELS,resumeCompleted=False):
    scene=bpy.context.scene;repo=Path(scene['SichuanPackRepository'])
    assert scene.get('BlenderMcpTask')=='SichuanBlanketPack' and root.name=='Pack_Root'
    assert 'GameV10' in bpy.data.filepath
    folder=repo/'Taierzhuang1938/_blender';review=Path(reviewPath);review.mkdir(parents=True,exist_ok=True)
    channels=tuple(channels)
    assert channels and len(set(channels))==len(channels) and set(channels)<=set(CHANNELS)
    preserved={channel:Evidence(review/('Bake_'+channel+'.png')) for channel in CHANNELS if channel not in channels}
    prep=runpy.run_path(str(folder/'Script_SichuanGameExplodedMergedProjectionV10.py'))['PrepareExplodedPart']
    low=[o for o in root.children_recursive if o.type=='MESH']
    assert sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in low)<=3000
    def Part(obj):
        while obj.parent and obj.name not in PARTS:obj=obj.parent
        assert obj.name in PARTS
        return obj.name
    high={name:[o for o in (bpy.data.objects['High_'+name],*bpy.data.objects['High_'+name].children_recursive)
                if o.type=='MESH']for name in PARTS}
    def Sources(obj):
        exact=obj.get('SourceHighObject','');names=set(obj.get('BakeSourceNames','').split(','))-{''}
        chosen=[o for o in high[Part(obj)] if o.name==exact or o.get('PackSourceName',o.name) in names]
        if 'RepairPatch' in obj.name:
            chosen.extend(o for o in high[Part(obj)] if 'Stitch' in o.name or 'RepairThread' in o.name)
        supportName=obj.get('SupportHighObject','')
        if supportName:
            support=bpy.data.objects.get(supportName)
            assert support is not None,('Missing saved high support surface',obj.name,supportName)
            chosen.append(support)
        assert chosen,('Missing real high source',obj.name)
        return list(dict.fromkeys(chosen))
    sourceInfo=[]
    for name,objects in high.items():
        for obj in objects:
            materials=[]
            assert obj.data.materials and all(obj.data.materials[p.material_index] is not None for p in obj.data.polygons),('Source geometry has no persistent material',obj.name)
            for mat in obj.data.materials:
                if not mat:continue
                shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                socket=shader.inputs['Roughness']
                materials.append({'name':mat.name,'roughnessLinked':socket.is_linked,
                                  'roughnessDefault':float(socket.default_value)})
            assert materials,('Source material provenance is empty',obj.name)
            sourceInfo.append({'name':obj.name,'part':name,'materials':materials})
    record={'sourceBlend':Evidence(root['SourceBlend']),'sources':sourceInfo,'projection':[],
            'bakeScene':bpy.data.filepath,'resolution':2048,'method':'Geometrically direction-isolated exploded selected-to-active projection',
            'coordinateAnchorsAnalyticallyPreserved':True,'originalHighAndGamePositionsUnchanged':True,
            'highSupportGeometry':'Additional real textured source base faces under the sculpt; no pixel color or normal fallback',
            'sourceNormalOrRgbFlipped':False,'syntheticSurfaceFillPixels':0,'groups':[],
            'targetShading':'Flat low triangle basis; true high smooth geometric normals provide sculpted surface relief'}
    record['channelsProjectedThisPass']=list(channels)
    record['preservedRawChannels']=preserved
    if resumeCompleted:
        previous=json.loads((review/'Data_BakeProjection.json').read_text(encoding='utf-8'))
        completedParts=[group['part'] for group in previous['groups']]
        assert completedParts and len(set(completedParts))==len(completedParts)
        assert set(completedParts).isdisjoint(parts) and set(completedParts)|set(parts)==set(PARTS)
        assert previous['sourceBlend']==record['sourceBlend'] and previous['sources']==sourceInfo
        assert previous['channelsProjectedThisPass']==list(channels)==list(CHANNELS)
        record['groups']=previous['groups'];record['projection']=previous['projection']
        record['resumedCompletedParts']=completedParts
        record['rawImagesBeforeResume']={channel:Evidence(review/('Bake_'+channel+'.png'))for channel in channels}
    progress={'stage':'Starting','started':time.time(),'completed':[]}
    def Progress(stage,**kwargs):
        progress.update(stage=stage,**kwargs)
        (review/'Data_BakeProgress.json').write_text(json.dumps(progress,indent=2),encoding='utf-8')
        print('GAME_EXPLODED_BAKE_V10',json.dumps({k:v for k,v in progress.items()if k!='completed'}),flush=True)
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.device='CPU'
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8';scene.render.bake.normal_space='TANGENT'
    # Flat normals prevent a narrow ribbon's opposite folds cancelling its
    # interpolation normal. This is also the actual exported tangent basis.
    for obj in low:
        for polygon in obj.data.polygons:polygon.use_smooth=False
        obj.data.update()
    visibility={o:(o.hide_render,o.hide_get())for o in scene.objects if o.type=='MESH'}
    images={}
    for channel in channels:
        name='Bake_ExplodedV10_'+channel
        if bpy.data.images.get(name):bpy.data.images.remove(bpy.data.images[name])
        image=(bpy.data.images.load(str(review/('Bake_'+channel+'.png')),check_existing=False) if resumeCompleted
               else bpy.data.images.new(name,2048,2048,alpha=True,float_buffer=False))
        assert tuple(image.size)==(2048,2048)
        image.name=name
        if not resumeCompleted:image.generated_color=(0,0,0,0)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
        images[channel]=image
    targetMaterial=bpy.data.materials.new('Material_ExplodedV10_Target');targetMaterial.use_nodes=True
    targetNode=targetMaterial.node_tree.nodes.new('ShaderNodeTexImage');targetMaterial.node_tree.nodes.active=targetNode
    try:
        for obj in visibility:obj.hide_render=True;obj.hide_set(True)
        for partIndex,part in enumerate(parts):
            partLow=[obj for obj in low if Part(obj)==part]
            Progress('PreparingPart',part=part,index=partIndex,total=len(parts))
            group=prep(partLow,Sources,'ProjectionV10_'+part)
            target=group['targetObj'];sources=group['highObjs'];occluders=group.get('occluderObjects',[])
            assert sources and target.data.uv_layers.get('GameUV')
            target.data.uv_layers.active=target.data.uv_layers['GameUV'];target.data.uv_layers['GameUV'].active_render=True
            target.data.materials.clear();target.data.materials.append(targetMaterial)
            for p in target.data.polygons:p.material_index=0;p.use_smooth=False
            materials={m for o in sources for m in o.data.materials if m}
            saved={};added={m:[]for m in materials}
            for mat in materials:
                output=next(n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
                saved[mat]=(output,[(l.from_socket,l.to_socket)for l in output.inputs['Surface'].links])
            try:
                for channel in channels:
                    image=images[channel];targetNode.image=image
                    for mat in materials:
                        nodes,links=mat.node_tree.nodes,mat.node_tree.links;output,oldLinks=saved[mat]
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
                                ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=False;ao.inputs['Distance'].default_value=.025
                                mult=nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=.65
                                add=nodes.new('ShaderNodeMath');add.operation='ADD';add.inputs[1].default_value=.35
                                added[mat].extend((ao,mult,add));links.new(ao.outputs['AO'],mult.inputs[0])
                                links.new(mult.outputs[0],add.inputs[0]);links.new(add.outputs[0],emission.inputs['Color'])
                            links.new(emission.outputs[0],output.inputs['Surface'])
                    for obj in list(bpy.context.selected_objects):obj.select_set(False)
                    for obj in (target,*sources):obj.hide_render=False;obj.hide_set(False);obj.select_set(True)
                    for obj in occluders:obj.hide_render=channel not in ('Base','Ao');obj.hide_set(channel not in ('Base','Ao'));obj.select_set(False)
                    bpy.context.view_layer.objects.active=target;bpy.context.view_layer.update()
                    Progress('Projecting',part=part,channel=channel,sourceObjects=len(sources),triangles=len(target.data.polygons))
                    with bpy.context.temp_override(active_object=target,object=target,selected_objects=[target,*sources],selected_editable_objects=[target,*sources]):
                        bpy.ops.object.bake(type='NORMAL' if channel=='Normal' else 'EMIT',use_clear=partIndex==0 and not resumeCompleted,
                            margin=0 if channel=='Normal' else 2,use_selected_to_active=True,use_cage=False,cage_extrusion=.015,max_ray_distance=.045)
                    path=review/('Bake_'+channel+'.png');image.filepath_raw=str(path);image.file_format='PNG';image.save()
                    for mat,(output,oldLinks)in saved.items():
                        links=mat.node_tree.links
                        for link in list(output.inputs['Surface'].links):links.remove(link)
                        for a,b in oldLinks:links.new(a,b)
                        for node in added[mat]:mat.node_tree.nodes.remove(node)
                        added[mat].clear()
                    progress['completed'].append({'part':part,'channel':channel})
                    Progress('ChannelSaved',path=str(path))
                record['groups'].append({'part':part,**group['report']})
                for obj in partLow:
                    record['projection'].append({'target':obj.name,'part':part,'sources':[s.name for s in Sources(obj)],
                        'selectedToActive':True,'bakeType':'EMIT','temporaryCombinedTarget':target.name,
                        'targetTriangleCount':len(obj.data.polygons),'coordinateCompensation':'Original local points transformed analytically into original anchor coordinates; shared across translated groups'})
            finally:
                for mat,(output,oldLinks)in saved.items():
                    links=mat.node_tree.links
                    for link in list(output.inputs['Surface'].links):links.remove(link)
                    for a,b in oldLinks:links.new(a,b)
                group['cleanup']()
            (review/'Data_BakeProjection.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
        for channel,evidence in preserved.items():
            assert Evidence(evidence['path'])==evidence,('Unrequested channel changed during rebake',channel)
        Progress('Complete',elapsed=time.time()-progress['started'])
        return record
    finally:
        for obj,(render,viewport)in visibility.items():obj.hide_render=render;obj.hide_set(viewport)
