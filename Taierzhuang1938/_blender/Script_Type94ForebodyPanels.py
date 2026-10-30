"""Build explicitly planar forebody side plates with one closed shared fold.

The panel layout is inferred. It replaces a nonplanar four-corner face, while
keeping thickness and the actual circular mechanical sections independent.
"""
from mathutils import Matrix,Vector


def BuildGlacisSide(api, side):
    layout=api['FOREBODY_LAYOUT']
    assert layout.get('planarGlacisCheeks')is True
    profile=api['GLACIS_PROFILE']
    assert len(profile)==3,'This construction has one declared deck knuckle'
    frontY,frontZ=profile[0]
    knuckleY,knuckleZ=profile[1]
    rearY,rearZ=profile[2]
    frontX=api['FRONT_ARMOR_HALF_WIDTH']
    rearX=.60
    rearBottomZ=layout['sideCheekRearBottomZM']
    lowerKnuckleZ=layout['sideCheekLowerKnuckleZM']
    outer=[Vector((side*frontX,frontY,frontZ)),Vector((side*rearX,knuckleY,knuckleZ)),
           Vector((side*rearX,rearY,rearZ)),Vector((side*rearX,rearY,rearBottomZ)),
           Vector((side*rearX,knuckleY,lowerKnuckleZ))]
    sloped=side<0 and 'engineLeftUpperHalfWidthM'in layout
    if sloped:
        upper=layout['engineLeftUpperHalfWidthM'];height=layout['engineLeftSideHeightM']
        outer[1]=Vector((-upper,knuckleY,knuckleZ));outer[2]=Vector((-upper,rearY,rearZ))
        outer[3]=Vector((-rearX,rearY,rearZ-height));outer[4]=Vector((-rearX,knuckleY,knuckleZ-height))
    faces=[(0,1,4),(4,1,2,3)]
    if side<0:faces=[tuple(reversed(face))for face in faces]
    normals=[]
    errors=[]
    for face in faces:
        a,b,c=[outer[i]for i in face[:3]]
        normal=(b-a).cross(c-a).normalized()
        normals.append(normal)
        errors.append(max(abs((outer[i]-a).dot(normal))for i in face))
    assert max(errors)<1e-6,'Authored outer plates must be planar'
    thickness=layout['sideCheekThicknessM']
    frontNormal,rearNormal=normals
    if not sloped:assert abs(rearNormal.x-side)<1e-5 and abs(frontNormal.z)<1e-5
    # Intersect the two inward offset planes at the fold. Both outer corners
    # share this inner line, so there are no coincident internal end caps.
    dx=-side*thickness
    dy=(-thickness-frontNormal.x*dx)/frontNormal.y
    foldOffset=Matrix((frontNormal,rearNormal,(outer[1]-outer[4]).normalized())).inverted()@Vector((-thickness,-thickness,0))if sloped else Vector((dx,dy,0))
    inner=[]
    for index,point in enumerate(outer):
        if index in [1,4]:inner.append(point+foldOffset)
        elif index==0:inner.append(point-frontNormal*thickness)
        else:inner.append(point-rearNormal*thickness)
    closedFaces=list(faces)+[tuple(i+5 for i in reversed(face))for face in faces]
    boundary=[0,1,2,3,4]
    if side<0:boundary=list(reversed(boundary))
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):closedFaces.append((a,a+5,b+5,b))
    obj=api['Mesh']('Armor_GlacisCheek'+str(side),outer+inner,closedFaces,bevel=layout['sideCheekBevelM'])
    obj['ForebodyPlanarSideRequired']=True
    obj['ForebodyPlanarSideThicknessM']=thickness
    obj['ForebodyPlanarSideOuterCornersM']=[v for p in outer for v in p]
    hull=api['PARTS']['Hull']
    hull['ForebodyPlanarSideRequired']=True
    hull['ForebodyPlanarSideThicknessM']=thickness
    hull['ForebodyPlanarSideMaximumPlaneErrorM']=max(errors)
    hull['ForebodyPlanarSideScope']='Inferred connected armor panels; exact seam and gauge are not museum measurements'
    if sloped:
        api['Plate']('Armor_EngineRearTransition',[outer[2],Vector((-rearX,rearY,rearZ)),outer[3]],thickness,bevel=.0005)
        hull['EngineLeftUpperHalfWidthM']=upper;hull['EngineLeftUpperSideInferred']=True
    return obj
