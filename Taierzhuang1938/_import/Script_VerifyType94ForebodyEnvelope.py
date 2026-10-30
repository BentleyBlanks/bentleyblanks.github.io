"""Reject inconsistent front-fender hypotheses before rebuilding the Type94.

This checks a straight cross-edge against an estimated front working-track
envelope. It is an additional consistency gate, never an actual mesh sweep or
proof of photographic fidelity. Input points are inspected without modification.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def CheckFrontEdge(study, trackWidthM=.164, radialAllowanceM=.014,
                   fenderThicknessM=.006, gapM=.001, groundOffsetM=-.004):
    shape = study['shapeParameters']
    drive = study['driveParameters']
    sites = study['freeSites']
    inner, outer = (sites[name] for name in ['FenderFarInner', 'FenderFarOuter'])
    assert all(len(point) == 3 and all(math.isfinite(value) for value in point)
               for point in [inner, outer]), 'Finite native hypothesis sites required'
    centerX = shape['TrackCenterX']
    centerY = drive['centerForwardM']
    centerZ = drive['centerHeightM'] + groundOffsetM
    radius = drive['outerMetalRadiusM'] + radialAllowanceM
    assert radius > 0 and trackWidthM > 0 and fenderThicknessM >= 0 and gapM >= 0
    required = fenderThicknessM / 2 + gapM
    halfWidth = trackWidthM / 2
    samples = []
    for index in range(257):
        t = index / 256
        point = [a + (b - a) * t for a, b in zip(inner, outer)]
        if abs(point[0] - centerX) > halfWidth:
            continue
        clearance = math.hypot(point[1] - centerY, point[2] - centerZ) - radius
        samples.append(dict(pointBlenderM=point, radialClearanceM=clearance))
    coverage = min(inner[0], outer[0]) <= centerX - halfWidth and max(inner[0], outer[0]) >= centerX + halfWidth
    minimum = min(samples, key=lambda sample: sample['radialClearanceM']) if samples else None
    passed = coverage and minimum is not None and minimum['radialClearanceM'] >= required
    return dict(passed=passed, fullAxialTrackSpanCovered=coverage,
                minimumRadialClearanceM=minimum['radialClearanceM'] if minimum else None,
                minimumPointBlenderM=minimum['pointBlenderM'] if minimum else None,
                requiredFenderCentreClearanceM=required, samplesWithinTrackWidth=len(samples),
                intersectingSamples=sum(sample['radialClearanceM'] < 0 for sample in samples),
                endpointsBlenderM=[inner, outer], driveCenterBlenderM=[centerX, centerY, centerZ],
                trackWidthM=trackWidthM, estimatedWorkingTrackRadiusM=radius,
                radialAllowanceM=radialAllowanceM, fenderThicknessM=fenderThicknessM,
                gapM=gapM, groundOffsetM=groundOffsetM)


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', type=Path, required=True)
    parser.add_argument('--solution', type=int, default=0)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.study.read_text(encoding='utf-8-sig'))
    study = data['solutions'][args.solution] if 'solutions' in data else data
    result = CheckFrontEdge(study)
    result.update(schema='Type94FrontCrossEdgeEnvelopeAuditV1', input=str(args.study.resolve()),
                  inputSha256=hashlib.sha256(args.study.read_bytes()).hexdigest(),
                  hypothesisWasModified=False, actualMeshCollisionChecked=False,
                  scope='Straight front cross-edge against a smooth inferred track envelope; actual cast-lug sweep and reference comparison remain required',
                  radiusParameterNote='Input outerMetalRadiusM is the historical fitter parameter name; it is not a surveyed tooth-root radius')
    args.out.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({key: result[key] for key in ['passed', 'minimumRadialClearanceM',
          'requiredFenderCentreClearanceM', 'intersectingSamples', 'fullAxialTrackSpanCovered']}, indent=2))
    if not result['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    Main()
