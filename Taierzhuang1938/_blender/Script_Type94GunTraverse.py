"""Add a second ball-mount aiming axis without moving any closed surface.

The museum identifies a ball-mounted Type 91. The small demonstrated travel
is an authored clearance limit, not a surveyed historical operating stop.
"""
import bpy
from mathutils import Matrix


def AddGunTraverse():
    scene=bpy.context.scene
    assert scene.get('BlenderMcpTask')=='Type94Tankette'
    gun=bpy.data.objects['MachineGunPitch']
    yaw=bpy.data.objects.get('MachineGunYaw')
    if yaw:
        assert gun.parent==yaw
        return yaw
    assert gun.parent==bpy.data.objects['TurretYaw']
    bpy.context.view_layer.update()
    pose=gun.matrix_world.copy()
    yaw=bpy.data.objects.new('MachineGunYaw',None)
    scene.collection.objects.link(yaw)
    yaw.empty_display_type='PLAIN_AXES'
    yaw.empty_display_size=.06
    yaw.parent=gun.parent
    yaw.matrix_world=pose
    bpy.context.view_layer.update()
    gun.parent=yaw
    gun.matrix_parent_inverse=Matrix.Identity(4)
    gun.matrix_world=pose
    yaw['GunTraverseMinDegrees']=-8.
    yaw['GunTraverseMaxDegrees']=8.
    yaw['GunTraverseLimitsInferred']=True
    yaw['GunTraverseReference']='Australian War Memorial Type 94 ball-mounted Type 91'
    yaw['GunTraverseReferenceUrl']='https://www.awm.gov.au/visit/exhibitions/bigthingsinstore/tankette'
    yaw['GunTraverseScope']='Two-axis aiming demonstration; exact historical stops and rate unmeasured'
    scene['Type94IndependentGunTraverse']=True
    bpy.context.view_layer.update()
    assert max(abs(gun.matrix_world[i][j]-pose[i][j]) for i in range(4) for j in range(4))<1e-7
    return yaw
