"""Optional photographic exterior hypotheses; structural bays retained.

The archival frame sections are nearly elliptical. This outer-skin profile
is an explicit Photo02 reconstruction trial, not a revised factory bulkhead
dimension or a claim that a separate ventral fairing has been identified.
"""
import os
fuselageExteriorProfile=os.environ.get('KI4_FUSELAGE_PROFILE','ManualV20')
assert fuselageExteriorProfile in ['ManualV20','Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope']
lowerEnvelopeOffsets=[(-3.820,0.),(-3.605,0.),(-3.045,.1543310),(-2.430,.1273231),(-1.810,.0882273),(-1.295,.0484869),(-.165,0.),(.780,0.),(1.650,0.),(2.300,0.),(2.580,0.)]
upperEnvelopeOffsets=[(-3.820,0.),(-3.605,0.),(-3.045,.0584422),(-2.430,.0517597),(-1.810,.0351843),(-1.295,.0319591),(-.165,0.),(.780,0.),(1.650,0.),(2.300,0.),(2.580,0.)]
if fuselageExteriorProfile=='Photo02InstallationEnvelope':
    lowerEnvelopeOffsets=[(-3.820,0.),(-3.605,0.),(-3.045,.1951240),(-2.430,.1777554),(-1.810,.1449624),(-1.295,.1120665),(-.165,0.),(.780,0.),(1.650,0.),(2.300,0.),(2.580,0.)]
    upperEnvelopeOffsets=[(-3.820,0.),(-3.605,0.),(-3.045,.0752045),(-2.430,.0835324),(-1.810,.0697297),(-1.295,.0653394),(-.165,0.),(.780,0.),(1.650,0.),(2.300,0.),(2.580,0.)]


def LowerEnvelopeSlopes(table):
    h=[b[0]-a[0] for a,b in zip(table,table[1:])];delta=[(b[1]-a[1])/d for a,b,d in zip(table,table[1:],h)];slopes=[0.]*len(table)
    for i in range(1,len(table)-1):
        if delta[i-1]*delta[i]<=0:continue
        w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
        slopes[i]=(w1+w2)/(w1/delta[i-1]+w2/delta[i])
    return slopes


def EvaluateLowerEnvelope(table,slopes,y):
    if y<=table[0][0] or y>=table[-1][0]:return 0.
    for i,(a,b) in enumerate(zip(table,table[1:])):
        if a[0]<=y<=b[0]:
            h=b[0]-a[0];t=(y-a[0])/h
            value=(2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*slopes[i]+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*slopes[i+1]
            return max(0.,value)
    return 0.


lowerEnvelopeSlopes=LowerEnvelopeSlopes(lowerEnvelopeOffsets)
upperEnvelopeSlopes=LowerEnvelopeSlopes(upperEnvelopeOffsets)


def BodyLowerEnvelope(y):
    return EvaluateLowerEnvelope(lowerEnvelopeOffsets,lowerEnvelopeSlopes,y) if fuselageExteriorProfile in ['Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope'] else 0.


def BodyUpperEnvelope(y):
    return EvaluateLowerEnvelope(upperEnvelopeOffsets,upperEnvelopeSlopes,y) if fuselageExteriorProfile in ['Photo02Envelope','Photo02InstallationEnvelope'] else 0.


def BodyProfileNormalAffected(y,cosTheta):
    return (BodyLowerEnvelope(y)>0 and cosTheta<-.000001) or (BodyUpperEnvelope(y)>0 and cosTheta>.000001)


if 'root' in globals():
    root['fuselageExteriorProfile']=fuselageExteriorProfile
    if fuselageExteriorProfile in ['Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope']:
        root['lowerExteriorOffsetsJson']=json.dumps(lowerEnvelopeOffsets)
        root['lowerExteriorShapeScope']='Photo02 lower exterior contour hypothesis only. Manual64 structural ellipsoid stations remain reference inputs; lower outer skin departs from those isolated frame outlines. No identified separate fairing or factory section dimension is claimed. Requires actual reimport and all-view review.'
    if fuselageExteriorProfile in ['Photo02Envelope','Photo02InstallationEnvelope']:
        root['upperExteriorOffsetsJson']=json.dumps(upperEnvelopeOffsets)
        root['upperExteriorShapeScope']='Photo02 upper exterior contour hypothesis only, preserving the verified lower profile. Coaming, windscreen feet and affected flush heads follow the actual skin. Manual frame sections remain references, not measured revised factory sections.'
