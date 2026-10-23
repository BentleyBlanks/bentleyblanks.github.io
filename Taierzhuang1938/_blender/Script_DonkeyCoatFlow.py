"""Continuous side-flow chart; integrate its slope instead of rotating UV points."""
import numpy as np
from mathutils import Vector

flowY=np.linspace(-.40,1.60,2001)
flowSlope=np.interp(flowY,(-.40,.02,.20,.60,.72,1.03,1.16,1.60),(10/3,10/3,.30,.30,4/3,4/3,-20/9,-20/9))
step=float(flowY[1]-flowY[0])
flowHeight=np.concatenate(([0],np.cumsum((flowSlope[:-1]+flowSlope[1:])*.5*step)))
flowArc=np.concatenate(([0],np.cumsum((np.hypot(1,flowSlope[:-1])+np.hypot(1,flowSlope[1:]))*.5*step)))

def FlowCoordinates(point,repeat,leg=False):
    if leg:return (point.y/repeat,-point.z/repeat)
    height=float(np.interp(point.y,flowY,flowHeight));arc=float(np.interp(point.y,flowY,flowArc))
    return ((point.z-height)/repeat,-arc/repeat)

def HairFlow(point,limbMass):
    if point.z<.75 and limbMass>.65:return Vector((0,-.12,-1)).normalized()
    slope=float(np.interp(point.y,flowY,flowSlope));sign=1 if slope<0 else -1
    return Vector((0,sign,sign*slope)).normalized()
