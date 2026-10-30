"""Editable gray calibration surfaces, never a complete Type94 vehicle.

Run in a separate Script_BlenderMcp factory batch. Source and QA renders stay
outside the repository. No existing source mesh is loaded, deformed or replaced.
"""
import bpy,json,math,os
from pathlib import Path
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view

repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=base/'EnvelopeV47';(root/'Exports').mkdir(parents=True,exist_ok=True);(root/'Acceptance').mkdir(exist_ok=True)
assert not bpy.data.filepath,'Envelope generation needs an isolated factory batch'
layout=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_ReferenceEnvelopeV47.json').read_text(encoding='utf-8'))
assert layout['schema']=='Type94ReferenceEnvelopeLayoutV1' and not layout['completeVehicle']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';scene['ReferenceEnvelopeOnly']=True
scene['CompleteVehicle']=False;scene['HistoricalShapeAccepted']=False
scene['ReferenceEnvelopeLayout']=json.dumps(layout)
g=layout['shapeParameters'];q=layout['circularParameters'];ground=layout['groundOffsetM']
material=bpy.data.materials.new('Material_Type94EnvelopeGray');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.20,.20,.20,1);shader.inputs['Roughness'].default_value=.65


def Mesh(name,vertices,faces):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(material)
    obj['CalibrationEnvelopeOnly']=True
    return obj


def Ring(name,points,radius=.0014):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for target,point in zip(spline.points,points):target.co=(*point,1)
    spline.use_cyclic_u=True
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.data.materials.append(material);obj['CalibrationEnvelopeOnly']=True
    return obj


def Point(name,position,radius=.004):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=radius,location=position)
    obj=bpy.context.object;obj.name=name;obj.data.materials.append(material);obj['OpticalCandidateOnly']=True
    return obj


tx,ty,deck=g['TurretCenterX'],g['TurretCenterY'],g['RearDeckZ']
roof=q['RoofZBeforeGround'];radius=q['RoofRadius'];slope=q['ConeSlope'];bottom=deck+.105
upper=roof-.017;bottomRadius=radius+slope*(roof-bottom);upperRadius=radius+slope*(roof-upper)
profile=[(bottomRadius-.008,bottom),(bottomRadius,bottom),(upperRadius,upper),
    (radius-.006,roof-.008),(radius-.006,roof),(radius,roof),(radius,roof-.008),
    (radius-.008,roof-.008),(upperRadius-.008,upper),(bottomRadius-.008,bottom)]
segments=96;vertices=[];faces=[]
for r,z in profile:
    for i in range(segments):
        angle=i*math.tau/segments;x=r*math.cos(angle);y=min(r*math.sin(angle),r*.90)
        vertices.append((tx+x,ty+y,z+ground))
for row in range(len(profile)-1):
    for i in range(segments):
        a=row*segments+i;b=row*segments+(i+1)%segments;c=(row+1)*segments+(i+1)%segments;d=(row+1)*segments+i
        faces.append((a,b,c,d))
cone=Mesh('Envelope_TurretMainCone',vertices,faces)
for face in cone.data.polygons:face.use_smooth=abs(face.normal.z)<.95 and abs(face.normal.y)<.95
theta=[i*math.tau/180 for i in range(180)]
Ring('Envelope_RoofLip',[(tx+radius*math.cos(a),ty+radius*math.sin(a),roof+ground)for a in theta],.0015)
for name,point in layout['rivetLocalSites'].items():Point('Envelope_'+name,(tx+point[0],ty+point[1],deck+point[2]+ground),.004)
cx,w=g['CabinCenterX'],g['CabinWidth'];top=g['CabinTopZ'];low=q['CabinBottomZBeforeGround'];yt,yb=g['CabinTopForward'],g['CabinBottomForward']
cab=Mesh('Envelope_CabinFront',[(cx-w/2,yt,top+ground),(cx+w/2,yt,top+ground),
    (cx+w/2,yb,low+ground),(cx-w/2,yb,low+ground)],[(0,1,2,3)])
solid=cab.modifiers.new('Diagnostic sheet thickness','SOLIDIFY');solid.thickness=.003
ys=[g['RoadFrontForward']]
for key in ['RoadSpacing01','RoadSpacing12','RoadSpacing23']:ys.append(ys[-1]-g[key])
for side,label in [(-1,'Left'),(1,'Right')]:
    for i,y in enumerate(ys):
        z=q['TyreShoulderRadius']+q['TyreAxisMinusShoulderRadius']+layout['wheelHeightOffsetsM'][i]+ground
        for edge,dr,factor in [('InnerBead',-.017,1.),('FrontShoulder',0.,1.),('TreadTransition',.008,.70)]:
            r=q['TyreShoulderRadius']+dr;x=side*(g['TrackCenterX']+q['TyreShoulderAxialOffset']*factor)
            Ring('Envelope_'+label+'_Road'+str(i)+'_'+edge,[(x,y+r*math.cos(a),z+r*math.sin(a))for a in theta],.0012)
sites=layout['freeSites'];a=sites['FenderFarInner'];b=sites['FenderFarOuter']
line=Ring('Envelope_FenderFrontSpan',[a,b],.0015);line.data.splines[0].use_cyclic_u=False
for name in ['FenderFarInner','FenderFarOuter','FenderNearOuter']:Point('Envelope_'+name,sites[name],.004)
for name in sites:
    if name.startswith('NativeFront_'):Point('Envelope_'+name,sites[name],.004)
Point('Envelope_NominalHighestMarker',(tx,ty,roof+q['RoofHighestOffset']+ground),.003)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=6;scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('World_Type94Envelope');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.70,.78,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;scene.world=world
for name,position,energy,size in [('Key',(-3,4,6),900,4),('Fill',(4,1,3),350,3),('Rim',(0,-4,4),600,3)]:
    data=bpy.data.lights.new('Light_Envelope'+name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector((0,0,.8))-obj.location).to_track_quat('-Z','Y').to_euler()
reports=[]
for name in layout['renderViews']:
    record=layout['cameras'][name];r=Matrix(record['rotationCameraFromBlender']);t=Vector(record['translationCameraFromBlender']);k=record['k']
    nativeWidth,nativeHeight=layout['imageSizes'][name];width=640;height=round(width*nativeHeight/nativeWidth)
    scale=width/nativeWidth;fx=k[0][0]*scale;fy=k[1][1]*scale;cx=k[0][2]*scale;cy=k[1][2]*scale
    assert abs(fx-fy)<1e-7
    data=bpy.data.cameras.new('Camera_Envelope'+name);camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=-(r.transposed()@t);camera.rotation_euler=(r.transposed()@Matrix.Diagonal((1.,-1.,-1.))).to_euler()
    nearSide='Left'if camera.location.x<0 else'Right'
    # The full hull is intentionally absent. Render only the observed side's
    # diagnostic rings, rather than showing far-side circles through the hull.
    for obj in scene.objects:
        if obj.name.startswith('Envelope_Left_Road'):obj.hide_render=nearSide!='Left'
        elif obj.name.startswith('Envelope_Right_Road'):obj.hide_render=nearSide!='Right'
    data.sensor_fit='HORIZONTAL';data.sensor_width=36;data.lens=fx*36/width
    data.shift_x=(width/2-cx)/width;data.shift_y=(cy-height/2)/width
    data.clip_start=.01;data.clip_end=100;scene.camera=camera;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    bpy.context.view_layer.update();errors=[]
    for point in [(tx,ty,roof+ground),(g['TrackCenterX'],ys[0],.2),(0,1.1,.7)]:
        local=r@Vector(point)+t
        if local.z<=.1:continue
        expected=(fx*local.x/local.z+cx,fy*local.y/local.z+cy);ndc=world_to_camera_view(scene,camera,Vector(point))
        errors.append(math.hypot(ndc.x*width-expected[0],(1-ndc.y)*height-expected[1]))
    assert max(errors)<.001,('Camera projection mismatch',name,errors)
    file=root/'Acceptance'/('Render_EnvelopeLinear'+name+'.png');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
    reports.append(dict(camera=name,render=str(file),size=[width,height],cameraProjectionMaximumErrorPx=max(errors),distortionApplied=False,
        renderedTyreSide=nearSide,farSideRingsOmittedBecauseHullIsAbsent=True))
scene.camera=bpy.data.objects['Camera_Envelope2017']
for obj in scene.objects:
    if obj.name.startswith('Envelope_Left_Road'):obj.hide_render=False
    elif obj.name.startswith('Envelope_Right_Road'):obj.hide_render=True
scene.render.filepath=str(root/'Acceptance/Render_EnvelopeLinear2017.png')
blend=root/'Scene_Type94ReferenceEnvelopeV47.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
for obj in list(scene.objects):
    if obj.type=='CURVE':
        obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
for obj in scene.objects:
    if obj.type=='MESH':obj.select_set(True)
glb=root/'Exports/Model_Type94ReferenceEnvelopeV47.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False)
report=dict(schema='Type94CalibrationEnvelopeBuildV1',sourceBlend=str(blend),glb=str(glb),renders=reports,
    completeVehicle=False,referenceAccepted=False,gameDerivative=False,sourceGeometryImported=False,
    scope='Editable gray calibration surfaces only; existing full model and all its mechanics remain untouched')
(root/'Acceptance/Data_EnvelopeBuildV47.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2),flush=True)
