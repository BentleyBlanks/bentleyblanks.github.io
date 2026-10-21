"""Export actual newly projected PBR and independently inventory the five low parts."""
import bpy, runpy, json
from pathlib import Path

def ExportProjected(repo,projectionFile,outputDir):
    repo,projectionFile,outputDir=Path(repo),Path(projectionFile),Path(outputDir)
    outputDir.mkdir(parents=True,exist_ok=True)
    ex=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanLodExportV13.py'))
    uv=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityLod40kV13.py'))
    normal=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    evidence=ex['Evidence'];projection=json.loads(projectionFile.read_text(encoding='utf-8-sig'))
    assert not projection['partialProbe'] and projection['resolutionPerPart']==[4096,4096]
    root=bpy.data.objects['Pack_Root'];parts=ex['parts'];expected={};rows=[];inventory=[]
    for role in parts:
        obj=bpy.data.objects[role];assert obj.parent==root and obj.type=='MESH'
        state=normal['MeshEvidence'](obj.data);actual=next(o for o in projection['objects'] if o['kind']=='Low' and o['part']==role)
        assert state==actual['before']==actual['after']
        allUvAudit=uv['AuditUvAndGeometry'](obj.data)
        active=allUvAudit['uvLayers'][state['activeAtlasUv']]
        activePassed=(allUvAudit['zeroAreaGeometryTriangles']==0 and allUvAudit['nonfiniteVertices']==0 and active['zeroAreaTriangles']==0 and active['nonfiniteTriangles']==0 and active['outsideUnitTriangles']==0)
        assert activePassed
        audit={**allUvAudit,'passed':activePassed,'allUvLayerAuditPassed':allUvAudit['passed'],'validationScope':'Actual geometry and the one active ProjectionUV atlas used by every PBR slot as TEXCOORD_0; unused legacy UV layers are diagnostic only and remain unchanged','validatedAtlasUv':state['activeAtlasUv']}
        expected[role]=state['triangles']
        rows.append({'object':role,'canonicalName':role,'sourceName':role,'part':role,'triangles':state['triangles'],'vertices':state['vertices'],'sourceGeometryAndUvs':state,'sourceGeometryAndUvsAfterBake':state,'sourceUv':state['activeAtlasUv'],'exportUv':state['activeAtlasUv'],'exportTexCoord':0})
        highTris=sum(o['after']['triangles'] for o in projection['objects'] if o['kind']=='High' and o['part']==role)
        inventory.append({'object':role,'sourceName':role,'part':role,'sourceTriangles':highTris,'actualTriangles':state['triangles'],'audit':audit,'projectionBaseline':state})
    assert 0<sum(expected.values())<=40000
    geom={'generator':'SichuanLodProjectionGeometryV13','triangleLimit':40000,'totalTriangles':sum(expected.values()),'partTriangles':expected,'sourceTriangles':sum(o['sourceTriangles'] for o in inventory),'meshObjects':5,'objects':inventory,'allFivePartsRetained':True,'allMeshObjectsRetained':False,'meshObjectsMergedForProjection':True,'rootPivotTransformsAndParentsUnchanged':False,'rootPivotAndPartOwnershipPreserved':True,'readyForNormalTransfer':True,'uvReunwrapPerformed':True,'projectionBake':evidence(projectionFile),'sourceBlend':projection['sourceHighBlend'],'highRuntimeSource':projection['sourceHighRuntime']}
    geomFile=outputDir.parent/'Data_ProjectionGeometryV13.json';geomFile.write_text(json.dumps(geom,indent=2)+'\n')
    beforeFile=evidence(projection['sourceHighBlend']['path']);assert beforeFile==projection['sourceHighBlend']
    selected=[root,*root.children_recursive]
    bpy.ops.object.select_all(action='DESELECT')
    for o in selected:o.hide_render=False;o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=root
    file=outputDir/'Model_SichuanPackProjected40kV13.glb'
    with bpy.context.temp_override(object=root,active_object=root,selected_objects=selected,selected_editable_objects=selected):
        result=bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_normals=True,export_tangents=True,export_materials='EXPORT',export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_vertex_color='NONE',export_image_format='AUTO')
    assert 'FINISHED' in result
    actualGlb,atlases=ex['AuditAndExtractGlb'](file,expected,outputDir)
    for row in rows:assert normal['MeshEvidence'](bpy.data.objects[row['object']].data)==row['sourceGeometryAndUvs']
    imageNormalizations=[]
    for role in parts:
        for channel in ('Base','Normal','Orm'):
            original=projection['atlases'][role]['images'][channel];exported=atlases[role]['images'][channel]
            if original['bytes']!=exported['bytes'] or original['sha256']!=exported['sha256']:
                imageNormalizations.append({'part':role,'channel':channel,'projected':original,'exported':exported})
    assert evidence(beforeFile['path'])==beforeFile
    report={'generator':'SichuanLod40kPbrV13','materialBakeMode':'projected-high-to-low-new-uv','originalHighAtlasBytesClaimedInherited':False,'projectionBake':evidence(projectionFile),'partialProbe':False,'resolutionPerPart':[4096,4096],'triangleBudget':40000,'glb':evidence(file),'sourceBlend':beforeFile,'sourceBlendBefore':beforeFile,'sourceBlendAfter':beforeFile,'sourceHighRuntime':projection['sourceHighRuntime'],'sourceLowBlend':evidence(bpy.data.filepath),'sourceLowBlendIsPreBindingWorkSnapshot':True,'callerMustSaveBoundLowBlendAndUpdateEvidenceBeforePackaging':True,'savedSourceFileUnchanged':True,'nativeSceneSavedOrRewritten':False,'sourceNativeSceneSavedOrRewritten':False,'objects':rows,'actualGlb':actualGlb,'atlases':atlases,'reduction':evidence(geomFile),'reductionInventory':{'byPart':expected,'objects':inventory},'highGeometryUvAndMaterialsUnchanged':True,'lowGeometryUvAndBasisUnchangedDuringBindingExport':True,'baseRoughnessMetallicAoImagePointersUnchanged':False,'upAxis':'+Y','units':'metres','root':'Pack_Root','referenceFidelityReviewed':False,'finalModelApprovedByUser':False}
    reportFile=outputDir/'Data_Lod40kPbrBakeV13.json';reportFile.write_text(json.dumps(report,indent=2)+'\n')
    if imageNormalizations:
        report['requiresImageContainerNormalization']=True;report['pendingImageContainerNormalization']=imageNormalizations
        reportFile.write_text(json.dumps(report,indent=2)+'\n')
    print('PROJECTED_RAW_EXPORTED',json.dumps({'triangles':sum(expected.values()),'glb':str(file),'report':str(reportFile)}))
    return report
