"""Field vista behind the real aperture and sparse near branches.

The far panorama represents land hundreds of metres away. Its carrier is 30 m
from the camera, inside the authored far plane. Near branches remain geometry
and move against it with the menu's physical camera parallax.
"""
for ob in list(scene.objects):
    if ob.name.startswith(('DistantCourtyard','BareBranch')):bpy.data.objects.remove(ob,do_unlink=True)
farmland=Material('CommandRoomFarmland',(0,0,0),1,'CommandRoomFarmland',True)
p=farmland.node_tree.nodes.get('Principled BSDF')
texture=next(n for n in farmland.node_tree.nodes if n.type=='TEX_IMAGE')
for link in list(farmland.node_tree.links):
    if link.to_socket==p.inputs['Base Color']:farmland.node_tree.links.remove(link)
farmland.node_tree.links.new(texture.outputs['Color'],p.inputs['Emission Color'])
p.inputs['Base Color'].default_value=(0,0,0,1)
p.inputs['Emission Strength'].default_value=.45
center=Vector((-5.7,22,1.32));width=12.44;height=7
Mesh('FarmlandVista',[center+Vector((x*width,0,z*height)) for x,z in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]],
     [(0,1,2,3)],farmland,[(0,0),(1,0),(1,1),(0,1)])
vista=bpy.data.objects['FarmlandVista'];vista.visible_shadow=False
Curve('CourtyardTreeTrunk',[(-2.66,6.2,0),(-2.62,6.2,.9),(-2.68,6.2,1.7),(-2.64,6.2,2.3)],.021,wood)
for point,direction,length,radius,depth in [((-2.65,6.2,1.45),(-.62,.05,.78),.55,.011,3),
    ((-2.67,6.2,1.82),(.63,.01,.69),.62,.009,3),((-2.64,6.2,2.18),(-.25,0,.93),.36,.006,2)]:
    Branch(point,direction,length,radius,depth)
