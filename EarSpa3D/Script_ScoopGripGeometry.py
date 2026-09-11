"""Continuous ear-scoop shaft in game millimetres; shared by GLB repair and Blender."""
import math


def ScoopGripGeometry(tier, sides=32):
    # A single skin replaces the intersecting shaft cylinder and grip sleeve.
    # Preserve the working shaft, length and existing machined grip envelope.
    profile = [(.4, 0), (.4, .08), (.7, .10), (3, .085), (8, .13), (10, .24), (10.06, .24)]
    for i in range(1, 65):
        y = 10 + 9.8 * i / 65
        # Wood is polished; metal has fine machining, not 10%-radius corrugation.
        groove = (0, .003, .004)[tier]
        radius = (.24 - (groove if i % 3 == 0 and 7 < i < 57 else 0)) * (1 + .05 * math.sin(i / 65 * math.pi))
        profile.append((y, radius))
    profile.extend([(19.75, .24), (19.8, .24 * .85), (20, .19), (20, 0)])
    positions, normals, uvs, faces = [], [], [], []
    for i, (y, radius) in enumerate(profile):
        # Average adjacent surface directions; seam copies receive identical normals.
        adjacent = []
        for a, b in [(i - 1, i), (i, i + 1)]:
            if a < 0 or b >= len(profile):
                continue
            dy, dr = profile[b][0] - profile[a][0], profile[b][1] - profile[a][1]
            length = math.hypot(dy, dr)
            adjacent.append((dy / length, -dr / length))
        nr, ny = map(sum, zip(*adjacent))
        length = math.hypot(nr, ny)
        nr, ny = nr / length, ny / length
        for j in range(sides + 1):
            angle = (j % sides) / sides * math.tau
            c, s = math.cos(angle), math.sin(angle)
            positions.append((radius * c, y, radius * s))
            normals.append((nr * c, ny, nr * s))
            # glTF V is flipped relative to Blender. Use physical axial distance,
            # not ring index: densely cut grooves must not restart/stretch grain.
            uvs.append((j / sides, 1 - (y - .4) / 19.6))
            if i and j < sides:
                a = (i - 1) * (sides + 1) + j
                b = i * (sides + 1) + j
                if profile[i - 1][1] > 0:
                    faces.append((a, b, a + 1))
                if radius > 0:
                    faces.append((a + 1, b, b + 1))
    return positions, normals, uvs, faces
