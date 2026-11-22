"""Period farm props rebuilt in metre-scale geometry from the production sheets."""

from math import cos, pi, sin
from random import Random

from mathutils import Vector

from Script_FieldApproachMesh import Beam, Box, Ellipsoid, Ribbon, SmoothPath, Tube


def Lash(mesh, rope, line, radius=.013):
    points = SmoothPath(line, 3)
    Tube(mesh, rope, points, [radius] * len(points), 6, tile=(.45, 7))


def AxialRing(mesh, material, center, section, segments=56):
    """Closed wheel/rim profile about the X axle."""
    x, y, z = center
    verts, faces, uv = [], [], []
    for r, axial in section:
        verts.extend((x + axial, y + r*cos(2*pi*j/segments), z + r*sin(2*pi*j/segments)) for j in range(segments))
    for i in range(len(section)):
        nxt = (i + 1) % len(section)
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((i*segments+j, i*segments+k, nxt*segments+k, nxt*segments+j))
            uv.append(((i/len(section), j/segments*3.4), (i/len(section), (j+1)/segments*3.4),
                       ((i+1)/len(section), (j+1)/segments*3.4), ((i+1)/len(section), j/segments*3.4)))
    mesh.Add(material, verts, faces, uv=uv, smooth=True)


def StrawFibers(mesh, materials, seed, center, size, count, *, cart=False):
    """Surface strands ride over the packed core and continue past its edge."""
    random = Random(seed)
    x, y, z = center
    a, b, h = size
    for i in range(count):
        u = random.uniform(-1,1)
        angle = random.uniform(-1.88,1.88)
        if cart and -.64 < u < -.14 and random.random() < .79:
            continue
        scale = (1 - .38 * abs(u)**6) if not cart else max(.24, (1 - u*u)**.44)
        u0 = u
        u1 = u + random.uniform(.07, .32) * random.choice([-1, 1])
        phi = angle + random.uniform(-.60, .60)
        p = Vector((x+a*sin(angle)*scale, y+b*u0, z+h*cos(angle)*scale))
        q = Vector((x+a*sin(phi)*scale, y+b*u1, z+h*cos(phi)*scale + random.uniform(-.065,.05)))
        mid = p.lerp(q,.54) + Vector((random.uniform(-.017,.017),0,random.uniform(-.02,.025)))
        w = random.uniform(.0014,.0039)
        Ribbon(mesh, materials[i % len(materials)], [p, mid, q], [w*.7,w,0])


def LoadedCart(mesh, materials):
    wood = materials.Make("CartOldOak", (.285,.220,.163), finish="wood")
    endwood = materials.Make("CartOakWeathered", (.337,.263,.191), finish="wood")
    shaded = materials.Make("CartOakShaded", (.228,.181,.140), finish="wood")
    metal = materials.Make("CartDarkIron", (.184,.162,.144), .86, finish="earth", metal=.38)
    rope = materials.Make("CartHemp", (.48,.36,.219), finish="cloth")
    cloth = materials.Make("CartHempCover", (.296,.264,.229), .98, finish="cloth", double=True)
    straw = materials.Make("CartPackedStraw", (.432,.317,.173), finish="straw")
    strands = [materials.Make(name, color, double=True) for name, color in [
        ("CartCutStraw",(.42,.305,.137)), ("CartBrightStraw",(.51,.374,.192)), ("CartShadowStraw",(.26,.167,.077)),
    ]]
    random = Random(961701)
    for side in [-1,1]:
        for index in range(3):
            x = side * (.647 + .004*index)
            z = .923 + index * .149
            Beam(mesh, (wood,shaded,endwood)[index], (x,-1.15,z-.007), (x,1.12,z+.008), .063,.143, bevel=.007)
        for index, y in enumerate([-1.15, -.64, .13, .65, 1.12]):
            x = side * .688
            Beam(mesh, endwood if index%2 else wood, (x,y,.700), (x+side*.025,y+.015,1.465+random.uniform(-.018,.048)),
                 .090,.081, bevel=.008)
            for z in [1.015,1.325]:
                Tube(mesh, metal, [(x+side*.042,y,z),(x+side*.050,y,z)], [.014,.013], 6)
        Beam(mesh, shaded, (side*.52,-1.29,.765), (side*.53,1.20,.79), .122,.138, bevel=.010)
        shaft = [(side*.492,-.04,.733), (side*.457,1.08,.721), (side*.384,1.68,.692),
                 (side*.341,2.32,.645), (side*.340,2.45,.648)]
        Tube(mesh, endwood, shaft, [.087,.071,.052,.034,.028], 10, aspect=.72, tile=(.8,.88))
        Beam(mesh, endwood, (side*.54,-.63,.770), (side*.42,-.30,.553), .098,.085, bevel=.009)
    for y in [-1.117,-.61,-.25,.55,1.103]:
        Beam(mesh, endwood, (-.645,y,.785), (.645,y,.779), .118,.119, bevel=.008)
    for i in range(9):
        x = -.573 + .143*i
        Beam(mesh, wood if i%2 else shaded, (x,-1.14,.852), (x,1.13,.852), .138,.051)
    for sign in [-1,1]:
        for i in range(3):
            z = .92 + .149*i
            y = sign * 1.131
            Beam(mesh, wood if i%2 else shaded, (-.625,y,z), (.625,y,z + .004), .058,.144, bevel=.006)

    # Twelve mortised spokes and a slim hammered iron band on each wheel.
    axle_y, axle_z = -.13, .691
    Tube(mesh, shaded, [(-.806,axle_y,axle_z),(.806,axle_y,axle_z)], [.066,.066], 10)
    for side in [-1,1]:
        x = side*.8
        center = (x,axle_y,axle_z)
        AxialRing(mesh, wood, center, [(.571,-.05),(.583,-.062),(.661,-.067),(.681,-.048),
                                     (.681,.048),(.661,.067),(.583,.061),(.571,.049)])
        AxialRing(mesh, metal, center, [(.663,-.068),(.686,-.068),(.69,-.057),(.69,.057),(.686,.068),(.663,.068)], 56)
        Tube(mesh, endwood, [(x-.122,axle_y,axle_z),(x-.079,axle_y,axle_z),(x+.082,axle_y,axle_z),
                             (x+.126,axle_y,axle_z)], [.091,.131,.128,.081], 20, tile=(1.2,1.1))
        for i in range(12):
            theta = i*pi/6+.087
            d = Vector((0,cos(theta),sin(theta)))
            p = Vector(center)
            Beam(mesh, endwood if i%3 else wood, p+d*.106, p+d*.603 + Vector((.013,0,0)), .055,.068, bevel=.005)
            p += d*.636
            Tube(mesh, metal, [p+Vector((side*.061,0,0)),p+Vector((side*.070,0,0))], [.014,.014], 5)
        for cap in [-1,1]:
            Tube(mesh, metal, [(x+cap*.108,axle_y,axle_z),(x+cap*.142,axle_y,axle_z)], [.077,.071], 13)

    Ellipsoid(mesh, straw, (0,-.015,1.412), (.65,1.21,.449), rings=11, sides=34, jitter=.017)
    StrawFibers(mesh, strands, 181, (0,-.015,1.413), (.655,1.20,.449), 480, cart=True)
    panels, faces = [], []
    rows, cols = 14, 29
    for j in range(rows):
        v = j / (rows - 1)
        for i in range(cols):
            u = i / (cols - 1)
            arc = (u-.50)*3.48
            y = -.02 - v*.64 - .063*cos(u*24) * (v**4) + .059*sin(arc*2 + v*7)
            dome = max(.44, (1 - (y / 1.28)**2)**.51)
            fold = (.017*sin(arc*14 + v*8) + .021*sin(arc*8 - v*6)) * (.45 + v*.55)
            x = (.675*dome + .05*v) * sin(arc) + fold*.45
            z = 1.408 + .463*cos(arc)*dome + fold + .058 - .14*v*v * (1 - max(0,cos(arc))*.73)
            panels.append((x,y,z))
    for j in range(rows - 1):
        for i in range(cols - 1):
            k = j*cols+i
            faces.append((k,k+1,k+cols+1,k+cols))
    uv = [tuple(((n%cols)/(cols-1), (n//cols)/(rows-1)) for n in face) for face in faces]
    mesh.Add(cloth,panels,faces,uv=uv,smooth=True)
    for j in range(1,cols-1,2):
        p = Vector(panels[(rows-1)*cols+j])
        q = p + Vector((random.uniform(-.008,.008),-.022,-.009))
        Ribbon(mesh, cloth, [p,p.lerp(q,.48),q], [.004,.003,0])
    for y in [.55,-.74]:
        d = (1 - (y/1.27)**2)**.46
        loop = [(-.68,y,.95),(-.674,y,1.355)]
        loop.extend((.661*d*sin((j-5)*pi/11), y+.032*sin(j*.65), 1.455 + .454*d*cos((j-5)*pi/11)) for j in range(11))
        loop.extend([(.671,y,1.29),(.678,y,.956)])
        Lash(mesh,rope,loop,.016)


def StrawRick(mesh, materials):
    core = materials.Make("RickCompressedStraw", (.402,.305,.171), finish="straw")
    strand = [materials.Make(name,c,double=True) for name,c in [
        ("RickDullFiber",(.36,.260,.147)), ("RickPaleFiber",(.456,.349,.201)), ("RickBrownFiber",(.262,.182,.097)),
    ]]
    verts, faces, uvs = [], [], []
    sides = 32
    rings = [(.004,.81),(.15,.97),(.45,1),(.73,.95),(.95,.79),(1.04,.47),(1.066,.09)]
    for k,(z,r) in enumerate(rings):
        for j in range(sides):
            angle = 2*pi*j/sides
            rx, ry = cos(angle),sin(angle)
            squash = .79 + .21*abs(rx)
            bump = 1 + .025*sin(j*1.71 + k*.83) + .035*cos(j*.52+k*.73)
            verts.append((r*1.18*pow(abs(rx),.64)*(1 if rx>=0 else -1)*bump+.029*sin(k*.58),
                          r*.75*pow(abs(ry),.66)*(1 if ry>=0 else -1)*bump,
                          z + (.054 + .032*squash)*sin(j*.73+k*.52)*(k/min(len(rings),k+1))))
    for k in range(len(rings)-1):
        for j in range(sides):
            nxt = (j+1)%sides
            faces.append((k*sides+j,k*sides+nxt,(k+1)*sides+nxt,(k+1)*sides+j))
            uvs.append(((j/sides*3,k*.18),((j+1)/sides*3,k*.18),((j+1)/sides*3,(k+1)*.18),(j/sides*3,(k+1)*.18)))
    mesh.Add(core,verts,faces,uv=uvs,smooth=True)
    mesh.Add(core, verts, [tuple(range(len(verts)-sides,len(verts)))], smooth=True)
    random = Random(298372)
    for i in range(244):
        row = random.randrange(1,5)
        j = random.randrange(sides)
        side = random.choice([-1,1])
        p = Vector(verts[row*sides+j])
        q = Vector(verts[(row+1)*sides+((j+side)%sides)])
        d = Vector((p.x,p.y,0)).normalized()
        mid =  p.lerp(q,random.uniform(.35,.72)) + d*random.uniform(.025,.062)
        tip = p + d*random.uniform(.009,.086) + Vector((0,0,-random.uniform(.013,.101)))
        blade = random.uniform(.0025,.0075)
        Ribbon(mesh, strand[i%len(strand)],[q+d*.011,mid,p+d*.018,tip],[blade,blade,blade*.6,0])


def SplitRailFence(mesh, materials):
    wood = materials.Make("FenceSplitWillow", (.26,.207,.16), finish="wood")
    cut = materials.Make("FenceWornWillow", (.32,.268,.196), finish="wood")
    rope = materials.Make("FenceBast", (.39,.294,.164))
    random = Random(938)
    for i,(x,y,top,r) in enumerate([(-1.64,.014,.97,.064),(-1.04,-.039,.864,.027),(-.29,.037,.831,.025),
                                     (.55,.011,.91,.033),(1.14,-.033,.818,.027),(1.65,-.005,.965,.058)]):
        Tube(mesh, wood if i%2==0 else cut, [(x,y,0),(x+.018,y,.33),(x+.046*sin(i*3),y-.02,top)],
             [r,r*.84,r*.72],5,furrow=.05,tile=(.66,1.31))
    for i,z in enumerate([.27,.51,.765]):
        rail = [(x, -.052 + random.uniform(-.047,.037), z+random.uniform(-.065,.048))
                for x in [-1.713,-1.31,-.72,-.13,.43,1.07,1.713]]
        Tube(mesh,cut if i==2 else wood,rail,[.029,.024,.022,.019,.023,.023,.023],5,furrow=.035,tile=(.65,1.5))
    Tube(mesh,wood,[(1.21,.03,0),(1.40,.018,.26),(1.66,-.001,.60)],[.025,.023,.013],5)
    for x in [-1.64,1.65]:
        for z in [.27,.51,.765]:
            for sign in [-1,1]:
                Tube(mesh,rope,[(x-.057,-.050,z-.033*sign),(x,-.125,z+.004),(x+.065,-.047,z+.036*sign)],
                     [.006,.007,.006],4)


def TileFarmhouse(mesh, materials):
    plaster = materials.Make("ClayRenderedWall", (.53,.379,.233), finish="earth")
    light = materials.Make("ClayRenderedGable", (.58,.423,.278), finish="earth")
    lime = materials.Make("ClayWeatheredFoot", (.55,.465,.34), finish="earth")
    stone = materials.Make("HousePlinthRubble", (.317,.289,.248), finish="earth")
    roof = materials.Make("GrayFiredTile", (.262,.276,.289), finish="earth")
    mottled = materials.Make("GrayFiredTileWeathered", (.312,.318,.322), finish="earth")
    black = materials.Make("HouseUnlitInterior", (.022,.017,.011))
    beam = materials.Make("FarmhouseElmJoinery", (.268,.203,.137), finish="wood")
    random = Random(77221)
    wall_w, wall_d, eave, ridge = 8.60, 4.20, 2.52, 3.65
    for sign in [-1,1]:
        Box(mesh,lime,(sign*4.187,0,.217),(.226,wall_d,.433))
        Box(mesh,light,(sign*4.187,0,(.42+eave)/2),(.226,wall_d,eave-.42))
        a,b,c = ((sign*4.302,-wall_d/2,eave),(sign*4.302,wall_d/2,eave),(sign*4.302,0,ridge-.12))
        mesh.Add(light,[a,b,c],[(0,1,2) if sign>0 else (0,2,1)])
    for lo,hi in [(-4.30,-2.66),(-1.52,1.08),(1.81,4.30)]:
        Box(mesh,plaster,((lo+hi)/2,-2.0,eave/2),(hi-lo,.225,eave))
    Box(mesh,plaster,(-2.09,-2.0,2.28),(1.14,.227,.48))
    for lo,hi in [(0,1.18),(1.912,eave)]:
        Box(mesh,plaster,(1.445,-2.0,(lo+hi)/2),(.74,.225,hi-lo))
    Box(mesh,plaster,(0,2.0,eave/2),(wall_w,.224,eave))
    Box(mesh,black,(-2.09,-1.882,1.004),(1.14,.02,2.01))
    # Recessed weathered door and the tiny timber lattice.
    for j in range(7):
        x = -2.59 + .165*j
        Box(mesh,beam,(x,-1.919,.915),(.160,.025,1.83))
    for x,z,w,h in [(-2.648,.98,.095,1.96),(-1.534,.98,.095,1.96),(-2.092,1.983,1.285,.124),
                     (1.095,1.547,.079,.806),(1.800,1.547,.079,.806),(1.447,1.202,.813,.077),(1.447,1.923,.914,.108)]:
        Box(mesh,beam,(x,-2.132,z),(w,.098,h))
    Box(mesh,black,(1.447,-1.927,1.55),(.728,.018,.751))
    for j in range(4):
        x = 1.20+j*.147
        z = 1.31+j*.144
        Box(mesh,beam,(x,-2.025,1.55),(.032,.034,.697))
        Box(mesh,beam,(1.447,-2.013,z),(.686,.037,.034))
    Box(mesh,black,(.32,2.116,1.96),(.188,.008,.172))
    for sign in [-1,1]:
        for j in range(27):
            x = -4.17 + .318*j + random.uniform(-.025,.025)
            if sign<0 and -2.67 < x < -1.55:
                continue
            h = random.uniform(.063,.140)
            for row in range(2 if random.random() < .55 else 1):
                Ellipsoid(mesh,stone,(x+row*.119,sign*2.11,h+row*.145),
                          (random.uniform(.123,.175),.087,h),rings=3,sides=5,jitter=.16,smooth=False)
    # Each clay channel follows a modest hollow ridge and full overhanging eave.
    rx, ry = 4.66, 2.48
    rails = 45
    for sign in [-1,1]:
        def roof_z(x, y):
            s = abs(y)/ry
            return (ridge + .095*(abs(x)/rx)**4 + (2.565-ridge)*s - .105*sin(pi*s))
        xs = [-rx+i*rx*2/rails for i in range(rails+1)]
        y0, y1 = 0, sign*ry
        for j in range(rails):
            x0, x1 = xs[j:j+2]
            w = x1-x0
            verts = []
            for piece in range(8):
                t = piece/7
                y = y0+(y1-y0)*t
                for k in range(4):
                    x = x0+w*k/3
                    barrel = .05*sin(pi*k/3)*(1 + random.uniform(-.071,.071))
                    step = .016*((piece+j%2)%2)
                    verts.append((x,y,roof_z(x,y)+barrel+step))
            faces = []
            for v in range(7):
                for u in range(3):
                    i = v*4+u
                    face = (i,i+1,i+5,i+4)
                    faces.append(face if sign>0 else tuple(reversed(face)))
            mesh.Add(mottled if random.random() < .21 else roof,verts,faces,smooth=True)
        Beam(mesh,beam,(-rx,sign*2.33,2.48),(rx,sign*2.33,2.48),.087,.12,bevel=.01)
        for j in range(27):
            x = -4.49+j*(8.98/26)
            Tube(mesh,beam,[(x,sign*2.047,2.57),(x,sign*2.44,2.51)],[.042,.032],6)
    ridge_path=[(-rx+i*(2*rx/22),0,ridge+.03+.087*abs(-1+i/11)**4) for i in range(23)]
    Tube(mesh,roof,ridge_path,[.085]*len(ridge_path),9,tile=(.79,1.3))
    Box(mesh,plaster,(-.96,.27,3.53),(.32,.25,.52))
    Box(mesh,stone,(-.96,.27,3.8),(.38,.31,.08))


def SoilClod(mesh, materials):
    earth = materials.Make("DitchClodOchre", (.351,.247,.157), finish="earth")
    Ellipsoid(mesh,earth,(0,0,.028),(.074,.051,.034),rings=7,sides=13,jitter=.135)


def PackDonkey(mesh, materials):
    fur = materials.Make("DonkeyAshCoat", (.334,.289,.235), finish="fur")
    dark = materials.Make("DonkeyDarkCoat", (.241,.209,.178), finish="fur")
    pale = materials.Make("DonkeyDunMuzzle", (.409,.377,.332), finish="fur")
    mane = materials.Make("DonkeyManeAndHooves", (.100,.087,.073), finish="fur")
    eye = materials.Make("DonkeyEye", (.027,.022,.017), .48)
    strapping = materials.Make("PackDonkeyLashing", (.439,.334,.196), finish="cloth")
    blanket = materials.Make("PackDonkeyTwill", (.308,.235,.162), finish="cloth")
    pack = materials.Make("DonkeyStrawBundle", (.465,.352,.207), finish="straw")
    sack = materials.Make("DonkeyBurlapBundle", (.402,.319,.218), finish="cloth")
    Ellipsoid(mesh,fur,(0,-.055,.82),(.281,.684,.286),rings=12,sides=18,jitter=.012)
    Ellipsoid(mesh,dark,(0,.453,.873),(.262,.273,.325),rings=9,sides=15,jitter=.014)
    Ellipsoid(mesh,fur,(0,.573,1.078),(.174,.205,.312),along=(0,.58,.82),rings=9,sides=14)
    Ellipsoid(mesh,dark,(0,.804,1.235),(.136,.140,.238),along=(0,-.61,.78),rings=9,sides=14)
    Ellipsoid(mesh,pale,(0,.933,1.063),(.120,.159,.110),along=(0,.55,.83),rings=7,sides=14)
    Ellipsoid(mesh,mane,(0,.485,1.154),(.052,.153,.082),along=(0,.66,.75),rings=6,sides=10)
    for sign in [-1,1]:
        x = sign*.138
        fore = [(x,.35,.86),(x,.368,.62),(x,.373,.423),(x,.386,.224),(x,.380,.075)]
        aft = [(sign*.173,-.517,.85),(sign*.176,-.593,.617),(sign*.155,-.514,.461),
               (sign*.177,-.582,.271),(sign*.176,-.601,.073)]
        for j,leg in enumerate([fore,aft]):
            if sign<0:
                leg = [(a,b-(c < .53)*(.04 if j==0 else -.059),c) for a,b,c in leg]
            pat = SmoothPath(leg,3)
            Tube(mesh,fur,pat,[.027+.075*(1-i/(len(pat)-1))**2 for i in range(len(pat))],8,aspect=1.18)
            a,b,_ = leg[-1]
            Ellipsoid(mesh,mane,(a,b+.008,.048),(.043,.064,.048),rings=4,sides=8,jitter=.025)
        ear = [(sign*.074,.754,1.393),(sign*.088,.759,1.487),(sign*.119,.773,1.579),(sign*.145,.783,1.641)]
        Tube(mesh,dark,ear,[.048,.053,.036,.004],9,aspect=.58)
        Tube(mesh,mane,[(sign*.082,.787,1.427),(sign*.093,.797,1.492),(sign*.121,.797,1.577)],
             [.021,.026,.008],6,aspect=.59)
        Ellipsoid(mesh,eye,(sign*.126,.848,1.277),(.013,.024,.016),rings=5,sides=8)
        Ellipsoid(mesh,eye,(sign*.065,1.054,1.07),(.014,.013,.009),rings=4,sides=7)
        Ellipsoid(mesh,pack,(sign*.352,-.075,.953),(.249,.44,.252),rings=9,sides=18,jitter=.044)
        Ellipsoid(mesh,sack,(sign*.394,-.087,.941),(.223,.353,.236),rings=8,sides=17,jitter=.033)
        for y in [-.35,.169]:
            Lash(mesh,strapping,[(sign*.087,y,1.146),(sign*.338,y,1.179),(sign*.575,y,1.088),
                                 (sign*.599,y,.895),(sign*.421,y,.731),(sign*.245,y,.777)],.010)
    Ellipsoid(mesh,blanket,(0,-.083,1.04),(.35,.488,.14),rings=7,sides=16,jitter=.018)
    Lash(mesh,strapping,[(-.113,.847,1.269),(-.123,.931,1.118),(0,1.038,1.137),
                         (.121,.937,1.12),(.116,.843,1.276)],.010)
    tail = [(0,-.646,.984),(-.009,-.726,.807),(.008,-.774,.679),(.037,-.812,.505),(.019,-.804,.432)]
    Tube(mesh,mane,SmoothPath(tail,2),[.036,.035,.030,.027,.024,.026,.029,.021,.004],7)
