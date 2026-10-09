"""Calibrate metres without recomposing the approved reference camera.

Executed after the original authored transforms and before contact placement.
Camera and architectural anchors share a similarity transform; adult desktop
props only translate, so their measured physical dimensions stay intact.
"""
scale=layout['environmentScale']
zLift=layout['deskTopHeightM']-(tz+.045)*scale
sceneCalibration=Matrix.Translation((0,0,zLift))@Matrix.Scale(scale,4)
referenceCamera=layout['referenceCamera']
calibratedCameraPosition=sceneCalibration@Vector(referenceCamera['position'])
calibratedCameraTarget=sceneCalibration@Vector(referenceCamera['target'])
referenceAnchors={}
anchorPrefixes=[('desk','TablePlank'),('cabinet','CabinetTop'),('window','Window'),('wallMap','WallMapPaper'),('coat','Coat')]
for name,prefix in anchorPrefixes:
    lo,hi,size=PropBounds(PropObjects((prefix,)))
    referenceAnchors[name]=[list(lo),list(hi)]

propGroups={'Letter':('Telegram',),'PencilTray':('PencilBox','Pencil0','Pencil1'),
    'Ruler':('WoodRuler','RulerTick'),'InkBottle':('InkBottle',),'DipPen':('DipPen',),'Cap':('Cap',)}
desktopObjects=set()
for name,prefixes in propGroups.items():
    objects=PropObjects(prefixes);lo,hi,size=PropBounds(objects)
    anchor=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    translation=sceneCalibration@anchor-anchor+Vector(layout['propOffsets'].get(name,[0,0,0]))
    for ob in objects:
        ob.matrix_world=Matrix.Translation(translation)@ob.matrix_world
        desktopObjects.add(ob)
for ob in list(scene.objects):
    if ob.type=='MESH' and ob not in desktopObjects:ob.matrix_world=sceneCalibration@ob.matrix_world
bpy.context.view_layer.update()

def RemapWorldZ(objects,remap):
    for ob in objects:
        inverse=ob.matrix_world.inverted()
        for vertex in ob.data.vertices:
            point=ob.matrix_world@vertex.co;point.z=remap(point.z)
            vertex.co=inverse@point
        ob.data.update()

# Extend the feet, keeping the tabletop and cabinet crest in the same image
# positions. The old scene hid the cabinet's lowest part underground.
for prefixes in [('TableLeg',),('CabinetFoot',)]:
    objects=PropObjects(prefixes);lo,hi,size=PropBounds(objects)
    RemapWorldZ(objects,lambda z: (z-lo.z)/size.z*hi.z)
chair=PropObjects(('Chair',));chairLo,chairHi,chairSize=PropBounds(chair)
seatTop=PropBounds(PropObjects(('ChairSeat',)))[1].z
seatTarget=layout['chairSeatHeightM']
RemapWorldZ(chair,lambda z: (z-chairLo.z)/(seatTop-chairLo.z)*seatTarget if z<=seatTop
    else seatTarget+(z-seatTop)/(chairHi.z-seatTop)*(chairHi.z-seatTarget))

# Close the set outside the approved frame. The former open roof/front let
# world illumination light the room from directions without an opening.
roomBounds=layout['room'];x0=roomBounds['leftX'];x1=roomBounds['rightX']
y0=roomBounds['frontY'];y1=roomBounds['backY'];height=roomBounds['heightM'];thickness=roomBounds['wallThicknessM']
for ob in PropObjects(('Floor','SideWall')):bpy.data.objects.remove(ob,do_unlink=True)
Cube('Floor',((x0+x1)/2,(y0+y1)/2,-.06),(x1-x0+2*thickness,y1-y0+2*thickness,.12),plaster,0)
Cube('SideWall',(x0-thickness/2,(y0+y1)/2,height/2),(thickness,y1-y0+2*thickness,height),plaster,0)
Cube('RoomRightWall',(x1+thickness/2,(y0+y1)/2,height/2),(thickness,y1-y0+2*thickness,height),plaster,0)
entry=layout['entry'];doorLeft=entry['centerX']-entry['widthM']/2;doorRight=entry['centerX']+entry['widthM']/2
Cube('RoomFrontLeft',((x0+doorLeft)/2,y0-thickness/2,height/2),(doorLeft-x0,thickness,height),plaster,0)
Cube('RoomFrontRight',((x1+doorRight)/2,y0-thickness/2,height/2),(x1-doorRight,thickness,height),plaster,0)
Cube('RoomFrontHead',(entry['centerX'],y0-thickness/2,(height+entry['heightM'])/2),(entry['widthM'],thickness,height-entry['heightM']),plaster,0)
Cube('RoomCeiling',((x0+x1)/2,(y0+y1)/2,height+thickness/2),(x1-x0+2*thickness,y1-y0+2*thickness,thickness),plaster,0)
# Seal the bands above/below the existing rear wall; preserve its window,
# plaster UVs and visible relief instead of rebuilding a different backdrop.
rearTop=sceneCalibration@(backdropTransform@Vector((0,wy,3.675)))
rearBottom=sceneCalibration@(backdropTransform@Vector((0,wy,0)))
if rearBottom.z>0:
    for wall in walls:
        for ob in [wall,scene.objects.get('ReferenceWallSkin_'+wall.name)]:
            if ob is not None:RemapWorldZ([ob],lambda z: 0 if abs(z-rearBottom.z)<.001 else z)
if rearTop.z<height:Cube('RoomRearHead',((x0+x1)/2,y1+thickness/2,(rearTop.z+height)/2),(x1-x0,thickness,height-rearTop.z),plaster,0)
bpy.context.view_layer.update()

# Check the actual bounds before batching. Exported camera-space projections
# are independently checked by the browser test.
anchors={}
for name,prefix in anchorPrefixes:
    lo,hi,size=PropBounds(PropObjects((prefix,)));bounds=[lo,hi]
    for previous,current in zip(referenceAnchors[name],bounds):
        assert (sceneCalibration@Vector(previous)-current).length<.00001,f'Reference anchor moved: {name}'
    anchors[name]={'reference':referenceAnchors[name],'calibrated':[list(p) for p in bounds]}
deskAxes=[Vector((math.cos(math.radians(40)),math.sin(math.radians(40)),0)),Vector((-math.sin(math.radians(40)),math.cos(math.radians(40)),0)),Vector((0,0,1))]
deskSize=PropBounds(PropObjects(('TablePlank',)),deskAxes)[2]
assert abs(deskSize.x-1.55)<.001 and abs(deskSize.y-1.15)<.005
assert abs(PropBounds(PropObjects(('TablePlank',)))[1].z-.75)<.001
calibrationReport={'units':'metres','environmentScale':scale,'zLift':zLift,
    'referenceCamera':referenceCamera,'camera':{'position':list(calibratedCameraPosition),'target':list(calibratedCameraTarget),'lensMm':referenceCamera['lensMm']},
    'anchors':anchors,'desk':{'widthM':deskSize.x,'depthM':deskSize.y,'heightM':layout['deskTopHeightM']},
    'room':{'widthM':x1-x0,'depthM':y1-y0,'heightM':height},
    'cabinet':{'sizeM':list(PropBounds(PropObjects(('Cabinet',)))[2])},
    'chairSeatHeightM':PropBounds(PropObjects(('ChairSeat',)))[1].z,
    'window':{'center':list(sceneCalibration@Vector(layout['referenceWindow']['center'])),
              'sizeM':[v*scale for v in layout['referenceWindow']['clearSizeM']]}}
scene['commandRoomCalibration']=json.dumps(calibrationReport)
(SHOTS/'Data_CommandRoomCalibration.json').write_text(json.dumps(calibrationReport,indent=2),encoding='utf-8')
