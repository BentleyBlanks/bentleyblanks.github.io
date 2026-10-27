"""Reopen the independent packed PBR sources in the controlled batch process."""
import bpy
import hashlib
import json
import sys
from pathlib import Path

repoDir=Path(__file__).resolve().parents[2]
sourceDir=Path(next((v.split('=',1)[1]for v in sys.argv if v.startswith('--source-dir=')),'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank'))
report=[]
markReviewed='--mark-reviewed' in sys.argv
contractArgument=next((value.split('=',1)[1] for value in sys.argv if value.startswith('--contract=')),None)
contractFile=Path(contractArgument).resolve() if contractArgument else repoDir/'Taierzhuang1938/Model/Type89MediumTank/Data_ReferenceContract.json'
contract=json.loads(contractFile.read_text(encoding='utf8'))
if markReviewed:
    assert contract['status']=='TechnicallyAndVisuallyReviewedWithDeclaredInferences','Finish reference review before stamping source files'
recipe=None
for quality,expected in [('High',contract['sourceTrianglesBeforeExportCleanup']),('Game',contract['selectedGameSourceTrianglesBeforeCleanup'])]:
    file=sourceDir/f'Scene_Type89MediumTank{quality}Pbr.blend'
    bpy.ops.wm.open_mainfile(filepath=str(file))
    scene=bpy.context.scene
    root=bpy.data.objects['Model_Type89MediumTank']
    assert root['geometryVersion']==contract['geometryVersion'],root.get('geometryVersion')
    assert root.get('geometryRecipeSha256'),'Missing reproducible geometry recipe identity'
    if recipe is None:recipe=root['geometryRecipeSha256']
    else:assert root['geometryRecipeSha256']==recipe,'High/game editable sources come from different recipes'
    objects=[root]+list(root.children_recursive)
    meshes=[obj for obj in objects if obj.type=='MESH']
    triangles=0
    images=set()
    materials=set()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles+=len(obj.data.loop_triangles)
        assert obj.data.uv_layers.active, f'Missing UV: {obj.name}'
        assert len(obj.data.uv_layers.active.data)==len(obj.data.loops)
        materials.update(slot.material for slot in obj.material_slots if slot.material)
    for material in materials:
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or not node.image:continue
            image=node.image
            images.add(image)
            assert image.packed_file, f'Unpacked image: {image.name}'
            # Reopened packed images are decoded lazily; actually request pixels.
            assert len(image.pixels)>0 and image.has_data, f'Undecodable packed image: {image.name}'
            expectedSpace='sRGB' if 'Base' in node.label else 'Non-Color'
            assert image.colorspace_settings.name==expectedSpace, f'Wrong colour space: {image.name}'
    authoring=[material for material in bpy.data.materials if material.name.endswith('Authoring')]
    assert scene['Type89Stage']=='Pbr' and scene['Type89Quality']==quality
    assert scene.unit_settings.system=='METRIC' and scene.unit_settings.scale_length==1
    assert triangles==expected,(quality,triangles,expected)
    assert len(images)==contract.get('activePackedImages',21) and len(materials)==contract.get('materialCount',8),(len(images),len(materials),[mat.name for mat in authoring])
    if contract.get('materialCount',8)==9:
        assert root['surfaceRevision']==contract['materialRevision']and not root['pbrProbe']
        cast=next(mat for mat in materials if mat.get('Type89Role')=='CastArmor')
        shader=next(node for node in cast.node_tree.nodes if node.type=='BSDF_PRINCIPLED')
        assert shader.inputs['Normal'].links[0].from_node.label=='MicroFilmNormal'
        assert shader.inputs['Coat Normal'].links[0].from_node.inputs['Color'].links[0].from_node.label=='Normal'
    assert all(bpy.data.materials.get('Material_Type89'+role+'Authoring') for role in ['Armor','Steel','Track','Rubber','Exhaust','Glass','Guard'])
    assert len([obj for obj in objects if obj.name.startswith('Node_TrackLink')])==2*contract['linksPerSide']
    assert all(bpy.data.objects.get(name) for name in ['Node_MainGunPitch','Node_MainGunRecoil','Node_CommanderHatchFront','Node_CommanderHatchRear'])
    if markReviewed:
        root['acceptance']='TECHNICALLY_AND_VISUALLY_REVIEWED_WITH_DECLARED_INFERENCES'
        root['referenceReview']='Restored Tsuchiura Otsu; inferred surfaces/interiors recorded in Data_ReferenceContract.json'
        bpy.ops.wm.save_as_mainfile(filepath=str(file))
    row={'quality':quality,'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'geometryVersion':root['geometryVersion'],'geometryRecipeSha256':recipe,'rawTriangles':triangles,'meshObjects':len(meshes),'materials':len(materials),'activePackedImages':len(images),'editableAuthoringMaterials':len(authoring),'unitScale':scene.unit_settings.scale_length,'pass':True}
    report.append(row)
result={'pass':True,'sourceProjects':report,'note':'Counts include every repeated track instance. Game export separately removes zero-area triangles without changing the editable source.'}
(repoDir/'Taierzhuang1938/_shots/Type89MediumTank/Data_SourceReopenAudit.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
