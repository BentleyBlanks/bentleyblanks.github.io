"""Read capabilities or run one explicitly requested native Quality part probe.

No import-time Blender actions. Root controls BlenderMCP and invokes these
functions in the saved independent QualityV12 source. A probe is not a final
full-asset export, native material approval or an instruction to save source.
"""
import json
from pathlib import Path
import runpy


def _Exporter(repo):
    return runpy.run_path(str(Path(repo)/'Taierzhuang1938/_blender/Script_SichuanQualityExportV12.py'))


def InspectQualityCapabilities(root, repo, outputDir=None, includeInventory=True):
    import bpy
    exporter = _Exporter(repo)
    targets = [item.identifier for item in sceneProperty(bpy.context.scene.render.bake, 'target').enum_items]
    gltf = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    pack = set(bpy.ops.uv.pack_islands.get_rna_type().properties.keys())
    packEnums = {name: [item.identifier for item in bpy.ops.uv.pack_islands.get_rna_type().properties[name].enum_items]
                 for name in ('udim_source', 'margin_method', 'shape_method') if name in pack}
    report = {'blenderVersion': bpy.app.version_string, 'source': bpy.data.filepath,
              'renderBakeTargets': targets, 'imageTargetSupported': 'IMAGE_TEXTURES' in targets,
              'vertexPreviewTargetSupported': 'VERTEX_COLORS' in targets,
              'packMergeOverlapExplicit': 'merge_overlap' in pack,
              'packProperties': sorted(pack), 'packEnumValues': packEnums, 'gltfProperties': sorted(gltf),
              'namedVertexPreviewSupported': all(key in gltf for key in ('export_vertex_color', 'export_vertex_color_name')),
              'mainRoute': 'Full native evaluated geometry, five 4096 self-baked PBR atlases; single-object Smart UV plus mathematical object rectangles, no global average/pack; source UV graphs pinned explicitly',
              'fallback': 'Vertex colour is a measured preview approximation, never a full-PBR replacement',
              'nativeInventory': exporter['SourceInventory'](root) if includeInventory else None,
              'nativeSceneChanged': False}
    if outputDir:
        folder = Path(outputDir); folder.mkdir(parents=True, exist_ok=True)
        (folder/'Data_QualityCapabilitiesV12.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print('QUALITY_CAPABILITIES', json.dumps(report), flush=True)
    return report


def sceneProperty(owner, name):
    return owner.bl_rna.properties[name]


def RunQualityPbrProbe(root, repo, outputDir, *, part='Pack_StrawMat', resolution=1024, samples=4):
    """Probe one real part; source remains unsaved and unmodified.

    Example in root's managed task:
      ns=runpy.run_path(repo/'.../Script_SichuanQualityProbeV12.py')
      ns['RunQualityPbrProbe'](bpy.data.objects['Pack_Root'],repo,
          repo/'tmp/SichuanBlanketPack/QualityV12/PbrProbe',part='Pack_StrawMat')
    Inspect native versus actual GLB, cap spiral and UV seams before full 4k.
    """
    exporter = _Exporter(repo)
    return exporter['BakeQualityPbr'](root, outputDir, partSubset=[part],
                                      resolution=resolution, samples=samples,
                                      exportFile=Path(outputDir)/('Model_QualityProbeV12_'+part+'.glb'))


def RunVertexFallbackProbe(root, repo, outputDir, sourceNames, *, shaderCornerNormals=False):
    exporter = _Exporter(repo)
    folder = Path(outputDir); folder.mkdir(parents=True, exist_ok=True)
    return exporter['ExportQualityPreview'](root, folder/'Model_QualityVertexProbeV12.glb',
                                            samples=4, sourceNames=sourceNames, bakeAo=True,
                                            normalMode='shader-corner' if shaderCornerNormals else 'geometry',
                                            allowPartialProbe=True)
