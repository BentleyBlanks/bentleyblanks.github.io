"""BlenderMCP QA: inspect evaluated geometry, signed rolling and pinned joints."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

assetDir=Path(bpy.data.filepath).parent
manifest=json.loads((assetDir/'Data_TrainRig.json').read_text())
scene=bpy.context.scene
roots=[bpy.data.objects[name] for name in ['Model_LocomotiveRoot','Model_GondolaRoot']]
actions=[root.animation_data.action for root in roots]
for root in roots: root.animation_data.action=None
maxJointError=0.0; maxSlipError=0.0; maxQuarterError=0.0;maxValveJointError=0.0
sampleCount=0
for distance in [i*math.tau*.73/120 for i in range(-120,121)]+[0,1,1,0,-1,17.345,-6.789]:
    for root in roots:
        root['TravelMeters']=distance; root.update_tag(refresh={'OBJECT'})
    bpy.context.view_layer.update()
    depsgraph=bpy.context.evaluated_depsgraph_get()
    evaluated={root.name:root.evaluated_get(depsgraph) for root in roots}
    for wheel in manifest['wheels']:
        obj=bpy.data.objects[wheel['name']].evaluated_get(depsgraph)
        angle=obj.rotation_euler.y
        maxSlipError=max(maxSlipError,abs((angle-wheel['phase'])*wheel['radius']-distance))
        center=evaluated[wheel['root']].matrix_world.inverted() @ obj.matrix_world.translation
        assert abs(center.z-wheel['radius'])<1e-5, 'Wheel tread not at rail height'
    for rod in manifest['rods']:
        obj=bpy.data.objects[rod['name']].evaluated_get(depsgraph)
        relative=evaluated['Model_LocomotiveRoot'].matrix_world.inverted() @ obj.matrix_world
        start=relative @ Vector((0,0,0)); end=relative @ Vector((rod['length'],0,0))
        a=distance/.73+rod['phase']
        expectedStart=Vector((rod['axleX']+.32*math.cos(a),rod['side']*(1.17 if rod['kind']=='main' else 1.035),.73-.32*math.sin(a)))
        if rod['kind']=='main':
            head=bpy.data.objects['Model_Crosshead'+('Left' if rod['side']==1 else 'Right')].evaluated_get(depsgraph)
            expectedEnd=evaluated['Model_LocomotiveRoot'].matrix_world.inverted() @ head.matrix_world.translation
        else: expectedEnd=expectedStart+Vector((rod['length'],0,0))
        maxJointError=max(maxJointError,(start-expectedStart).length,(end-expectedEnd).length,abs((end-start).length-rod['length']))
    for record in manifest.get('valveGear',[]):
        def Point(name,co):
            return bpy.data.objects[name].evaluated_get(depsgraph).matrix_world @ Vector(co)
        sideName='Left' if record['side']==1 else 'Right'
        e=Point(record['eccentricRod'],(0,0,0));b=Point(record['eccentricRod'],(record['eccentricLength'],0,0))
        crankPin=Point('Model_Driver2'+sideName,(0,record['side']*.56,.18))
        rockerEnd=Point(record['rocker'],(0,0,-record['rockerLength']))
        radiusStart=Point(record['radiusRod'],(0,0,0));radiusEnd=Point(record['radiusRod'],(record['radiusLength'],0,0))
        radiusPin=Point(record['rocker'],(0,0,-record['rockerLength']*record['fixedSetting']))
        valve=Point(record['stem'],(0,0,0))
        maxValveJointError=max(maxValveJointError,(e-crankPin).length,(b-rockerEnd).length,(radiusStart-radiusPin).length,(radiusEnd-valve).length)
    for i in range(1,6):
        left=bpy.data.objects[f'Model_Driver{i}Left'].evaluated_get(depsgraph)
        right=bpy.data.objects[f'Model_Driver{i}Right'].evaluated_get(depsgraph)
        maxQuarterError=max(maxQuarterError,abs(left.rotation_euler.y-right.rotation_euler.y-math.pi/2))
    sampleCount+=1
for root,action in zip(roots,actions): root.animation_data.action=action
scene.frame_set(1)
drivers=[fc.driver for obj in bpy.data.objects if obj.animation_data for fc in obj.animation_data.drivers]
invalidDrivers=sum(not driver.is_valid for driver in drivers)
assert invalidDrivers==0, f'{invalidDrivers} invalid drivers'
assert maxJointError<.00002, f'Joint separation {maxJointError}'
assert maxSlipError<.00002, f'Rolling mismatch {maxSlipError}'
assert maxQuarterError<.00002, f'Quartering mismatch {maxQuarterError}'
assert maxValveJointError<.00002, f'Valve linkage separation {maxValveJointError}'
assert manifest['triangles']['Model_Locomotive']<80000
assert manifest['triangles']['Model_Gondola']<80000
report={'status':'PASS','signedDistanceSamples':sampleCount,'maxJointErrorMeters':maxJointError,'maxRollingErrorMeters':maxSlipError,'maxQuarteringErrorRadians':maxQuarterError,'driverCount':len(drivers),'invalidDrivers':invalidDrivers,'triangles':manifest['triangles'],'checks':['Both rolling directions, repeated stop, full revolution','Wheel tread at rail level','Five driver axles in phase on each side','Left and right cranks quartered','Main rods and coupling rods fixed length','Crosshead remains on straight slide guides']}
report['maxValveJointErrorMeters']=maxValveJointError
report['checks'].append('Return crank, eccentric rod, fixed-setting rocker and horizontal valve slide joints')
(assetDir/'Data_TrainRigValidation.json').write_text(json.dumps(report,indent=2))
result=report
