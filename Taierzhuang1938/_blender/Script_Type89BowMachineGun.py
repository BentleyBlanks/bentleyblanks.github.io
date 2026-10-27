"""Observed open cast hood and separate ball; hidden socket is reconstructed.

The paired layers and lower opening are visible in references2/16/20. Radii,
depths, neutral station and concealed bore are provisional authoring parameters.
"""
import math
from mathutils import Vector,Matrix


def BowBallCentre(settings):
    angle=math.atan2(.785,.98);cosine=math.cos(angle);sine=math.sin(angle)
    forward=settings['neutralRootForwardM'];up=settings['neutralRootUpM'];jacketOffset=settings['jacketAxisOffsetM']
    root=Vector((0,forward*cosine+up*sine,-forward*sine+up*cosine))
    centre=root-Vector((0,jacketOffset*cosine,-jacketOffset*sine))
    return root,centre


def CutBowMountBore(quality,mount,targets,settings,armor,Lathe,CutOpening):
    _,centre=BowBallCentre(settings)
    scale=settings.get('assemblyScale',1.0)
    for obj in targets:assert all(abs(v.value-1)<1e-6 for v in obj.data.attributes['SurfaceFinish'].data),'Unexpected meaningful board coating field'
    # Apply to the original hull parts before consolidation. A Boolean on
    # the complete joined High hull retessellated unrelated tiny quads.
    cutter=Lathe('BowMountFunctionalBoardBore',[(settings['boreRadiusM']*scale,-settings['boreBackOffsetM']*scale),(settings['boreRadiusM']*scale,settings['boreFrontOffsetM']*scale)],(0,0,centre.z*scale),armor,mount,'Y',64 if quality=='High'else 24)
    CutOpening(targets,cutter);rows=[]
    for obj in targets:
        restored=0
        for value in obj.data.attributes['SurfaceFinish'].data:
            if value.value==0:value.value=1.0;restored+=1
            else:assert abs(value.value-1)<1e-6
        obj.data.update();rows.append({'part':obj.name,'newCoatingValuesRestored':restored})
    return rows


def BuildBowMachineGunMount(quality,mount,gun,jacketMesh,settings,armor,shadow,
                            Node,Mesh,PolygonPrism,Lathe,HexBolt,CutOpening,JoinStaticChildren,consolidate=True):
    angle=math.atan2(.785,.98);cosine=math.cos(angle);sine=math.sin(angle)
    root,centre=BowBallCentre(settings);jacketOffset=settings['jacketAxisOffsetM']
    gun.location=centre
    holder=Node('Node_BowMgJacket',parent=gun);holder.location=(0,jacketOffset,0)
    if jacketMesh is not None:jacketMesh.parent=holder;jacketMesh.matrix_parent_inverse.identity()
    steps=96 if quality=='High'else 64
    outline=[(.191*math.cos(math.radians(-60+300*i/steps)),.191*math.sin(math.radians(-60+300*i/steps)))for i in range(steps+1)]
    outline.extend([(-.092,-.203),(-.065,-.218),(.065,-.218),(.092,-.203)])
    flange=PolygonPrism('BowMgFlange',outline,'Y',.020,(0,-.003,0),armor,mount,.002)
    cutter=Lathe('BowMgFlangeBore',[(settings['flangeBoreRadiusM'],-.06),(settings['flangeBoreRadiusM'],.06)],(0,0,0),armor,mount,'Y',64 if quality=='High'else 24)
    CutOpening([flange],cutter)
    arcSteps=64 if quality=='High'else 32;start=math.radians(-50);end=math.radians(230)
    vertices=[]
    for ring in range(4):
        for i in range(arcSteps+1):
            theta=start+(end-start)*i/arcSteps;c=math.cos(theta);s=math.sin(theta)
            inner=settings['hoodFrontInnerRadiusM']+settings['hoodLowerFlareM']*max(0,-s)
            if ring==0:point=(settings['hoodRearOuterRadiusM']*c,settings['hoodRearOuterYM'],settings['hoodRearOuterRadiusM']*s)
            elif ring in [1,2]:
                radius=inner+(settings['hoodLipWidthM']if ring==1 else 0)
                point=(radius*c,settings['hoodFrontYM']+radius*sine*s,settings['hoodFrontZM']+radius*cosine*s)
            else:point=(settings['hoodRearInnerRadiusM']*c,settings['hoodRearInnerYM'],settings['hoodRearInnerRadiusM']*s)
            vertices.append(point)
    count=arcSteps+1;faces=[]
    for band in range(4):
        following=(band+1)%4
        for i in range(arcSteps):faces.append((band*count+i,band*count+i+1,following*count+i+1,following*count+i))
    faces.extend([(0,count,count*2,count*3),(count-1,count*4-1,count*3-1,count*2-1)])
    hood=Mesh('BowMgOpenCastHood',vertices,faces,armor,mount,smooth=True)
    mesh=hood.data;normals=[]
    for polygon in mesh.polygons:
        if polygon.index>=arcSteps*4:
            polygon.use_smooth=False;normals.extend([tuple(polygon.normal)]*len(polygon.loop_indices));continue
        band=polygon.index//arcSteps
        for li in polygon.loop_indices:
            angularIndex=mesh.loops[li].vertex_index%count
            neighbours=[band*arcSteps+j for j in [angularIndex-1,angularIndex]if 0<=j<arcSteps]
            normal=sum((mesh.polygons[j].normal for j in neighbours),Vector()).normalized();normals.append(tuple(normal))
    mesh.normals_split_custom_set(normals)
    for degrees in settings.get('flangeBoltAnglesDegrees',[0,45,90,135,180,220,320]):
        a=math.radians(degrees);HexBolt((math.cos(a)*.170,.008,math.sin(a)*.170),(0,1,0),mount,.009,.006)
    for x in [-.052,.052]:HexBolt((x,.008,-.194),(0,1,0),mount,.009,.006)
    back=-settings.get('cabinBackOffsetM',.165)
    Mesh('BowMgInferredCabinBack',[(-.15,back,centre.z-.15),(.15,back,centre.z-.15),(.15,back,centre.z+.15),(-.15,back,centre.z+.15)],[(3,2,1,0)],shadow,mount)
    if consolidate:JoinStaticChildren(mount)
    ballOwner=Node('Node_BowMgBall',parent=gun,hiddenSocketMetricCertified=False,outerRadiusM=settings['ballRadiusM'])
    radius=settings['ballRadiusM'];bore=settings['ballBarrelBoreRadiusM'];rows=24 if quality=='High'else 10;around=64 if quality=='High'else 32
    start=math.pi-math.asin(bore/radius);end=math.asin(bore/radius)
    outer=[(radius*math.sin(t),radius*math.cos(t))for t in [start+(end-start)*i/rows for i in range(rows+1)]]
    ball=Lathe('BowMgSeparateBall',outer,(0,0,0),armor,ballOwner,'Y',around,smooth=True,closeProfile=True)
    normals=[];outerCount=len(outer)
    for polygon in ball.data.polygons:
        band=polygon.index//around
        for li in polygon.loop_indices:
            p=ball.data.vertices[ball.data.loops[li].vertex_index].co
            if band<outerCount-1:normal=p.normalized()
            else:normal=Vector((-p.x,0,-p.z)).normalized()
            normals.append(tuple(normal))
    ball.data.normals_split_custom_set(normals)
    if consolidate:JoinStaticChildren(ballOwner)
    gun['pivotReconstruction']='Centre of the separate spherical ball; inferred metric station, not a factory drawing'
    gun['neutralJacketRootInMountM']=list(root);gun['ballCentreInMountM']=list(centre)
    mount['openCastHoodObserved']=True;mount['bowMgMetricCertified']=False
    return centre,hood


def ApplyBowAssemblyScale(mount,settings):
    scale=settings.get('assemblyScale',1.0)
    if scale==1:return
    for obj in mount.children_recursive:
        obj.location*=scale
        if obj.type=='MESH':
            if obj.data.users>1:obj.data=obj.data.copy()
            obj.data.transform(Matrix.Scale(scale,4));obj.data.update()
            for modifier in obj.modifiers:
                if modifier.type=='BEVEL':modifier.width*=scale
                elif modifier.type=='SOLIDIFY':modifier.thickness*=scale
        if 'outerRadiusM'in obj:obj['outerRadiusM']*=scale
        for key in ['neutralJacketRootInMountM','ballCentreInMountM']:
            if key in obj:obj[key]=[float(v)*scale for v in obj[key]]
    mount['uniformAssemblyScaleApplied']=scale
