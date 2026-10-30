"""Reconstruct a corrected image junction from frozen, reviewed edge lines.

No model or camera projection is used to compute the intersection. The line
selection was reviewed after an earlier prediction, so this is not a blind test.
"""
from pathlib import Path
import copy, hashlib, json, numpy as np

base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=base/'ReferenceV88'
rows=json.loads((root/'Inputs/Data_2014RearLineCandidatesV88.json').read_text())
original=base/'ReferenceV86/Inputs/Data_RearJunctionsV86.json'


def Line(row):
    a,b=np.r_[row['aNative'],1],np.r_[row['bNative'],1]
    result=np.cross(a,b)
    return result/np.linalg.norm(result[:2])


a,b=Line(rows[0]),Line(rows[1])
if a[:2]@b[:2]<0:
    b=-b
side=(a+b)/2
side/=np.linalg.norm(side[:2])
rear=Line(rows[2])
point=np.cross(side,rear)
point=point[:2]/point[2]
assert 1790<point[0]<1820 and 1365<point[1]<1395
data=copy.deepcopy(json.loads(original.read_text()))
item=next(row for row in data['rows']if row['camera']=='2014')
previous=item['farNative']
assert previous==[1890,1373]
item['farNative']=point.tolist()
data['correction']=dict(camera='2014',feature='far rear-side junction',previousNative=previous,
    correctedNative=point.tolist(),method='Intersection of reviewed native side-edge pair0/1and rear-edge2; no model point or camera enters computation',
    sideCandidateIds=[0,1],rearCandidateId=2,previousPointWasRearLineInterior=True,
    originalObservationFileSha256=hashlib.sha256(original.read_bytes()).hexdigest(),
    modelPredictionWasAlreadyInspected=True,untouchedHoldout=False)
data['imageSha2562014']=hashlib.sha256((base/'References/Reference_KubinkaOld.jpg').read_bytes()).hexdigest()
(root/'Inputs/Data_RearJunctionsV88.json').write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps(dict(previous=previous,corrected=point.tolist())))
