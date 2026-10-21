"""Merge complete/validated-refresh Normal evidence without Blender or baking."""
import argparse
import copy
import hashlib
import json
from pathlib import Path


parts = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')


def Require(value, message):
    if not value:
        raise RuntimeError(message)


def Evidence(path):
    path = Path(path).resolve()
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            digest.update(chunk)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}


def Read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def CheckedImage(record):
    actual = Evidence(record['path'])
    Require(all(actual[key] == record[key] for key in ('bytes', 'sha256')), 'A recorded Normal/World PNG changed: '+record['path'])
    Require(record.get('width') == record.get('height') == 4096 and record.get('colourSpace') == 'Non-Color', 'Expected an actual 4K Non-Color field')
    return actual


def MergeNormalReports(oldFile, refreshFile, geometryFile, outputDir):
    old, new, geometry = Read(oldFile), Read(refreshFile), Read(geometryFile)
    inputs = {name: Evidence(path) for name, path in (
        ('originalFull', oldFile), ('validatedRefresh', refreshFile), ('currentGeometry', geometryFile))}
    for report in (old, new):
        Require(report.get('generator') == 'SichuanQualityNormalTransferV13' and report.get('resolution') == [4096, 4096], 'Expected actual V13 4K Normal-transfer reports')
        for row in report['objects']:
            Require(row['before'] == row['after'] == row['copyAfter'], 'A bake invocation altered its own mesh/UV/basis')
    Require(old.get('partialProbe') is False and set(old['normalMaps']) == set(parts), 'The original report must be a complete five-part bake')
    refreshed = set(new['normalMaps'])
    Require(refreshed == set(geometry['needsNormalRefreshParts']) and refreshed <= set(parts), 'Refresh parts differ from the actual validation delta')
    Require(geometry['generator'] == 'SichuanQualityLod40kV13' and geometry['totalTriangles'] <= 40000, 'Expected the current actual cleaned LOD inventory')
    oldRows = {(row['kind'], row['part'], row['originalName']): row for row in old['objects']}
    newRows = {(row['kind'], row['part'], row['originalName']): row for row in new['objects']}
    Require({key for key in oldRows if key[1] in refreshed} == set(newRows), 'Refresh lost or added a high/low source object')
    for key, row in newRows.items():
        if key[0] == 'High':
            Require(row['before'] == oldRows[key]['before'] and row['matrixWorld'] == oldRows[key]['matrixWorld'], 'A reused high World source changed')
    selected = [copy.deepcopy(newRows[key] if key[1] in refreshed else row) for key, row in oldRows.items()]
    current = {(row['part'], row['sourceName']): row for row in geometry['objects']}
    counts = {part: 0 for part in parts}
    for row in selected:
        row['evidenceInvocation'] = 'validatedRefresh' if row['part'] in refreshed else 'originalFull'
        if row['kind'] == 'Low':
            actual = current.get((row['part'], row['originalName']))
            Require(actual is not None and row['after'] == actual['normalEvidenceAfterExportValidation'], 'Chosen Low evidence does not match the current cleaned geometry: '+row['originalName'])
            Require(row['after']['triangles'] == actual['actualTriangles'], 'Chosen Low triangle inventory differs')
            row['currentObjectName'] = actual['object']
            counts[row['part']] += row['after']['triangles']
    Require(counts == geometry['partTriangles'] and sum(counts.values()) == geometry['totalTriangles'], 'Merged Normal evidence does not cover the current complete LOD')
    maps, reports, normalFiles, worldFiles, superseded = {}, {}, [], [], []
    for part in parts:
        source = new if part in refreshed else old
        maps[part], reports[part] = copy.deepcopy(source['normalMaps'][part]), copy.deepcopy(source['parts'][part])
        normalFiles.append(CheckedImage(maps[part]))
        worldFiles.append(CheckedImage(reports[part]['worldImage']))
        Require(reports[part]['lowTrianglesBefore'] == reports[part]['lowTrianglesAfter'] == counts[part], 'A component bake is not based on current unchanged Low geometry')
        if part in refreshed:
            Require(all(new['parts'][part]['worldImage'][key] == old['parts'][part]['worldImage'][key] for key in ('bytes', 'sha256')), 'The refreshed part did not retain the same verified high World field')
            superseded.append(copy.deepcopy(old['normalMaps'][part]))
    materials, seen = [], set()
    for invocation, report in (('originalFull', old), ('validatedRefresh', new)):
        for row in report['materials']:
            Require(row['before'] == row['after'], 'A bake invocation modified its source material')
            key = json.dumps(row, sort_keys=True)
            if key not in seen:
                seen.add(key)
                material = copy.deepcopy(row)
                material['evidenceInvocation'] = invocation
                materials.append(material)
    result = {'generator': 'SichuanQualityNormalTransferV13', 'reportType': 'merged-validated-normal-evidence',
              'resolution': [4096, 4096], 'partialProbe': False, 'partSubset': list(parts),
              'method': 'Three unchanged cloth component bakes retained; Mat/Sandals low tangent normals refreshed after Mesh.validate using the same verified high World PNGs',
              'highRoot': new['highRoot'], 'lowRoot': new['lowRoot'],
              'sourceFile': new.get('sourceFile'), 'sourceFileScope': 'Saved input work snapshot; current Low inventory is pinned by currentGeometry evidence',
              'selectedToActive': False, 'rayProjectionUsed': False, 'pixelPaintingUsed': False,
              'highAndLowUvBytesClaimedEqual': False,
              'sourceGeometryUvAndCornerNormalsUnchangedWithinEachBake': True,
              'lowGeometryChangedBetweenInvocations': True,
              'crossValidationLowGeometryUnchangedClaim': False,
              'invariantScope': 'Each invocation before==after only. Export Mesh.validate changed topology/basis between the archived full bake and validated refresh.',
              'originalMaterialGraphsUnchangedWithinEachBake': True, 'lowMaterialBindingPerformedByMerge': False,
              'mergeOnlyNoBlenderInvoked': True, 'sourceSavedByMerge': False,
              'parts': reports, 'normalMaps': maps, 'objects': selected, 'materials': materials,
              'currentLowTriangles': counts, 'currentTotalTriangles': sum(counts.values()),
              'provenance': inputs, 'refreshedParts': [part for part in parts if part in refreshed],
              'retainedOriginalParts': [part for part in parts if part not in refreshed],
              'dependencies': {'normalFilesRequiredForBinding': normalFiles,
                               'worldFieldsForFutureReuse': worldFiles,
                               'provenanceReportsToArchiveUnchanged': list(inputs.values()),
                               'supersededTangentImagesNotUsedByCurrentModel': superseded},
              'referenceFidelityReviewed': False, 'finalModelApprovedByUser': False}
    outputDir = Path(outputDir).resolve()
    outputDir.mkdir(parents=True, exist_ok=True)
    output = outputDir/'Data_QualityNormalTransferV13.json'
    Require(str(output) not in {value['path'] for value in inputs.values()}, 'Do not overwrite an original evidence report')
    output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    for value in inputs.values():
        Require(Evidence(value['path']) == value, 'An input evidence file changed during JSON merge')
    print(json.dumps({'report': str(output), 'triangles': sum(counts.values()), 'byPart': counts,
                      'refreshedParts': result['refreshedParts'], 'inputReportsUnchanged': True}))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('old', 'refresh', 'geometry', 'out-dir'):
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    MergeNormalReports(args.old, args.refresh, args.geometry, args.out_dir)
