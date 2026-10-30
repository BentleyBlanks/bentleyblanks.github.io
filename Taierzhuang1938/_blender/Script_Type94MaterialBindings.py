"""Resolve imported construction aliases before choosing PBR bake owners."""
import json,re
import bpy


def CanonicalizeMaterialSlots(scene):
    assert scene.get('BlenderMcpTask')=='Type94Tankette'
    rows=[]
    for obj in scene.objects:
        if obj.type!='MESH':continue
        for index,material in enumerate(obj.data.materials):
            assert material is not None,'Every asset material slot must be explicit'
            match=re.fullmatch(r'(Material_Type94(?:Paint|Steel|Track|Rubber|Dark|White|Red))(?:\.\d+)?',material.name)
            assert match,'Unclassified Type94 material: '+material.name
            canonical=bpy.data.materials.get(match.group(1));assert canonical is not None
            if material!=canonical:
                rows.append(dict(owner=obj.name,slot=index,previous=material.name,canonical=canonical.name));obj.data.materials[index]=canonical
    scene['SurfaceMaterialAliasesNormalized']=True
    scene['SurfaceMaterialAliasBindingsJson']=json.dumps(rows)
    return rows
