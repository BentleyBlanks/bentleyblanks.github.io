"""Local8-bit AO boundary repair, preserving the one-byte acceptance gate."""
import itertools
import numpy as np


def QuantizeAoBoundarySamples(field,sampleRows,protectedRows,maxIterations=5000):
    if not sampleRows:return {'samples':0,'changedPixels':0,'maxByteResidual':0.}
    height,width=field.shape;left=np.concatenate([row[0] for row in sampleRows]);right=np.concatenate([row[1] for row in sampleRows])
    def Footprints(uvs):
        xy=uvs*np.array([width,height])-.5;base=np.floor(xy).astype(np.int64);fraction=xy-base;indices=[];coefficients=[]
        for dx in [0,1]:
            for dy in [0,1]:
                x=np.clip(base[:,0]+dx,0,width-1);y=np.clip(base[:,1]+dy,0,height-1);indices.append(y*width+x);coefficients.append((fraction[:,0] if dx else 1-fraction[:,0])*(fraction[:,1] if dy else 1-fraction[:,1]))
        return np.stack(indices,axis=1),np.stack(coefficients,axis=1)
    li,lc=Footprints(left);ri,rc=Footprints(right);indices=np.concatenate([li,ri],axis=1);coefficients=np.concatenate([lc,-rc],axis=1)
    for a in range(8):
        for b in range(a):
            same=indices[:,a]==indices[:,b];coefficients[same,b]+=coefficients[same,a];coefficients[same,a]=0
    active=abs(coefficients)>1e-12
    assert np.all(indices[active]>=protectedRows*width),'Quantization repair must never touch the rivet strip'
    unique,inverse=np.unique(indices,return_inverse=True);columns=inverse.reshape(indices.shape);values=np.rint(np.clip(field.reshape(-1)[unique],0,1)*255).astype(np.float64);original=values.copy()
    rowIds=np.broadcast_to(np.arange(len(columns))[:,None],columns.shape)[active];columnIds=columns[active];terms=coefficients[active];order=np.argsort(columnIds);rowIds=rowIds[order];terms=terms[order];counts=np.bincount(columnIds,minlength=len(unique));offsets=np.r_[0,np.cumsum(counts)];threshold=.999
    def Rows(vector):return np.sum(vector[columns]*coefficients,axis=1)
    def Loss(vector):return np.maximum(abs(vector)-threshold,0)**2
    def Candidate(moves,residual):
        rows=np.unique(np.concatenate([rowIds[offsets[p]:offsets[p+1]] for p,d in moves]));delta=np.zeros(len(rows))
        for p,d in moves:
            ids=rowIds[offsets[p]:offsets[p+1]];np.add.at(delta,np.searchsorted(rows,ids),terms[offsets[p]:offsets[p+1]]*d)
        score=float(np.sum(Loss(residual[rows]+delta)-Loss(residual[rows])))
        score+=1e-10*sum((values[p]+d-original[p])**2-(values[p]-original[p])**2 for p,d in moves)
        return score
    residual=Rows(values);before=float(max(abs(residual)))
    for iteration in range(maxIterations):
        worst=int(np.argmax(abs(residual)))
        if abs(residual[worst])<=threshold:break
        pixels=np.unique(columns[worst,abs(coefficients[worst])>1e-12]);moves=[(int(p),d) for p in pixels for d in [-1,1] if 0<=values[p]+d<=255];bestScore=0.;bestMoves=None
        for move in moves:
            score=Candidate([move],residual)
            if score<bestScore:bestScore=score;bestMoves=[move]
        if bestMoves is None:
            for a,b in itertools.combinations(moves,2):
                if a[0]==b[0]:continue
                score=Candidate([a,b],residual)
                if score<bestScore:bestScore=score;bestMoves=[a,b]
        assert bestMoves is not None,'Quantized AO repair stalled; do not relax the one-byte gate'
        for p,d in bestMoves:values[p]+=d
        assert max(abs(values-original))<=2,'Quantization repair must remain a local at-most2-byte correction'
        residual=Rows(values)
    maximum=float(max(abs(residual)));assert maximum<=threshold,'Quantized AO boundary must pass before writing an image'
    field.reshape(-1)[unique]=values/255
    return {'samples':len(left),'boundaryPixels':len(unique),'changedPixels':int(np.count_nonzero(values!=original)),'maxByteChange':float(max(abs(values-original))),'initialByteResidual':before,'maxByteResidual':maximum,'iterations':iteration+1,'method':'Local single/pair integer-pixel corrections; one-byte acceptance retained with .001byte safety margin'}
