"""Reproject the material study onto unique production UVs and bake real AO."""
import bpy
import math
import subprocess
import shutil
import json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def BakeSurfaces(packRoot,projectPath,reviewPath):
    scene=bpy.context.scene
    meshes=[obj for obj in packRoot.children_recursive if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
        obj.data.uv_layers.active.name='SurfaceUV'
        obj.data.uv_layers.new(name='GameUV')
        obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
        obj.data.uv_layers.active.active_render=True
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.008,area_weight=.4,correct_aspect=True,scale_to_bounds=False)
    bpy.ops.uv.seams_from_islands(mark_seams=True,mark_sharp=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    facePriorities={}
    for obj in meshes:
        priorities={polygon.index:.40 if 'ClothButton' in obj.name else 1.10 for polygon in obj.data.polygons}
        if obj.name=='Pack_Bundle':
            bvh=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
            directions=[Vector(value) for value in ((0,-1,0),(0,1,0),(1,0,0),(-1,0,0),(0,0,1),(0,0,-1))]
            for polygon in obj.data.polygons:
                center=polygon.center
                visible=[]
                for index,direction in enumerate(directions):
                    hit=bvh.ray_cast(center+direction*.6,-direction,1.2)
                    if hit[0] is not None and (hit[0]-center).length<.00035:visible.append(index)
                priorities[polygon.index]=1.90 if 0 in visible and polygon.normal.y<-.35 else 1.10 if 1 in visible and polygon.normal.y>.35 else 1.35 if visible else .20
        elif 'ClothButton' in obj.name:
            for polygon in obj.data.polygons:
                priorities[polygon.index]=1.70 if polygon.center.y<-.105 else .40
        facePriorities[obj.name]=priorities
        edgeOwners={edge.index:[] for edge in obj.data.edges}
        keys={tuple(sorted(edge.vertices)):edge.index for edge in obj.data.edges}
        for polygon in obj.data.polygons:
            for key in polygon.edge_keys:edgeOwners[keys[tuple(sorted(key))]].append(polygon.index)
        for edge in obj.data.edges:
            owners=edgeOwners[edge.index]
            if len({priorities[index] for index in owners})>1:edge.use_seam=True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.unwrap(method='MINIMUM_STRETCH',margin=.001)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    allocation=[]
    for obj in meshes:
        priorities=facePriorities[obj.name]
        keys={tuple(sorted(edge.vertices)):edge.index for edge in obj.data.edges}
        owners={edge.index:[] for edge in obj.data.edges}
        for polygon in obj.data.polygons:
            for key in polygon.edge_keys:owners[keys[tuple(sorted(key))]].append(polygon.index)
        neighbors={polygon.index:set() for polygon in obj.data.polygons}
        for edge in obj.data.edges:
            if edge.use_seam:continue
            for a in owners[edge.index]:neighbors[a].update(b for b in owners[edge.index] if a!=b)
        unseen=set(neighbors)
        while unseen:
            seed=unseen.pop();island={seed};stack=[seed]
            while stack:
                for index in neighbors[stack.pop()]:
                    if index in unseen:unseen.remove(index);island.add(index);stack.append(index)
            area=sum(obj.data.polygons[index].area for index in island)
            hiddenArea=sum(obj.data.polygons[index].area for index in island if priorities[index]==.20)
            internal=hiddenArea>area*.8
            priority=sum(obj.data.polygons[index].area*priorities[index] for index in island)/max(area,1e-9)
            loopIds={loop for index in island for loop in obj.data.polygons[index].loop_indices}
            for index in loopIds:obj.data.uv_layers.active.data[index].uv*=priority
            allocation.append({'object':obj.name,'faces':len(island),'areaM2':area,'hiddenAreaM2':hiddenArea,'priority':priority,'internal':internal})
    (Path(reviewPath)/'Data_UvVisibilityAllocation.json').write_text(json.dumps(allocation,indent=2),encoding='utf-8')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.pack_islands(rotate=True,margin=.0030,margin_method='FRACTION',shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    uvRows=[]
    for obj in meshes:
        obj.data.calc_loop_triangles();layer=obj.data.uv_layers['GameUV']
        for triangle in obj.data.loop_triangles:
            sourceMaterial=obj.data.materials[obj.data.polygons[triangle.polygon_index].material_index]
            uvRows.append({'uv':[[float(layer.data[index].uv.x),float(1-layer.data[index].uv.y)] for index in triangle.loops],'material':sourceMaterial.name,'region':sourceMaterial.get('AtlasRegion','cloth')})
    (Path(reviewPath)/'Data_SurfaceUv.json').write_text(json.dumps(uvRows),encoding='utf-8')
    materials=set(material for obj in meshes for material in obj.data.materials)
    saved={}
    for material in materials:
        nodes,links=material.node_tree.nodes,material.node_tree.links
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV'
        for node in list(nodes):
            if node.bl_idname=='ShaderNodeUVMap':node.uv_map='SurfaceUV'
            if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:links.new(uv.outputs['UV'],node.inputs['Vector'])
            if node.bl_idname=='ShaderNodeNormalMap':node.uv_map='SurfaceUV'
        shader=next(node for node in nodes if node.type=='BSDF_PRINCIPLED')
        output=next(node for node in nodes if node.type=='OUTPUT_MATERIAL')
        saved[material]=(shader,output)
    for obj in meshes:
        for material in obj.data.materials:
            for node in material.node_tree.nodes:
                if node.bl_idname=='ShaderNodeUVMap' and node.uv_map and obj.data.uv_layers.get(node.uv_map) is None:
                    raise RuntimeError('Missing named material UV: '+obj.name+' / '+material.name+' / '+node.uv_map)
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.cycles.device='CPU'
    scene.render.bake.use_selected_to_active=False
    scene.render.bake.margin=10
    baked={}
    for kind in ('Base','Normal','Ao'):
        image=bpy.data.images.new('SurfaceBake_'+kind,2048,2048,alpha=False)
        image.colorspace_settings.name='sRGB' if kind=='Base' else 'Non-Color'
        image.generated_color=(.5,.5,1,1) if kind=='Normal' else (1,1,1,1)
        for material in materials:
            shader,output=saved[material]
            nodes,links=material.node_tree.nodes,material.node_tree.links
            target=nodes.new('ShaderNodeTexImage');target.image=image
            nodes.active=target
            if kind=='Base':
                emission=nodes.new('ShaderNodeEmission')
                source=shader.inputs['Base Color'].links[0].from_socket
                if material.get('AtlasRegion')=='cloth':
                    soften=nodes.new('ShaderNodeMixRGB');soften.inputs[0].default_value=.18
                    soften.inputs[2].default_value=(.45,.42,.37,1)
                    links.new(source,soften.inputs[1]);source=soften.outputs[0]
                links.new(source,emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
            elif kind=='Ao':
                ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=material.get('AtlasRegion')!='cloth'
                ao.inputs['Distance'].default_value=.025
                weight=.25 if material.get('AtlasRegion')=='jacket' else .75
                multiply=nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';multiply.inputs[1].default_value=weight
                add=nodes.new('ShaderNodeMath');add.operation='ADD';add.inputs[1].default_value=1-weight
                emission=nodes.new('ShaderNodeEmission')
                links.new(ao.outputs['AO'],multiply.inputs[0]);links.new(multiply.outputs[0],add.inputs[0]);links.new(add.outputs[0],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
            else:links.new(shader.outputs['BSDF'],output.inputs['Surface'])
        bpy.ops.object.bake(type='NORMAL' if kind=='Normal' else 'EMIT',use_clear=True,margin=4)
        image.filepath_raw=str(Path(reviewPath)/('SurfaceBake_'+kind+'.png'));image.file_format='PNG';image.save()
        baked[kind]=image.filepath_raw
        print('SURFACE_BAKED',kind,flush=True)
    python=shutil.which('python')
    subprocess.run([python,str(Path(projectPath)/'_import/Script_SichuanPackSurfaceMaps.py'),'--project',str(projectPath),'--review',str(reviewPath)],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    return BindBakedMaterial(packRoot,projectPath)


def BindBakedMaterial(packRoot,projectPath):
    meshes=[obj for obj in packRoot.children_recursive if obj.type=='MESH']
    material=bpy.data.materials.new('Material_SichuanPackBaked');material.use_nodes=True
    material['AtlasRegion']='surface';material['UvSet']='GameUV'
    nodes,links=material.node_tree.nodes,material.node_tree.links
    nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');links.new(shader.outputs[0],output.inputs['Surface'])
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='GameUV'
    images={}
    for channel in ('Base','Normal','Orm'):
        image=bpy.data.images.load(str(Path(projectPath)/'Model/SichuanBlanketPack'/('Texture_SichuanBlanketPack'+channel+'.webp')),check_existing=False)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';image.pack();images[channel]=image
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;links.new(uv.outputs['UV'],texture.inputs['Vector'])
        if channel=='Base':links.new(texture.outputs['Color'],shader.inputs['Base Color'])
        elif channel=='Normal':
            normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GameUV';links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
        else:
            separate=nodes.new('ShaderNodeSeparateColor');links.new(texture.outputs['Color'],separate.inputs[0]);links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
            group=nodes.new('ShaderNodeGroup');group.node_tree=bpy.data.node_groups['glTF Material Output'];links.new(separate.outputs['Red'],group.inputs['Occlusion'])
    for obj in meshes:
        obj.data.materials.clear();obj.data.materials.append(material)
        for polygon in obj.data.polygons:polygon.material_index=0
    packRoot['SurfaceBake']='Unique GameUV; imagegen material albedo, tangent normals and self-occlusion baked with Cycles'
    return images
