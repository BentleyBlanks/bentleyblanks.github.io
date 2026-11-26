"""Photograph the exported exterior in matched studio and grazing light."""
import bpy
import hashlib
import json
import os
from pathlib import Path
from mathutils import Vector

archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive/'ExteriorFinish_20261122'
bakeDirectory = Path(os.environ.get('HANYANG_BAKE_OUTPUT_DIR', revision))
output = bakeDirectory/'Review'
output.mkdir(exist_ok=True)
saveOnly = os.environ.get('HANYANG_REVIEW_SAVE_ONLY') == '1'
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve().parent in (revision.resolve(), bakeDirectory.resolve())
poses = {'Side':((0,.37,-.02),(1,0,.04),1.36), 'Receiver':((0,.163,.015),(1,-.09,.20),.328),'Band':((0,.584,.035),(1,-.13,.27),.073),'GuardRaking':((0,.129,-.003),(.78,-.50,-.44),.216),'BandRaking':((0,.584,.035),(1,-.13,.27),.073)}
sources=[('After','Model_HanYang173R.glb')]
poses.update(ForeWood=((0,.408,.034),(1,-.06,.12),.415),UnderWood=((0,.033,-.016),(.83,-.30,-.49),.180))
poses.update(Knob=((.0515,.1468,.0419),(1,-.09,.20),.058),KnobRaking=((.0515,.1468,.0419),(1,-.09,.20),.058))
poses.update(RearSeam=((0,.137,.035),(.64,-1.,.57),.254),ButtCap=((0,-.224,-.043),(.72,-1.,.22),.195),FrontSeam=((0,.901,.034),(-.72,.93,.36),.14))
poses.update(StockTop=((0,-.048,-.005),(.10,-.035,1.),.445))
poses['StockTopStrip']=poses['StockTop']
poses['ForeEndFinish']=((0,.751,.030),(1,-.04,.19),.255)
poses['ForeEndFinishRaking']=poses['ForeEndFinish']
poses['ForeEndSideBox']=poses['ForeEndFinish']
poses['FrontBandSide']=((0,.9013,.030),(-1,-.05,.16),.085)
poses['FrontBandProfile']=((0,.9013,.028),(1,-.04,.12),.118)
poses['RearBandProfile']=((0,.585,.028),(1,-.04,.12),.118)
poses['RearBandReverse']=((0,.585,.031),(-1,-.04,.17),.082)
poses['RearBandReverseRaking']=poses['RearBandReverse']
poses['MidSteel']=((0,.171,.042),(1,-.04,.17),.214)
poses['MidSteelRaking']=poses['MidSteel']
poses['StockFlank']=((0,-.154,-.045),(1,-.015,.10),.269)
poses['ForeWoodRaking']=poses['ForeWood']
poses['StockFlankRaking']=poses['StockFlank']
poses['BandTrim']=((0,.582,.012),(1,-.16,-.13),.059)
poses['StockTrim']=((0,-.0438,-.035),(1,-.21,-.16),.072)
poses['BandStrip']=((.010,.615,.028),(1,-.10,.26),.095)
poses['BandTrimRaking']=poses['BandTrim']
poses['SightEdges']=((0,.350,.060),(1.,.28,.78),.105)
poses['CollarEdges']=((0,.245,.052),(1.,.31,.66),.105)


def FrameReviewCamera(camera,view):
    center,direction,extent=poses[view];direction=Vector(direction).normalized()
    camera.location=Vector(center)+direction
    rotation=(-direction).to_track_quat('-Z','Y')
    if view.startswith('StockTop'):
        from mathutils import Matrix
        right=(Vector((0,1,0))-direction*direction.y).normalized()
        rotation=Matrix((right,direction.cross(right),direction)).transposed().to_quaternion()
    camera.rotation_euler=rotation.to_euler();camera.data.ortho_scale=extent
if not saveOnly and (revision/'ReviewInput.glb').is_file() and not any(output.glob('Before_*.png')):
    sources.insert(0,('Before','ReviewInput.glb'))
for label, source in sources:
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    modelPath = bakeDirectory/source if label == 'After' else revision/source
    bpy.ops.import_scene.gltf(filepath=str(modelPath), merge_vertices=False)
    scene=bpy.context.scene
    with modelPath.open('rb') as glb:
        header=glb.read(20)
        metadata=json.loads(glb.read(int.from_bytes(header[12:16],'little')))['asset']
    if not metadata.get('extras',{}).get('calibratedBaseColor'):
        gains=json.loads((archive/'ReferenceMaterials_20261113/Data_RuntimeGains.json').read_text())
        for obj in scene.objects:
            tree=obj.active_material.node_tree
            shader=next(node for node in tree.nodes if node.type=='BSDF_PRINCIPLED')
            socket=shader.inputs['Base Color']
            previous=socket.links[0].from_socket
            multiply=tree.nodes.new('ShaderNodeVectorMath')
            multiply.operation='MULTIPLY'
            multiply.label='Game base gain'
            multiply.inputs[1].default_value=gains[obj.name]
            tree.links.new(previous,multiply.inputs[0])
            tree.links.new(multiply.outputs[0],socket)
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=False
    bpy.context.preferences.addons['cycles'].preferences.compute_device_type='NONE'
    scene.cycles.device='CPU'
    scene.render.threads_mode='FIXED';scene.render.threads=6
    world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True;tree=world.node_tree;back=next(node for node in tree.nodes if node.type=='BACKGROUND');env=tree.nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(Path(bpy.utils.system_resource('DATAFILES'))/'studiolights/world/studio.exr'));tree.links.new(env.outputs[0],back.inputs[0]);back.inputs[1].default_value=.8
    pathNode=tree.nodes.new('ShaderNodeLightPath');mix=tree.nodes.new('ShaderNodeMixShader');color=tree.nodes.new('ShaderNodeBackground');color.inputs[0].default_value=(.20,.21,.20,1);tree.links.new(pathNode.outputs['Is Camera Ray'],mix.inputs[0]);tree.links.new(back.outputs[0],mix.inputs[1]);tree.links.new(color.outputs[0],mix.inputs[2]);tree.links.new(mix.outputs[0],next(node for node in tree.nodes if node.type=='OUTPUT_WORLD').inputs[0]);
    for location,energy,length,width in [((.6,.2,.75),42,1.8,.35),((-.55,.50,.30),25,1.3,.2),((.50,.4,-.35),12,.95,.13)]:
        bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.rotation_euler=(Vector((0,.35,.015))-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=energy;light.data.shape='RECTANGLE';light.data.size=length;light.data.size_y=width
    bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.clip_start=.01;scene.camera=camera
    scene.render.resolution_x=1000;scene.render.resolution_y=667;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'
    originalLights=[(item,item.location.copy(),item.data.energy,item.data.size,item.data.size_y,item.rotation_euler.copy()) for item in scene.objects if item.type=='LIGHT']
    if label=='After':
        camera.name='Review_Side'
        for view in ('Side','Receiver','Band','ForeWood','UnderWood','Knob','RearSeam','ButtCap','FrontSeam','StockTop','ForeEndFinish','FrontBandSide','RearBandReverse','MidSteel','StockFlank','BandTrim','StockTrim','BandStrip','FrontBandProfile','RearBandProfile','SightEdges','CollarEdges'):
            target=camera if view=='Side' else camera.copy()
            if target!=camera:
                target.data=camera.data.copy();target.name='Review_'+view;scene.collection.objects.link(target)
            FrameReviewCamera(target,view)
        scene.camera=bpy.data.objects['Review_Band'];scene['gameAssetSha256']=hashlib.sha256(modelPath.read_bytes()).hexdigest()
        scene.render.filepath='//Review/Review_Render.png'
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.overlay.show_overlays=False
                shading=area.spaces.active.shading;shading.type='MATERIAL';shading.use_scene_lights=True;shading.use_scene_world=True
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(bakeDirectory/'Scene_HanYangExterior.blend'))
        if saveOnly:
            break
        scene.camera=camera
    firstViews=('FrontBandProfile','RearBandProfile','MidSteel','Receiver','Band','BandRaking','FrontBandSide','Knob','MidSteelRaking','ForeEndFinish','ForeEndSideBox')
    for view in (*firstViews,*(name for name in poses if name not in firstViews)):
        center,direction,extent=poses[view]
        closeMetal=view in ('Band','BandRaking','Knob','KnobRaking','FrontBandSide','RearBandReverse','RearBandReverseRaking','FrontBandProfile','RearBandProfile')
        scene.cycles.samples=72 if closeMetal else 24
        scene.cycles.use_denoising=not closeMetal
        raking=view.endswith('Raking')
        strip=view=='StockTopStrip'
        sideBox=view=='ForeEndSideBox'
        color.inputs[0].default_value=(.20,.21,.20,1) if raking else (4,4,4,1)
        back.inputs[1].default_value=.22 if sideBox else .26 if strip else .29 if raking else .8
        for index,(light,position,energy,length,width,rotation) in enumerate(originalLights):
            light.location=position;light.rotation_euler=rotation;light.data.energy=energy;light.data.size=length;light.data.size_y=width
            if raking and index==0:
                light.location=Vector((.27,.76,.42));light.rotation_euler=(Vector(center)-light.location).to_track_quat('-Z','Y').to_euler();light.data.size_y=.08
            if raking and index>0:light.data.energy=energy*.32
            if strip:
                light.data.energy=0
                if index==0:
                    light.location=Vector((-.11,-.09,.34));light.rotation_euler=(Vector((0,-.09,0))-light.location).to_track_quat('-Z','Y').to_euler()
                    light.data.size=.023;light.data.size_y=.56;light.data.energy=6
            if sideBox:
                light.data.energy=0
                if index==0:
                    light.location=Vector((.38,.76,-.015));light.rotation_euler=(Vector((0,.752,.026))-light.location).to_track_quat('-Z','Y').to_euler()
                    light.data.size=.17;light.data.size_y=.75;light.data.energy=17
        FrameReviewCamera(camera,view)
        scene.render.filepath=str(output/(label+'_'+view+'.png'));bpy.ops.render.render(write_still=True)
    if label=='After':
        scene.cycles.samples=24;scene.cycles.use_denoising=True
        color.inputs[0].default_value=(.20,.21,.20,1);back.inputs[1].default_value=.8
        for light,position,energy,length,width,rotation in originalLights:
            light.location=position;light.rotation_euler=rotation;light.data.energy=energy;light.data.size=length;light.data.size_y=width
        FrameReviewCamera(camera,'Side');scene.camera=bpy.data.objects['Review_Band']
        scene.render.filepath='//Review/Review_Render.png'
        receipt={'gameAssetSha256':scene['gameAssetSha256'],'views':{
            view:hashlib.sha256((output/('After_'+view+'.png')).read_bytes()).hexdigest() for view in poses}}
        (output/'Data_RenderReceipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
