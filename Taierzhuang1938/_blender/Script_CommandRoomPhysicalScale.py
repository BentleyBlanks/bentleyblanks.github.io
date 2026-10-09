"""Calibrate real prop envelopes and validate measured final world geometry.

No camera/framing scale factors: the targets and their real-world sources live
in Data_CommandRoomPhysicalProps.json. Executed before final contact placement.
"""
def PropObjects(prefixes):
    return [o for o in scene.objects if o.type=='MESH' and o.name.startswith(prefixes)]

def PropPoints(objects):
    return [o.matrix_world@v.co for o in objects for v in o.data.vertices]

def PropBounds(objects,axes=None):
    axes=axes or [Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
    coords=[Vector(tuple(p.dot(a) for a in axes)) for p in PropPoints(objects)]
    lo=Vector(tuple(min(p[i] for p in coords) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in coords) for i in range(3)))
    return lo,hi,hi-lo

# Preserve the bottle's square body, glass shell, inner liquid and lid together.
bottleObjects=PropObjects(('InkBottle',));bpy.context.view_layer.update()
bottleLo,bottleHi,bottleSize=PropBounds(bottleObjects)
bottleTarget=Vector(tuple(physical['inkBottle'][k] for k in ['widthM','depthM','heightM']))
bottleAnchor=Vector(((bottleLo.x+bottleHi.x)/2,(bottleLo.y+bottleHi.y)/2,bottleLo.z))
bottleScale=Matrix.Diagonal((*[bottleTarget[i]/bottleSize[i] for i in range(3)],1))
for prop in bottleObjects:prop.matrix_world=Matrix.Translation(bottleAnchor)@bottleScale@Matrix.Translation(-bottleAnchor)@prop.matrix_world

# The metal nib contributes to the measured overall length, not an extra add-on.
penObjects=PropObjects(('DipPen',));penAxes=[penDirection,penSide,Vector((0,0,1))]
penLo,penHi,penSize=PropBounds(penObjects,penAxes)
penLongScale=physical['dipPen']['lengthM']/penSize.x
penRadialScale=physical['dipPen']['diameterM']/max(penSize.y,penSize.z)
for prop in penObjects:
    inverse=prop.matrix_world.inverted()
    for vertex in prop.data.vertices:
        delta=prop.matrix_world@vertex.co-penStart
        along=penDirection*delta.dot(penDirection)
        vertex.co=inverse@(penStart+along*penLongScale+(delta-along)*penRadialScale)
    prop.data.update()

def ValidatePhysicalProps():
    bpy.context.view_layer.update()
    def Near(value,target,label,tolerance=.0002):
        assert abs(value-target)<=tolerance,f'{label}: measured {value:.6f} m, expected {target:.6f} m'
    report={'units':'metres','references':physical['references']}
    theta=physical['letter']['angleRad']
    letterAxes=[Vector((math.cos(theta),math.sin(theta),0)),Vector((-math.sin(theta),math.cos(theta),0)),Vector((0,0,1))]
    paper=PropObjects(('Telegram',));paperSize=PropBounds(paper,letterAxes)[2]
    Near(paperSize.x,physical['letter']['widthM'],'Letter width')
    Near(paperSize.y,physical['letter']['heightM'],'Letter height')
    shell=paper[0];a,b=letterShellVertexPair
    thickness=(shell.matrix_world@shell.data.vertices[a].co-shell.matrix_world@shell.data.vertices[b].co).length
    Near(thickness,physical['letter']['thicknessM'],'Letter thickness',.00001)
    report['letter']={'widthM':paperSize.x,'heightM':paperSize.y,'thicknessM':thickness,'curlEnvelopeM':paperSize.z}
    capAngle=math.radians(-35)
    capAxes=[Vector((math.cos(capAngle),math.sin(capAngle),0)),Vector((-math.sin(capAngle),math.cos(capAngle),0)),Vector((0,0,1))]
    headLoop=[capSweatband.matrix_world@capSweatband.data.vertices[i].co for i in headFitVertexIds]
    circumference=sum((headLoop[(i+1)%len(headLoop)]-p).length for i,p in enumerate(headLoop))
    Near(circumference,physical['cap']['headCircumferenceM'],'Measured inner hatband',.0005)
    report['cap']={'headCircumferenceM':circumference,'overallSizeM':list(PropBounds(PropObjects(('Cap',)),capAxes)[2])}
    bottle=PropBounds(PropObjects(('InkBottle',)))[2]
    for i,key in enumerate(['widthM','depthM','heightM']):Near(bottle[i],physical['inkBottle'][key],'Ink bottle '+key)
    report['inkBottle']={key:bottle[i] for i,key in enumerate(['widthM','depthM','heightM'])}
    pen=PropBounds(PropObjects(('DipPen',)),penAxes)[2]
    Near(pen.x,physical['dipPen']['lengthM'],'Dip pen length')
    Near(max(pen.y,pen.z),physical['dipPen']['diameterM'],'Dip pen diameter')
    report['dipPen']={'lengthM':pen.x,'diameterM':max(pen.y,pen.z)}
    pencils=[]
    for index in range(2):
        group=PropObjects((f'Pencil{index}',));size=PropBounds(group)[2]
        Near(size.x,physical['pencil']['lengthM'],f'Pencil {index} length')
        shaft=next(o for o in group if 'Shaft' in o.name);points=PropPoints([shaft]);center=sum(points,Vector())/len(points)
        diameter=2*max(math.hypot(p.y-center.y,p.z-center.z) for p in points)
        Near(diameter,physical['pencil']['diameterM'],f'Pencil {index} diameter')
        pencils.append({'lengthM':size.x,'diameterM':diameter})
    report['pencils']=pencils
    report['ruler']={'markedLengthM':physical['ruler']['markedLengthM'],'bodyLengthM':PropBounds(PropObjects(('WoodRuler',)),[Vector((math.cos(-.70),math.sin(-.70),0)),Vector((-math.sin(-.70),math.cos(-.70),0)),Vector((0,0,1))])[2].x}
    # Neighbouring desk props are checked against each other, as well as the map.
    groups={'Letter':paper,'Cap':PropObjects(('Cap',)),'InkBottle':PropObjects(('InkBottle',)),
            'DipPen':PropObjects(('DipPen',)),'PencilTray':PropObjects(('PencilBox','Pencil0','Pencil1')),'Ruler':PropObjects(('WoodRuler','RulerTick'))}
    overlaps={}
    for i,(name,objects) in enumerate(groups.items()):
        for other,objects2 in list(groups.items())[i+1:]:
            count=len(WorldBvh(objects).overlap(WorldBvh(objects2)))
            assert count==0,f'Desk props intersect: {name}/{other}: {count} pairs'
            overlaps[name+'/'+other]=count
    report['propIntersections']=overlaps
    print('Measured physical props',json.dumps(report),flush=True)
    return report
