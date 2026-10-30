"""Editable metric metal finish for SurfaceV44; all wear placement is inferred.

Return shader sockets to the shared baker. These are material changes only;
the existing articulated surfaces, UV checkpoint and collision limits survive.
"""


def RefineFinish(api, tree, role, position, cast, wear, coarse, contact,
                 base, rough, metallic, micro, bumpDistance):
    node, mathNode, ramp, mix, noise = (api[key] for key in
        ['Node', 'Math', 'Ramp', 'Mix', 'Noise'])

    def Directional(scale, name):
        direction = node(tree, 'ShaderNodeVectorMath', name + ' metric axes')
        direction.operation = 'MULTIPLY'
        direction.inputs[1].default_value = scale
        tree.links.new(position, direction.inputs[0])
        return noise(tree, direction.outputs['Vector'], 1, 2, name)

    if role == 'Paint':
        # Restrained pigment; detail is carried mainly by normal/roughness.
        pigment = ramp(tree, coarse, .23, .76, 'Fine finish pigment range')
        base = mix(tree, pigment, (.082, .092, .058, 1),
                   (.103, .113, .075, 1), 'Quieter olive plate pigment')
        hairline = ramp(tree, Directional((1800, 65, 1500),
                        'Short handling hairlines'), .71, .85,
                        'Sparse broken handling hairlines')
        handling = mathNode(tree, 'ADD', .14,
                            mathNode(tree, 'MULTIPLY', wear, .62),
                            'Handling limits hairline coverage')
        hairline = mathNode(tree, 'MULTIPLY', hairline, handling,
                            'Localized faint coating scratches')
        base = mix(tree, mathNode(tree, 'MULTIPLY', hairline, .16), base,
                   (.18, .185, .155, 1), 'Faint scuffed coating pigment')
        rough = mix(tree, hairline, rough, (.58,)*3+(1,),
                    'Scuffed coating scatters reflections')
        micro = mathNode(tree, 'SUBTRACT', micro,
                         mathNode(tree, 'MULTIPLY', hairline, .22),
                         'Shallow handling marks below paint surface')
        castPits = ramp(tree, noise(tree, position, 620, 2,
                        'Fine casting pore field'), .70, .83,
                        'Sparse casting pores')
        castPits = mathNode(tree, 'MULTIPLY', castPits, cast,
                            'Pores belong to cast fittings')
        micro = mathNode(tree, 'SUBTRACT', micro,
                         mathNode(tree, 'MULTIPLY', castPits, .24),
                         'Small casting pores through thin repaint')
        rough = mix(tree, castPits, rough, (.68,)*3+(1,),
                    'Matte interiors of casting pores')
        bumpDistance = mix(tree, cast, (.00042,)*3+(1,),
                           (.00078,)*3+(1,), 'Coating and casting relief depth')
    elif role == 'Track':
        # Vary polished lands within the actual contact-face mask. Do not
        # paint silver uniformly along every edge or expose the cavities.
        rub = ramp(tree, Directional((1700, 85, 600),
                   'Broken longitudinal track rubbing'), .23, .79,
                   'Unequal working-face polish')
        rub = mix(tree, rub, (.28,)*3+(1,), (1,)*4,
                  'Interrupted contact polish strength')
        working = mathNode(tree, 'MULTIPLY', contact, rub,
                           'Contact wear restricted to authored lands')
        base = mix(tree, working, (.052, .059, .051, 1),
                   (.34, .36, .33, 1), 'Cast shoe and broken rubbed steel')
        rough = mix(tree, working, (.72,)*3+(1,), (.20,)*3+(1,),
                    'Rough cavities and interrupted smooth lands')
        pits = ramp(tree, noise(tree, position, 540, 3,
                    'Track casting fine pits'), .66, .80,
                    'Irregular shallow cast pits')
        cavity = mathNode(tree, 'SUBTRACT', 1, contact,
                          'Working faces suppress cast-pit relief')
        pits = mathNode(tree, 'MULTIPLY', pits, cavity)
        micro = mathNode(tree, 'SUBTRACT', micro,
                         mathNode(tree, 'MULTIPLY', pits, .30),
                         'Casting pits retained away from working lands')
        rough = mix(tree, pits, rough, (.81,)*3+(1,),
                    'Pitted recess finish')
        bumpDistance = .00062
    elif role == 'Steel':
        turning = Directional((2100, 65, 2100),
                              'Fine longitudinal gun-steel machining')
        rough = mix(tree, turning, (.23,)*3+(1,), (.39,)*3+(1,),
                    'Blued steel fine machining sheen')
        micro = mathNode(tree, 'ADD', mathNode(tree, 'MULTIPLY', micro, .7),
                         mathNode(tree, 'MULTIPLY', turning, .3),
                         'Two-scale gun-steel tooling')
        bumpDistance = .000085
    return base, rough, metallic, micro, bumpDistance
