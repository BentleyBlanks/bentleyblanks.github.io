"""Atlas coordinates shared by the Blender model and the Dadao texture bake."""

from itertools import accumulate
import math


ATLAS_SIZE = 1024
GRIP = (16, 276, 608, 216)
FACES = {"Guard": (640, 276, 128, 216), "Pommel": (784, 276, 224, 216)}
RIMS = {
    "Guard": ((716, 532, 284, 54), (716, 603, 134, 43), (866, 603, 134, 43), (716, 663, 284, 53)),
    "Pommel": ((716, 788, 284, 54), (716, 859, 134, 47), (866, 859, 134, 47)),
}
RIM_DEPTH = {"Guard": 7, "Pommel": 8}


def Plane(frame, x, y):
    return x * frame["cos"] + y * frame["sin"], -x * frame["sin"] + y * frame["cos"]


def PhotoPosition(frame, position):
    x, y, z = position
    scale = frame["scale"]
    return (z - frame["zMin"]) / scale + frame["left"], y / scale + frame["center"], x / scale


def AtlasUv(rect, u, v):
    x, y, w, h = rect
    return (x + w * u) / ATLAS_SIZE, 1 - (y + h * v) / ATLAS_SIZE


def GripRange(fit):
    return fit["grip"][0][0] - 12, fit["grip"][-1][0] + 18


def FaceBounds(fit, name):
    u, v = zip(*(Plane(fit["frame"], *point) for point in fit["parts"][name]["loops"][0]))
    return min(u) - 3, max(u) + 3, min(v) - 3, max(v) + 3


def RimPaths(fit, name):
    for points in fit["parts"][name]["loops"]:
        contour = [Plane(fit["frame"], *point) for point in points]
        # Start the seam on the side nearest the cloth junction.
        first = max(range(len(contour)), key=lambda i: contour[i][0] * (1 if name == "Guard" else -1))
        contour = contour[first:] + contour[:first]
        lengths = [math.dist(a, b) for a, b in zip(contour, contour[1:] + contour[:1])]
        yield contour, [0, *accumulate(lengths)]


def ClosestOnRim(u, v, path):
    points, distance = path
    closest, station = math.inf, 0.
    for i, (a, b) in enumerate(zip(points, points[1:] + points[:1])):
        du, dv = b[0] - a[0], b[1] - a[1]
        length = distance[i + 1] - distance[i]
        fraction = min(1., max(0., ((u - a[0]) * du + (v - a[1]) * dv) / (length * length)))
        error = (u - a[0] - du * fraction) ** 2 + (v - a[1] - dv * fraction) ** 2
        if error < closest:
            closest = error
            station = (distance[i] + fraction * length) / distance[-1]
    return closest, station
