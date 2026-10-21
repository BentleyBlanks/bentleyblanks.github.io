"""Real high-to-low PBR projection onto unique new low UVs; no atlas inheritance claim."""
import bpy, json, hashlib, runpy, math, array, time
from pathlib import Path
from mathutils.bvhtree import BVHTree

PARTS=('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals')
BASE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')

def Evidence(file):
    p=Path(file).resolve();h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return {'path':str(p),'bytes':p.stat().st_size,'sha256':h.hexdigest()}

def GeometryOnly(mesh):
    h=hashlib.sha256()
    for seq,key,dim,code in [(mesh.vertices,'co',3,'f'),(mesh.loops,'vertex_index',1,'i'),(mesh.polygons,'loop_start',1,'i'),(mesh.polygons,'loop_total',1,'i'),(mesh.polygons,'material_index',1,'i')]:
        values=array.array(code,[0])*(len(seq)*dim);seq.foreach_get(key,values);h.update(values.tobytes())
    return h.hexdigest()

def Select(objects,active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=active

def NearestSurfaceCage(target,sources,offset=.00025):
    """Aim each cage-to-target ray through its actual nearest high surface."""
    vertices=[];faces=[]
    for source in sources:
        start=len(vertices);vertices.extend(source.matrix_world@v.co for v in source.data.vertices)
        faces.extend(tuple(start+i for i in p.vertices) for p in source.data.polygons)
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
    mesh=target.data.copy();inverse=target.matrix_world.inverted();distances=[]
    for vertex,original in zip(mesh.vertices,target.data.vertices):
        point=target.matrix_world@original.co;nearest,normal,index,distance=bvh.find_nearest(point)
        assert nearest is not None
        delta=nearest-point
        cagePoint=point-delta.normalized()*offset if delta.length>1e-7 else point+normal.normalized()*offset
        vertex.co=inverse@cagePoint;distances.append(distance)
    mesh.update();cage=bpy.data.objects.new('ProjectionNearestCage_'+target.name,mesh);bpy.context.scene.collection.objects.link(cage)
    cage.matrix_world=target.matrix_world.copy();cage.hide_render=True
    distances.sort()
    return cage,{'method':'Per-vertex nearest actual high triangle direction; cage offset opposite ray toward nearest surface','offsetM':offset,'sourceObjects':[o.name for o in sources],'maximumNearestDistanceM':max(distances),'p95NearestDistanceM':distances[int(.95*(len(distances)-1))]}

def PrepareProjection(repo,outputDir,sourceLowBlend=None,sourceHighRuntime=None,sourceHighBlend=None,workFile=None,strawBuilder=None):
    repo,outputDir=Path(repo),Path(outputDir);outputDir.mkdir(parents=True,exist_ok=True)
    sourceLowBlend=Path(sourceLowBlend) if sourceLowBlend is not None else BASE/'Lod40kV13/Scene_SichuanPackLod40kV13.blend'
    sourceHighRuntime=Path(sourceHighRuntime) if sourceHighRuntime is not None else BASE/'QualityV12/Exports/Model_SichuanBlanketPackQualityV12.glb'
    sourceHighBlend=Path(sourceHighBlend) if sourceHighBlend is not None else BASE/'QualityV12/Scene_SichuanPackQualityV12.blend'
    workFile=Path(workFile) if workFile is not None else BASE/'Lod40kV13/Work/Scene_SichuanPackProjectionWorkV13.blend'
    bpy.ops.wm.open_mainfile(filepath=str(sourceLowBlend))
    scene=bpy.context.scene;scene['SichuanPackRepository']=str(repo);scene['BlenderMcpTask']='SichuanBlanketPack'
    low=bpy.data.objects['Pack_Root'];original=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceHighRuntime),merge_vertices=True)
    imported=set(bpy.data.objects)-original
    high=next(o for o in imported if o.parent is None and o.name.startswith('Pack_Root'))
    helper=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    roles=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityLod40kV13.py'))
    roles['TagQualityRoles'](high)
    highParts={p:[o for child in high.children if child.get('QualityPartRole',child.name.split('.')[0])==p for o in [child,*child.children_recursive] if o.type=='MESH'] for p in PARTS}
    for o in [high,*high.children_recursive]:
        o['QualityOriginalName']=o.get('QualityOriginalName',o.name.split('.')[0]);o.name='HighProjection_'+o['QualityOriginalName']
    structuredReport=strawBuilder(high,low) if strawBuilder else None
    records=[];partCounts={}
    for role in PARTS:
        part=next(c for c in low.children if c.name==role)
        allOwned=[part,*part.children_recursive];ownedNames=[o.name for o in allOwned];meshes=[o for o in allOwned if o.type=='MESH']
        count=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
        Select(meshes,meshes[0])
        with bpy.context.temp_override(object=meshes[0],active_object=meshes[0],selected_objects=meshes,selected_editable_objects=meshes):bpy.ops.object.join()
        merged=bpy.context.view_layer.objects.active;world=merged.matrix_world.copy();merged.parent=low;merged.matrix_world=world
        for name in ownedNames:
            o=bpy.data.objects.get(name)
            if o and o!=merged:bpy.data.objects.remove(o,do_unlink=True)
        merged.name=role;merged['QualityOriginalName']=role;merged['QualityPartRole']=role
        material=highParts[role][0].material_slots[0].material.copy();material.name='Material_QualityPbrV12_ProjectedV13_'+role
        merged.data.materials.clear();merged.data.materials.append(material)
        for face in merged.data.polygons:face.material_index=0
        merged.data.validate(verbose=False,clean_customdata=False);merged.data.update()
        before=helper['MeshEvidence'](merged.data);before['geometryOnlySha256']=GeometryOnly(merged.data)
        Select([merged],merged)
        with bpy.context.temp_override(object=merged,active_object=merged,selected_objects=[merged],selected_editable_objects=[merged]):
            bpy.ops.object.mode_set(mode='EDIT')
        with bpy.context.temp_override(object=merged,active_object=merged,edit_object=merged,selected_objects=[merged],selected_editable_objects=[merged]):
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=.004,area_weight=0,correct_aspect=True,scale_to_bounds=False)
        with bpy.context.temp_override(object=merged,active_object=merged,selected_objects=[merged],selected_editable_objects=[merged]):
            bpy.ops.object.mode_set(mode='OBJECT')
        merged.data.uv_layers.active.name='ProjectionUV'
        for node in material.node_tree.nodes:
            if node.type=='UVMAP':node.uv_map='ProjectionUV'
            if node.type=='NORMAL_MAP':node.uv_map='ProjectionUV'
        after=helper['MeshEvidence'](merged.data);after['geometryOnlySha256']=GeometryOnly(merged.data)
        assert before['geometryOnlySha256']==after['geometryOnlySha256']
        assert after['triangles']==count
        partCounts[role]=count
        records.append({'kind':'Low','part':role,'originalName':role,'object':role,'beforeReunwrap':before,'afterReunwrap':after})
    assert sum(partCounts.values())<=40000
    scene['ProjectionHighRoot']=high.name;scene['SichuanLowRoot']=low.name
    scene['ProjectionOutput']=str(outputDir)
    state={'generator':'SichuanLodProjectionPreparationV13','sourceLowBlend':Evidence(sourceLowBlend),'sourceHighRuntime':Evidence(sourceHighRuntime),'sourceHighBlend':Evidence(sourceHighBlend),'structuredStrawReport':structuredReport,'objects':records,'partTriangles':partCounts,'totalTriangles':sum(partCounts.values()),'lowRoot':low.name,'highRoot':high.name}
    (outputDir/'Data_ProjectionPreparationV13.json').write_text(json.dumps(state,indent=2)+'\n')
    workFile.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(workFile),compress=True)
    print('PROJECTION_PREPARED',json.dumps({'triangles':state['totalTriangles'],'parts':partCounts}))
    return state

def FindImage(material,channel):
    token={'Base':'_Base','Orm':'_Orm','Normal':'_Normal'}[channel]
    nodes=[n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and token in n.image.name]
    assert nodes,(material.name,channel)
    return nodes[0]

def AssignImage(material,channel,image):
    token={'Base':'_Base','Orm':'_Orm','Normal':'_Normal'}[channel]
    nodes=[n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and token in n.image.name]
    assert nodes,(material.name,channel)
    for node in nodes:node.image=image
    return len(nodes)

def EmissionMaterial(original,channel):
    m=original.copy();m.name='ProjectionSample_'+channel
    tree=m.node_tree;image=FindImage(m,channel);out=next(n for n in tree.nodes if n.type=='OUTPUT_MATERIAL')
    emitter=tree.nodes.new('ShaderNodeEmission');emitter.inputs['Strength'].default_value=1
    tree.links.new(image.outputs['Color'],emitter.inputs['Color']);tree.links.new(emitter.outputs[0],out.inputs['Surface'])
    return m

def BakeProjection(repo,outputDir,resolution=4096,partSubset=None,samples=4):
    repo,outputDir=Path(repo),Path(outputDir);started=time.time();scene=bpy.context.scene
    state=json.loads((outputDir/'Data_ProjectionPreparationV13.json').read_text())
    high=bpy.data.objects[scene['ProjectionHighRoot']];low=bpy.data.objects['Pack_Root']
    helper=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    export=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanLodExportV13.py'))
    highParts=export['PartObjects'](high)
    chosen=list(partSubset or PARTS);atlases={};objects=[];passes=[]
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=samples
    scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.margin=16
    scene.render.bake.cage_extrusion=.005;scene.render.bake.max_ray_distance=.012
    for obj in [high,*high.children_recursive,*low.children_recursive]:obj.hide_render=False;obj.hide_set(False)
    for role in chosen:
        target=bpy.data.objects[role];sources=highParts[role];before=helper['MeshEvidence'](target.data)
        highBefore={o:helper['MeshEvidence'](o.data) for o in sources}
        originalSlots={o:[s.material for s in o.material_slots] for o in sources}
        materialBefore={m:helper['MaterialEvidence'](m) for slots in originalSlots.values() for m in slots}
        material=target.material_slots[0].material;images={};outputDir.mkdir(parents=True,exist_ok=True)
        targetNode=material.node_tree.nodes.new('ShaderNodeTexImage');targetNode.name='ActualProjectionBakeTarget'
        try:
            for channel in ('Base','Orm','Normal'):
                image=bpy.data.images.new('Texture_ProjectedV13_'+role+'_'+channel,width=resolution,height=resolution,alpha=True,float_buffer=False)
                image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
                image.generated_color=(0,0,0,0);targetNode.image=image;material.node_tree.nodes.active=targetNode
                for o,slots in originalSlots.items():
                    for slot,original in zip(o.material_slots,slots):slot.material=original if channel=='Normal' else EmissionMaterial(original,channel)
                Select([*sources,target],target)
                progress={'generator':'SichuanLodProjectionBakeV13','stage':'Baking','part':role,'channel':channel,'resolution':resolution,'completedParts':list(atlases)}
                (outputDir/'Data_ProjectionProgressV13.json').write_text(json.dumps(progress,indent=2)+'\n')
                with bpy.context.temp_override(object=target,active_object=target,selected_objects=[*sources,target],selected_editable_objects=[*sources,target]):
                    if channel=='Normal':bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_selected_to_active=True,use_clear=True,margin=16,cage_extrusion=.005,max_ray_distance=.012)
                    else:bpy.ops.object.bake(type='EMIT',use_selected_to_active=True,use_clear=True,margin=16,cage_extrusion=.005,max_ray_distance=.012)
                image.filepath_raw=str(outputDir/(image.name+'.png'));image.file_format='PNG';image.save()
                file=Path(image.filepath_raw);actual=bpy.data.images.load(str(file),check_existing=False);actual.colorspace_settings.name=image.colorspace_settings.name;actual.pack()
                AssignImage(material,channel,actual)
                images[channel]={**Evidence(file),'width':resolution,'height':resolution,'colourSpace':'sRGB' if channel=='Base' else 'Non-Color','targetUvCentroidCoverage':helper['LowWorldCoverage'](target,actual)}
                passes.append({'part':role,'channel':channel,'selectedToActive':True,'cageExtrusionM':.005,'maxRayDistanceM':.012})
                print('PROJECTION_BAKED',role,channel,flush=True)
        finally:
            for o,slots in originalSlots.items():
                for slot,original in zip(o.material_slots,slots):slot.material=original
            material.node_tree.nodes.remove(targetNode)
        after=helper['MeshEvidence'](target.data);assert before==after
        prep=next(r for r in state['objects'] if r['part']==role)
        objects.append({**prep,'before':before,'after':after})
        for o in sources:
            afterHigh=helper['MeshEvidence'](o.data);assert highBefore[o]==afterHigh
            slotsBefore=[materialBefore[m] for m in originalSlots[o]]
            slotsAfter=[helper['MaterialEvidence'](s.material) for s in o.material_slots]
            assert slotsBefore==slotsAfter
            objects.append({'kind':'High','part':role,'originalName':export['Name'](o),'before':highBefore[o],'after':afterHigh,'materialSlotsBefore':slotsBefore,'materialSlotsAfter':slotsAfter})
        atlases[role]={'images':images}
        (outputDir/'Data_ProjectionPartialV13.json').write_text(json.dumps({'atlases':atlases,'objects':objects},indent=2)+'\n')
    result={'generator':'SichuanLodProjectionBakeV13','materialBakeMode':'projected-high-to-low-new-uv','partSubset':chosen,'uvReunwrapPerformed':True,'samples':samples,'normalSpace':'TANGENT','pixelPaintingUsed':False,'highGeometryUvAndMaterialsUnchanged':True,'partialProbe':set(chosen)!=set(PARTS),'resolutionPerPart':[resolution,resolution],'selectedToActive':True,'rayProjectionUsed':True,'sourceHighRuntime':state['sourceHighRuntime'],'sourceHighBlend':state['sourceHighBlend'],'sourceLowPreparation':Evidence(outputDir/'Data_ProjectionPreparationV13.json'),'originalHighAtlasBytesClaimedInherited':False,'objects':objects,'atlases':atlases,'passes':passes,'seconds':time.time()-started}
    (outputDir/'Data_ProjectionBakeV13.json').write_text(json.dumps(result,indent=2)+'\n')
    print('PROJECTION_COMPLETE',json.dumps({'parts':chosen,'resolution':resolution,'seconds':result['seconds']}))
    return result
