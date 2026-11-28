"""Bake close-range contact occlusion into the authored Dadao UV strips."""

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from Script_BuildYangYunfengDadao import BuildParts


SIZE = 1024
RADIUS = .024
RAY_COUNT = 48


def Rasterize(meshes):
    depth = np.full((SIZE, SIZE), -np.inf, dtype=np.float32)
    positions, smoothNormals, faceNormals = (
        np.zeros((SIZE, SIZE, 3), dtype=np.float32) for _ in range(3)
    )
    views = ((0, 1), (0, 1), (1, -1), (1, 1))
    for mesh in meshes:
        mesh.calc_loop_triangles()
        vertices = np.array([tuple(vertex.co) for vertex in mesh.vertices])
        uv = np.array([tuple(loop.uv) for loop in mesh.uv_layers.active.data])
        atlas = (uv * (1, -1) + (0, 1)) * SIZE - .5
        cornerNormals = np.array([tuple(normal.vector) for normal in mesh.corner_normals])
        for tri in mesh.loop_triangles:
            loops = list(tri.loops)
            points = atlas[loops]
            minX, minY = np.maximum(np.ceil(points.min(axis=0)).astype(int), 0)
            maxX, maxY = np.minimum(np.floor(points.max(axis=0)).astype(int) + 1, SIZE)
            ab, ac = points[1:] - points[0]
            det = ab[0] * ac[1] - ab[1] * ac[0]
            if abs(det) < 1e-8 or minX >= maxX or minY >= maxY:
                continue
            x, y = np.meshgrid(np.arange(minX, maxX) - points[0, 0], np.arange(minY, maxY) - points[0, 1])
            b = (x * ac[1] - y * ac[0]) / det
            c = (ab[0] * y - ab[1] * x) / det
            weights = np.stack((1 - b - c, b, c), axis=-1)
            region = np.s_[minY:maxY, minX:maxX]
            surface = weights @ vertices[list(tri.vertices)]
            # Use one side on shared face charts and keep the outer surface in rim projections.
            strip = min(3, int((points[:, 1].mean() + .5) / (SIZE // 4)))
            axis, sign = views[strip]
            score = sign * surface[..., axis]
            front = (weights.min(axis=-1) >= -1e-7) & (score > depth[region])
            depth[region][front] = score[front]
            positions[region][front] = surface[front]
            smoothNormals[region][front] = (weights @ cornerNormals[loops])[front]
            faceNormals[region][front] = tuple(tri.normal)
    return positions, smoothNormals, faceNormals, np.isfinite(depth)


def Hemisphere():
    angle = math.pi * (3 - math.sqrt(5))
    for i in range(RAY_COUNT):
        radius = math.sqrt((i + .5) / RAY_COUNT)
        yield (radius * math.cos(angle * i), radius * math.sin(angle * i), math.sqrt(1 - radius * radius))


def TraceOcclusion(meshes):
    positions, smoothNormals, faceNormals, coverage = Rasterize(meshes)
    vertices, triangles = [], []
    for mesh in meshes:
        offset = len(vertices)
        vertices.extend(vertex.co.copy() for vertex in mesh.vertices)
        triangles.extend(tuple(offset + index for index in tri.vertices) for tri in mesh.loop_triangles)
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    rays = tuple(Hemisphere())
    output = np.ones(coverage.shape, dtype=np.float32)
    for y, x in np.argwhere(coverage):
        normal = Vector(smoothNormals[y, x]).normalized()
        face = Vector(faceNormals[y, x])
        if normal.dot(face) < .4:
            normal = face
        tangent = normal.cross(Vector((0, 0, 1) if abs(normal.z) < .9 else (0, 1, 0))).normalized()
        bitangent = normal.cross(tangent)
        origin = Vector(positions[y, x]) + .00019 * face
        shaded, visibleRays = 0.0, 0
        for u, v, n in rays:
            direction = u * tangent + v * bitangent + n * normal
            if direction.dot(face) <= 0:
                continue
            visibleRays += 1
            _, _, _, distance = tree.ray_cast(origin, direction, RADIUS)
            if distance is not None:
                shaded += (1 - distance / RADIUS) ** 1.25
        output[y, x] = max(.26, 1 - 1.55 * shaded / max(1, visibleRays))
    return output, coverage


def BakeAo(output):
    meshes = []
    try:
        for name, source in BuildParts():
            mesh = bpy.data.meshes.new("Dadao AO " + name)
            meshes.append(mesh)
            source.to_mesh(mesh)
            source.free()
        values, coverage = TraceOcclusion(meshes)
        output = Path(output)
        np.savez_compressed(output, ao=values, coverage=coverage)
        print(f"{coverage.sum():,} AO surface texels, min {values.min():.3f}, {np.count_nonzero(values < .80):,} texels below .80")
    finally:
        for mesh in meshes:
            bpy.data.meshes.remove(mesh)
