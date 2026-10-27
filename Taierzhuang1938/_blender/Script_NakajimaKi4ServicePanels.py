"""Visible Photo02 service-cover reconstruction, fixed engine/camera datums.

Executed inside the Ki-4 builder namespace. Six/seven grouped apertures and
the separated openings reproduce the selected photograph; lower occlusion,
opposite-side symmetry, rim depths and hidden routing remain reconstruction.
"""

serviceFeatures={
 'Upper':{
  'count':6,
  'bank':[(2.315349,.324720),(2.489510,.511650),(2.492330,.767320),(2.331230,.665160)],
  'single':[(2.194940,.266580),(2.235030,.316510),(2.246670,.661040),(2.198360,.620530)],
  'bankPixels':[(1466,478),(1505,478),(1511,497),(1475,497)],
  'singlePixels':[(1440,478),(1449,479),(1457,499),(1446,497)]},
 'Lower':{
  'count':7,
  'bank':[(2.334740,1.000230),(2.513570,1.030630),(2.531400,1.264370),(2.353580,1.246110)],
  'single':[(2.213400,.997010),(2.262620,.973460),(2.268750,1.257820),(2.210010,1.242750)],
  'bankPixels':[(1483,528),(1522,523),(1532,551),(1493,556)],
  'singlePixels':[(1457,532),(1467,528),(1475,561),(1462,561)]}
}
outletSpec={'centerY':2.4577655,'centerZ':1.9157133,'halfY':.0777850,'halfZ':.0894313,'cornerRadiusM':.028,'mouthOutwardM':.025}
serviceCameraProfile=os.environ.get('KI4_SERVICE_ALIGNMENT','Photo02LegacyCamera')
assert serviceCameraProfile in ['Photo02LegacyCamera','Photo02VisibleArcCamera']
if serviceCameraProfile=='Photo02VisibleArcCamera':
    serviceFeatures['Upper']['bank']=[(2.335779693, 0.582763147), (2.512082583, 0.716210876), (2.514099608, 0.928803545), (2.350315496, 0.843615163)]
    serviceFeatures['Upper']['single']=[(2.213999075, 0.534144394), (2.254735705, 0.564982703), (2.264735318, 0.827844573), (2.215714051, 0.790645111)]
    serviceFeatures['Lower']['bank']=[(2.352008084, 1.145966022), (2.534927811, 1.172228518), (2.556538395, 1.374189262), (2.374036598, 1.357217885)]
    serviceFeatures['Lower']['single']=[(2.228104983, 1.138009103), (2.278785814, 1.116509576), (2.284151848, 1.396138312), (2.22385941, 1.379501083)]
    outletSpec.update({'centerY': 2.478620412, 'centerZ': 1.825897307, 'halfY': 0.080448835, 'halfZ': 0.089413405, 'mouthOutwardM': 0.025, 'cornerRadiusM': 0.028})
root['servicePhotoCameraProfile']=serviceCameraProfile
root['servicePhotoCameraScope']='Photo02 mouth reconstruction under the declared physical camera, not factory opening coordinates. Original observed corners and tolerances retained; full engine/bearer/propeller chain unchanged.'
recessScript=scriptPath.with_name('Script_NakajimaKi4ServiceRecess.py')
exec(compile(recessScript.read_text(encoding='utf8'),str(recessScript),'exec'),globals())


def ServiceRadius(y,theta):
    rx=Interp(sections,y,1);rz=Interp(sections,y,2)
    radius=1/sqrt((sin(theta)/rx)**2+(cos(theta)/rz)**2)
    if y>=2.25:radius=max(radius,Interp([(2.25,.608),(2.38,.626),(2.67,.657)],y,1))
    return radius


def ServicePoint(y,theta,side,offset=0):
    radius=ServiceRadius(y,theta)+offset
    return Vector((side*radius*sin(theta),y,engineZ+radius*cos(theta)))


def ServiceQuad(quad,u,v):
    a,b,c,d=[Vector(value) for value in quad]
    return a*((1-u)*(1-v))+b*(u*(1-v))+c*(u*v)+d*((1-u)*v)


def ServiceGrid(name,quad,side,mat,u0=0,u1=1,v0=0,v1=1,offset=-serviceRecessDepth,columns=7,rows=7):
    vertices=[];uvs=[];faces=[]
    for j in range(rows+1):
        v=v0+(v1-v0)*j/rows
        for i in range(columns+1):
            u=u0+(u1-u0)*i/columns;y,theta=ServiceQuad(quad,u,v)
            lift=offset(u,v) if callable(offset) else offset
            vertices.append(ServicePoint(y,theta,side,lift));uvs.append((y/1.5,side*theta*.64/1.5))
    stride=columns+1
    for j in range(rows):
        for i in range(columns):
            a=j*stride+i;face=(a,a+stride,a+stride+1,a+1)
            faces.append(face if side>0 else face[::-1])
    return Mesh(name,vertices,faces,mat,uvs)


def ServicePerimeter(u0,u1,v0,v1,steps=8):
    points=[];corners=[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
    for a,b in zip(corners,corners[1:]+corners[:1]):
        for k in range(steps):points.append((a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps))
    return points


def ServiceRim(name,quad,side,innerPath,outerPath):
    vertices=[];uvs=[];faces=[];n=len(innerPath)
    assert n==len(outerPath)
    for path,lift in [(outerPath,.0065),(innerPath,.0065),(innerPath,-serviceRecessDepth),(outerPath,.001)]:
        for u,v in path:
            y,theta=ServiceQuad(quad,u,v);vertices.append(ServicePoint(y,theta,side,lift));uvs.append((y/1.5,side*theta*.64/1.5))
    for k in range(n):
        b=(k+1)%n
        for face in [(k,k+n,b+n,b),(k+n,b+n,b+2*n,k+2*n),(k,k+3*n,b+3*n,b)]:faces.append(face if side>0 else face[::-1])
    return Mesh(name,vertices,faces,'Skin',uvs)


def RoundedServicePath(radiusU=.28,radiusV=.10,steps=8):
    points=[]
    for cu,cv,start in [(1-radiusU,radiusV,-pi/2),(1-radiusU,1-radiusV,0),(radiusU,1-radiusV,pi/2),(radiusU,radiusV,pi)]:
        for k in range(steps):
            angle=start+(pi/2)*k/steps;points.append((cu+radiusU*cos(angle),cv+radiusV*sin(angle)))
    return points


def RoundedServiceBacking(name,quad,side,rows=20,columns=2,radiusU=.28,radiusV=.10):
    vertices=[];uvs=[];faces=[]
    for j in range(rows+1):
        v=j/rows;distance=(radiusV-v)/radiusV if v<radiusV else (v-(1-radiusV))/radiusV if v>1-radiusV else 0
        inset=radiusU*(1-sqrt(max(0,1-distance*distance)))
        for i in range(columns+1):
            u=inset+(1-2*inset)*i/columns;y,theta=ServiceQuad(quad,u,v);vertices.append(ServicePoint(y,theta,side,-serviceRecessDepth));uvs.append((y/1.5,side*theta*.64/1.5))
    stride=columns+1
    for j in range(rows):
        for i in range(columns):
            a=j*stride+i;face=(a,a+stride,a+stride+1,a+1);faces.append(face if side>0 else face[::-1])
    return Mesh(name,vertices,faces,'Dark',uvs)


def BuildServicePanel(side):
    ServiceGrid('EngineServicePanel'+str(side),[(2.17,.15),(2.63,.15),(2.63,2.20),(2.17,2.20)],side,'Skin',offset=.001,columns=12,rows=34)
    edge=ServicePerimeter(0,1,0,1,12);panelQuad=[(2.17,.15),(2.63,.15),(2.63,2.20),(2.17,2.20)]
    Curve('EngineServicePanelSeam'+str(side),[ServicePoint(*ServiceQuad(panelQuad,u,v),side,.0021) for u,v in edge],.0008,'Dark',True)
    for row,spec in serviceFeatures.items():
        quad=spec['bank'];width=(ServicePoint(*quad[1],side)-ServicePoint(*quad[0],side)).length;height=(ServicePoint(*quad[3],side)-ServicePoint(*quad[0],side)).length
        du=.005/width;dv=.005/height
        ServiceGrid('EngineLouvreBank'+row+'Backing'+str(side),quad,side,'Dark')
        ServiceRim('EngineLouvreBank'+row+'Rim'+str(side),quad,side,ServicePerimeter(0,1,0,1),ServicePerimeter(-du,1+du,-dv,1+dv))
        for index in range(spec['count']):
            # Each cell retains one dark opening and a forward attached hood;
            # centered free strips would create an extra black end aperture.
            u0=(index+.60)/spec['count'];u1=(index+1)/spec['count']
            obj=ServiceGrid('EngineLouvreBank'+row+'Slat'+str(side)+'_'+str(index),quad,side,'Skin',u0,u1,.035,.965,lambda u,v:.004+(u1-u)/(u1-u0)*.006,columns=2,rows=8)
            obj['reconstructionScope']='Slanted louvre sheet over an actual skin aperture and inferred20mm cavity; hidden airflow path not modeled'
        single=spec['single'];path=RoundedServicePath();outer=[(.5+(u-.5)*1.16,.5+(v-.5)*1.06) for u,v in path]
        RoundedServiceBacking('EngineLouvreSingle'+row+'Backing'+str(side),single,side)
        ServiceRim('EngineLouvreSingle'+row+'Rim'+str(side),single,side,path,outer)
        ServiceGrid('EngineLouvreSingle'+row+'Hood'+str(side),single,side,'Skin',.52,.88,.10,.90,lambda u,v:.004+(.88-u)/.36*.005,columns=2,rows=7)
    # This underside row is partly hidden in the selected view. Preserve its
    # preceding reconstruction; it is not promoted to a measured factory count.
    for index in range(7):
        y=2.55-index*.043;angles=[1.85+(2.12-1.85)*k/6 for k in range(7)]
        ForebodyPatch('EngineLouvreOpeningBottom'+str(side)+str(index),[y+.0045,y-.0045],angles,side,'Dark',.0024)
        ForebodyPatch('EngineLouvreHoodBottom'+str(side)+str(index),[y+.0045,y],angles,side,'Skin',lambda yy:.0028+(y+.0045-yy)/.0045*.004)


def OutletPath(scale=1,steps=12):
    cy=outletSpec['centerY'];cz=outletSpec['centerZ'];ry=outletSpec['halfY']*scale;rz=outletSpec['halfZ']*scale;radius=min(ry,rz,outletSpec['cornerRadiusM']*scale);points=[]
    for y,z,start in [(cy+ry-radius,cz-rz+radius,-pi/2),(cy+ry-radius,cz+rz-radius,0),(cy-ry+radius,cz+rz-radius,pi/2),(cy-ry+radius,cz-rz+radius,pi)]:
        for k in range(steps):
            angle=start+(pi/2)*k/steps;points.append((y+radius*cos(angle),z+radius*sin(angle)))
    return points


def OutletPoint(y,z,side,outward):
    dz=z-engineZ;rx=Interp(sections,y,1);rz=Interp(sections,y,2);x=rx*sqrt(max(0,1-(dz/rz)**2))
    if y>=2.25:
        radius=Interp([(2.25,.608),(2.38,.626),(2.67,.657)],y,1);x=max(x,sqrt(max(0,radius*radius-dz*dz)))
    return Vector((side*(x+outward),y,z))


def BuildExhaustOutlet(side):
    vertices=[];uvs=[];faces=[];rim=[];n=48
    for ring,(outward,scale) in enumerate([(.001,1.12),(.025,1),(.012,.87),(-outletRecessDepth,.87)]):
        for index,(y,z) in enumerate(OutletPath(scale)):
            point=OutletPoint(y,z,side,outward);vertices.append(point);uvs.append((index/n*2*pi*outletSpec['halfY']/1.5,ring*.015/.34))
            if ring==1:rim.append(point)
    for ring in range(3):
        for k in range(n):
            b=(k+1)%n;face=(ring*n+k,ring*n+b,(ring+1)*n+b,(ring+1)*n+k);faces.append(face if side>0 else face[::-1])
    obj=Mesh('ExhaustCollectorHood'+str(side),vertices,faces,'Exhaust',uvs);obj['reference']='Photo02/Photo03 visible compact rounded mouth; lower contour, hood depth and hidden routing remain reconstruction'
    Curve('ExhaustCollectorLip'+str(side),rim,.0035,'Steel',True)
    # Tessellate the backing instead of spanning the curved cover with a flat
    # ngon, which can put the middle of the visible mouth inside the skin.
    cavity=[];cavityUv=[];cavityFaces=[];rows=20;columns=3;scale=.87
    cy=outletSpec['centerY'];cz=outletSpec['centerZ'];ry=outletSpec['halfY']*scale;rz=outletSpec['halfZ']*scale;radius=outletSpec['cornerRadiusM']*scale
    for j in range(rows+1):
        z=cz-rz+2*rz*j/rows;edge=max(0,abs(z-cz)-(rz-radius));inset=radius-sqrt(max(0,radius*radius-edge*edge))
        for i in range(columns+1):
            y=cy-ry+inset+2*(ry-inset)*i/columns;cavity.append(OutletPoint(y,z,side,-outletRecessDepth));cavityUv.append((y/1.5,(z-engineZ)/.34))
    for j in range(rows):
        for i in range(columns):
            a=j*(columns+1)+i;face=(a,a+1,a+columns+2,a+columns+1);cavityFaces.append(face if side>0 else face[::-1])
    Mesh('ExhaustCollectorCavity'+str(side),cavity,cavityFaces,'Dark',cavityUv)


root['servicePanelProfile']='Photo02RecessedBanks'
root['engineVentBanksJson']=json.dumps(serviceFeatures)
root['exhaustMouthReconstructionJson']=json.dumps(outletSpec)
root['servicePanelShapeScope']='Selected Photo02 visible bank/slot contours with actual apertures through body/adapter/cover layers,20mm louvre and25mm outlet cavities. Upper6 grouped apertures plus1 separate opening; lower7 plus1 separate opening, partly occluded and corroborated by Photo03. Opposite side, cavity depths, hidden closure and underside row remain inferred. Full engine/bearer/propeller datums retained; photo-inferred mouth coordinates follow the declared camera profile.'
