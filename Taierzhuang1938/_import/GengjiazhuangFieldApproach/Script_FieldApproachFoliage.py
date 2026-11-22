"""Hand-shaped elm scaffolds and low field growth, in Blender's Z-up metres."""

from math import cos, pi, sin
from random import Random

from mathutils import Vector

from Script_FieldApproachMesh import Ribbon, SmoothPath, Tube


def Fork(mesh, bark, points, radii, sides, resolution, *, phase=0, furrow=.04):
    curve = SmoothPath(points, resolution)
    widths = []
    for i in range(len(radii) - 1):
        widths.extend(radii[i] + (radii[i+1] - radii[i])*step/resolution for step in range(resolution))
    widths.append(radii[-1])
    Tube(mesh, bark, curve, widths, sides, furrow=furrow, phase=phase, tile=(max(.29, radii[0] * 2.8), .77))
    return curve


def Crown(mesh, material, random, curve, root_radius, *, spacing, levels, reach, variation):
    """Grow attached, tapering forks on an authored bough. Each fork turns in depth."""
    if not levels:
        return
    z = Vector((0, 0, 1))
    segments = max(3, spacing)
    for j in range(segments):
        fraction = .20 + .74 * (j + random.uniform(.1, .8)) / segments
        k = min(len(curve) - 2, max(1, int(fraction * (len(curve) - 1))))
        p = curve[k]
        d = (curve[k + 1] - curve[k - 1]).normalized()
        side = d.cross(z).normalized()
        if side.length < .2:
            side = Vector((1, 0, 0))
        # Alternating directions maintain areas of clear sky around the main boughs.
        a = j * 2.399 + variation + random.uniform(-.4, .4)
        off = side * cos(a) + d.cross(side) * sin(a)
        new_direction = (d * random.uniform(.31, .74) + off * random.uniform(.37, .8)
                         + z * random.uniform(-.09, .33)).normalized()
        length = reach * (1 - .44 * fraction) * random.uniform(.68, 1.21)
        radius = root_radius * (1 - .72 * fraction) * random.uniform(.69, 1.12)
        end = p + new_direction*length + z*(length*random.uniform(-.09, .19))
        controls = [p - d * radius*.55, p.lerp(end, .35) - off*length*.08,
                    p.lerp(end, .69) + off*length*.07, end]
        branch_curve = Fork(mesh, material, controls, [radius, radius * .63, radius * .37, max(.00085, radius * .055)],
                            7 if levels >= 3 else (5 if levels == 2 else 3), 2 if levels >= 2 else 1,
                            phase=a, furrow=.04 if levels >= 3 else .012)
        Crown(mesh, material, random, branch_curve, radius * .42, spacing=3,
              levels=levels - 1, reach=length * (.58 if levels >= 3 else .68), variation=a)


def OldElm(mesh, materials):
    bark = materials.Make("OldElmBark", (.245, .198, .151), finish="bark")
    twigs = materials.Make("OldElmTwigs", (.067, .052, .034))
    random = Random(381908)
    core = [(-.15, 0, -.045), (-.13, .018, .15), (-.10, .05, .39), (-.07, .015, .80),
            (-.06, -.05, 1.44), (.025, -.03, 2.17), (.10, .04, 2.91), (.015, .1, 3.67),
            (-.32, .23, 4.47), (-.58, .34, 5.23), (-.52, .55, 6.13), (-.72, .67, 7.05),
            (-.97, .73, 7.55)]
    core_radius = [.60, .48, .41, .36, .345, .329, .312, .267, .205, .159, .10, .045, .004]
    Fork(mesh, bark, core, core_radius, 27, 4, furrow=.076)
    for root, (direction, length) in enumerate([
        (-2.92, 1.39), (-2.2, 1.14), (-1.71, 1.64), (-1.29, 1.37), (-.33, 1.26),
        (.31, .96), (1.22, 1.07), (2.04, 1.24), (2.74, 1.06),
    ]):
        d = Vector((cos(direction), sin(direction), 0))
        cross = Vector((-d.y, d.x, 0))
        l = length
        anchor = Vector((-.13, .012, 0))
        controls = [anchor + d*.26 + Vector((0, 0, .39 + random.random()*.2)),
                    anchor + d*.45 + Vector((0, 0, .13)),
                    anchor + d*(l*.64) + cross*.082 + Vector((0, 0, .045)),
                    anchor + d*l - cross*.045 + Vector((0, 0, -.052))]
        r = random.uniform(.092, .17)
        branch = Fork(mesh, bark, controls, [r, r*.82, r*.46, .003], 10, 4, phase=root, furrow=.075)
        for side in [-1, 1]:
            p = branch[int(len(branch)*.57)]
            end = p + d*random.uniform(.24, .47) + cross*side*random.uniform(.11, .22)
            end.z = -.060
            Fork(mesh, bark, [p, (p+end)*.5 + Vector((0,0,.012)), end], [r*.29, r*.16, .002], 6, 3)
    # From the reference front the main limb travels right over the camera.
    boughs = [
        ([(.00,.04,2.99), (.55,-.01,3.69), (1.22,-.13,4.14), (1.95,-.18,4.35), (2.84,-.07,4.47), (3.74,.18,4.43), (4.73,.26,4.53)], [.226,.178,.129,.092,.057,.034,.004], 10, 1.45),
        ([(.84,-.10,3.91), (1.27,-.05,4.66), (1.86,.11,5.32), (2.42,.39,5.89), (3.14,.62,6.10)], [.114,.081,.059,.036,.003], 7, 1.20),
        ([(.06,.10,3.28), (-.69,-.05,3.53),(-1.17,-.11,4.05),(-1.76,-.10,4.52),(-2.42,-.21,4.84)], [.147,.102,.074,.035,.004], 8, 1.36),
        ([(-.23,.15,4.23), (-.70,.05,4.77),(-1.25,-.02,5.39),(-1.81,-.01,6.29),(-2.12,.19,6.82)], [.129,.103,.067,.036,.003], 7, 1.15),
        ([(-.45,.28,4.83), (-.12,.37,5.47),(.28,.27,6.06),(.74,.40,6.58),(1.39,.50,7.17)], [.119,.083,.052,.035,.004], 7, 1.02),
        ([(-.55,.41,5.45), (-1.06,.68,5.79),(-1.59,.95,6.26),(-2.05,1.2,6.39)], [.086,.061,.031,.003], 6, 1.13),
        ([(.03,.06,3.24),(.08,.73,3.57),(.37,1.37,4.03),(.49,2.04,4.64),(.65,2.77,4.77)], [.151,.108,.070,.039,.004], 7, 1.18),
        ([(.03,-.03,3.39),(.11,-.44,4.11),(-.11,-.84,4.74),(-.21,-1.39,5.28),(-.34,-1.82,5.41)], [.11,.081,.053,.026,.004], 7, 1.11),
        ([(.13,-.06,3.0),(.48,-.29,3.28),(.82,-.44,3.43),(1.21,-.57,3.48)], [.082,.064,.027,.003], 4, .76),
        ([(-.45,.43,5.48),(-.43,.47,6.03),(-.21,.38,6.66),(-.26,.47,7.46)], [.088,.064,.037,.003], 5, .74),
        ([(2.04,-.15,4.38),(2.43,-.35,4.81),(2.82,-.57,5.15),(3.30,-.58,5.30)], [.064,.048,.029,.003], 5, .93),
    ]
    for n, (points, radii, spacing, reach) in enumerate(boughs):
        curve = Fork(mesh, bark, points, radii, 13 if n < 4 else 10, 5, phase=n, furrow=.055)
        Crown(mesh, twigs, random, curve, radii[0] * .52, spacing=spacing, levels=3,
              reach=reach, variation=n*.86)
    Crown(mesh, twigs, random, SmoothPath(core[7:], 5), .09, spacing=7, levels=3, reach=1.26, variation=2.8)
    # Pendant offshoots break up the underside of the cropped canopy.
    for n, points in enumerate([
        [(.35,-.03,3.49),(.38,-.28,3.16),(.52,-.53,2.91),(.79,-.61,2.83)],
        [(-.64,-.08,3.52),(-.83,-.32,3.21),(-1.09,-.56,2.94),(-1.39,-.51,2.73)],
        [(1.28,-.15,4.14),(1.66,-.26,3.98),(2.03,-.40,3.69),(2.46,-.34,3.63)],
        [(2.17,-.15,4.39),(2.31,-.36,4.18),(2.66,-.51,3.96),(2.90,-.59,3.96)],
        [(2.89,-.06,4.48),(3.08,-.34,4.34),(3.29,-.42,4.06),(3.73,-.47,3.98)],
        [(.77,-.40,3.39),(.95,-.49,3.19),(1.31,-.46,3.19),(1.52,-.45,3.27)],
        [(-.91,-.20,3.84),(-1.09,-.32,3.66),(-1.54,-.41,3.58),(-1.82,-.46,3.47)],
    ]):
        curve = Fork(mesh, bark, points, [.029,.019,.012,.0022], 6, 3, phase=n)
        Crown(mesh, twigs, random, curve, .018, spacing=4, levels=2, reach=.51, variation=n*.73)


def FieldElm(mesh, materials):
    bark = materials.Make("FieldElmBark", (.275, .232, .181), finish="wood")
    tips = materials.Make("FieldElmTips", (.108, .088, .065))
    random = Random(11072)
    boughs = [
        ([(.01,0,0),(.025,0,.69),(.01,.015,1.32),(-.10,.075,1.78),
          (.04,.075,2.30),(.19,.16,3.1),(.20,.07,3.90),(.07,.04,4.78)],
         [.095,.081,.070,.060,.053,.037,.021,.003], 6, .75),
        ([(.007,.013,1.30),(.30,.10,1.69),(.66,.11,2.27),(1.09,.10,2.75),(1.47,.19,3.37),(1.82,.19,3.85)],
         [.065,.051,.044,.030,.019,.002], 6, .74),
        ([(-.06,.027,1.63),(-.35,-.08,2.02),(-.65,-.10,2.48),(-.97,-.16,2.89),(-1.38,-.27,3.31),(-1.66,-.24,3.72)],
         [.055,.046,.034,.022,.012,.002], 6, .64),
        ([(.025,.016,1.26),(-.09,.31,1.82),(-.14,.56,2.24),(.13,.91,2.61),(.26,1.08,2.93)],
         [.041,.038,.025,.019,.003], 4, .65),
        ([(.05,.075,2.32),(-.14,-.32,2.69),(-.33,-.58,3.02),(-.45,-.78,3.41)],
         [.031,.024,.012,.002], 4, .61),
    ]
    for n, (path, radii, spacing, reach) in enumerate(boughs):
        Fork(mesh, bark, path, radii, 9 if n == 0 else 6, 3, phase=n)
        stem = SmoothPath(path[2:] if n == 0 else path, 4)
        Crown(mesh, tips, random, stem, radii[0] * .52, spacing=spacing,
              levels=2, reach=reach, variation=n*.89)


def WheatTuft(mesh, materials):
    olive = [
        materials.Make("WheatOlive", (.16,.194,.070), double=True),
        materials.Make("WheatLight", (.215,.248,.101), double=True),
        materials.Make("WheatDryTips", (.226,.197,.087), double=True),
    ]
    random = Random(941)
    for crown, (x, y) in enumerate([(-.054, -.029), (.052,-.018), (.022,.037)]):
        for blade in range(4):
            a = blade * 2.4 + crown * 1.85
            h = random.uniform(.074, .149)
            spread = random.uniform(.029, .075)
            d = Vector((cos(a), sin(a), 0))
            p = Vector((x, y, 0))
            path = [p, p + d*spread*.21 + Vector((0,0,h*.65)),
                    p + d*spread*.55 + Vector((0,0,h*.94)),
                    p + d*spread + Vector((0,0,h*random.uniform(.77,1.08)))]
            Ribbon(mesh, olive[(blade+crown) % len(olive)], SmoothPath(path, 2),
                   [.0013,.0032,.0042,.0037,.0028,.0016,0])


def DryGrass(mesh, materials):
    colors = [
        materials.Make("DitchStrawDull", (.230,.160,.080), double=True),
        materials.Make("DitchStrawFlax", (.327,.241,.132), double=True),
        materials.Make("DitchStrawDark", (.17,.112,.056), double=True),
    ]
    random = Random(21123)
    for blade in range(17):
        a = random.uniform(0, 2*pi)
        h, spread = random.uniform(.058,.185), random.uniform(.06,.185)
        d = Vector((cos(a), sin(a), 0))
        p = d * random.uniform(0, .025)
        side = d.cross(Vector((0,0,1)))
        path = [p + Vector((0,0,-.028)), p + d*.016 + Vector((0,0,h*.45)),
                p + d*spread*.43 + Vector((0,0,h)),
                p + d*spread*.77 + side*.014 + Vector((0,0,h*.79)),
                p + d*spread - side*.012 + Vector((0,0,h*random.uniform(.09,.50)))]
        Ribbon(mesh, colors[blade % len(colors)], SmoothPath(path,2),
               [.0007,.0014,.0025,.0026,.0022,.0019,.0016,.0008,0], direction=side)
    for blade in range(5):
        a = blade * 2.4
        d = Vector((cos(a), sin(a), 0))
        path = [d*.025, d*.039 + Vector((0,0,-.028)), d*.059 + Vector((0,0,-.057)),
                d*.081 + Vector((0,0,-.082))]
        Ribbon(mesh, colors[2], path, [.0015,.001,.0007,0])
