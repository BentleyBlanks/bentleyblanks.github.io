"""Tangent parabolic free spans around the observed upper support wheels."""
import math

def BuildTangentTrackPath(model):
    def Span(a,b,sag):
        slope=(a[1]+a[2]-b[1]-b[2])/(a[0]-b[0]);ma=mb=slope
        for iteration in range(100):
            na=(-ma/math.sqrt(1+ma*ma),1/math.sqrt(1+ma*ma));nb=(-mb/math.sqrt(1+mb*mb),1/math.sqrt(1+mb*mb))
            p=(a[0]+a[2]*na[0],a[1]+a[2]*na[1]);q=(b[0]+b[2]*nb[0],b[1]+b[2]*nb[1]);length=p[0]-q[0]
            assert length>0,'Free-span contacts reversed'
            newA=(p[1]-q[1]+4*sag)/length;newB=(p[1]-q[1]-4*sag)/length
            error=max(abs(newA-ma),abs(newB-mb));ma=(ma+newA)/2;mb=(mb+newB)/2
            if error<1e-11:break
        na=(-ma/math.sqrt(1+ma*ma),1/math.sqrt(1+ma*ma));nb=(-mb/math.sqrt(1+mb*mb),1/math.sqrt(1+mb*mb))
        p=(a[0]+a[2]*na[0],a[1]+a[2]*na[1]);q=(b[0]+b[2]*nb[0],b[1]+b[2]*nb[1]);length=p[0]-q[0]
        assert max(abs(ma-(p[1]-q[1]+4*sag)/length),abs(mb-(p[1]-q[1]-4*sag)/length))<1e-7
        return {'a':p,'b':q,'sag':sag,'slopeA':ma,'slopeB':mb}
    def VisualSpan(a,b,requestedSag):
        # Existing sag values describe the drop below the centre-top chord,
        # not below the lower tangent-contact chord. Preserve that observed
        # midpoint while solving tangent contacts; otherwise the rear span
        # drops into the folded cover despite unchanged numeric sag.
        midpoint=(a[0]+b[0])/2;target=(a[1]+a[2]+b[1]+b[2])/2-requestedSag
        lo=0.;hi=requestedSag
        for step in range(28):
            trial=(lo+hi)/2;span=Span(a,b,trial);p,q=span['a'],span['b'];t=(p[0]-midpoint)/(p[0]-q[0]);height=p[1]*(1-t)+q[1]*t-4*trial*t*(1-t)
            if height>target:lo=trial
            else:hi=trial
        span=Span(a,b,(lo+hi)/2);span.update(requestedCentreSag=requestedSag,centreHeightTarget=target)
        return span
    radius=model.sprocketPitchRadius
    rearHeight=getattr(model,'rearSprocketHeight',.79)
    teeth=getattr(model,'sprocketTeeth',18)
    for iteration in range(20):
        circles=[(model.frontIdlerY,.85,.451),(model.rearSprocketY,rearHeight,radius),(model.leadingWheelY,model.leadingWheelHeight,model.leadingWheelPitchRadius),(model.roadWheelPairs[0][0],model.roadWheelHeight,model.roadWheelRadius+.024),(model.roadWheelPairs[-1][-1],model.roadWheelHeight,model.roadWheelRadius+.024)]
        points=[(y+r*math.cos(i*2*math.pi/240),z+r*math.sin(i*2*math.pi/240))for y,z,r in circles for i in range(240)]
        hull=model.ConvexHull(points);front=max(range(len(hull)),key=lambda i:hull[i][0]);lower=hull[:front+1]
        supports=[(model.frontIdlerY,.85,.451)]+[(y,z,model.returnRollerRadius+.024)for y,z in model.returnRollerStations]+[(model.rearSprocketY,rearHeight,radius)]
        sagValues=getattr(model,'upperSagDepths',[.065,.025,.025,.025,.060])
        spans=[VisualSpan(a,b,sag)for a,b,sag in zip(supports,supports[1:],sagValues)]
        def Height(y):
            candidates=[z+math.sqrt(max(0,r*r-(y-center)**2))for center,z,r in supports if abs(y-center)<=r]
            for span in spans:
                a,b=span['a'],span['b']
                if b[0]<=y<=a[0]:
                    t=(a[0]-y)/(a[0]-b[0]);candidates.append(a[1]*(1-t)+b[1]*t-4*span['sag']*t*(1-t))
            return max(candidates)
        start=lower[-1][0];end=lower[0][0];steps=math.ceil((start-end)/.004)
        upper=[(start+(end-start)*i/steps,Height(start+(end-start)*i/steps))for i in range(1,steps)]
        contour=lower+upper;segments=[];length=0.
        for i,a in enumerate(contour):
            b=contour[(i+1)%len(contour)];distance=math.hypot(b[0]-a[0],b[1]-a[1]);segments.append({'a':a,'b':b,'s':length,'length':distance});length+=distance
        matched=length/model.trackLinksPerSide*teeth/(2*math.pi)
        if abs(matched-radius)<1e-9:break
        radius=matched
    model.trackPath=segments;model.trackLength=length;model.sprocketPitchRadius=radius;model.trackPitchM=length/model.trackLinksPerSide
    model.smoothPathDiagnostic={'model':'C1 tangent parabolic spans','spans':spans,'iterations':iteration+1}
