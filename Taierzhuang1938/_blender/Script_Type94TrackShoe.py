"""Reference-guided cast-shoe trial in physical local axes, one shared mesh.

The end-eye outlines are visible-feature hypotheses; their purpose and hidden
construction are not claimed. All bores are generated round in localXY; no
anisotropic assembly scaling is used for these new round sections.
"""


def BuildCastShoe(pitch,parent,api,layout):
    box,cylinder,mesh,lathe=(api[name]for name in ['Box','Cylinder','Mesh','Lathe'])
    width=layout['overallWidthM'];pieces=[]
    for x in [-layout['sideWebCenterXM'],layout['sideWebCenterXM']]:
        pieces.append(box('Track_CastSideWeb',(x,0,0),(layout['sideWebWidthM'],pitch-.009,.012),'Track',parent,.002))
    pieces.append(box('Track_CastCenterWeb',(0,0,-.002),(layout['centerWebWidthM'],.048,.012),'Track',parent,.0015))
    pieces.append(box('Track_RearCrossWeb',(0,-(pitch-.020)/2,0),(.15088,.009,layout['rearCrossWebHeightM']),'Track',parent,.0015))
    front=pitch/2-layout['frontBeamInsetFromHalfPitchM']
    pieces.append(box('Track_CastFrontBeam',(0,front,.002),(layout['crossBeamWidthM'],layout['crossBeamDepthM'],.012),'Track',parent,.003))
    for index,(x,padWidth,padDepth)in enumerate([(0,.042,.018),(-.045,.028,.016),(.045,.028,.016)]):
        pieces.append(box('Track_CastContactPad'+str(index),(x,front,layout['contactTopZM']-.006),(padWidth,padDepth,.012),'Track',parent,layout['contactPadBevelM']))
    outer,inner=layout['outerEyeRadiusM'],layout['innerEyeRadiusM']
    for side in [-1,1]:
        x=side*(width/2-outer);y=front-layout['eyeCenterYInsetM'];low,high=layout['eyeBottomZM'],layout['eyeTopZM']
        eye=lathe('Track_CastEndEye',[(inner,low),(outer,low),(outer,high),(inner,high),(inner,low)],
            (x,y,0),'Z','Track',parent,24 if api['QUALITY']=='High'else 12)
        for face in eye.data.polygons:face.use_smooth=abs(face.normal.z)<.9
        pieces.append(eye)
    pieces.append(cylinder('Track_HingePin',(0,pitch/2-.005,-.002),.0085,width,'Track','X',parent,12 if api['QUALITY']=='High'else 8))
    for x in [-.06232,.06232]:
        vertices=[(x-.00492,-.016,-.005),(x+.00492,-.016,-.005),(x+.00492,.016,-.005),(x-.00492,.016,-.005),
            (x-.00246,-.009,-.039),(x+.00246,-.009,-.039),(x+.00246,.009,-.039),(x-.00246,.009,-.039)]
        pieces.append(mesh('Track_OuterGuideHorn',vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Track',parent,.001))
    return pieces
