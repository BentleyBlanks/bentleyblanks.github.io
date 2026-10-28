"""C1, monotone interpolation of measured post-fit limb sections."""
import numpy as np


def SampleSectionCurve(heights,rows,column):
    x=rows[:,0];y=rows[:,column];h=np.diff(x);s=np.diff(y)/h
    # Flat endpoint tangents join the constant out-of-range extension.
    d=np.zeros(len(x))
    for i in range(1,len(x)-1):
        if s[i-1]*s[i]>0:
            a=2*h[i]+h[i-1];b=h[i]+2*h[i-1]
            d[i]=(a+b)/(a/s[i-1]+b/s[i])
    z=np.clip(heights,x[0],x[-1]);i=np.clip(np.searchsorted(x,z,side='right')-1,0,len(x)-2);t=(z-x[i])/h[i]
    return (2*t**3-3*t*t+1)*y[i]+(t**3-2*t*t+t)*h[i]*d[i]+(-2*t**3+3*t*t)*y[i+1]+(t**3-t*t)*h[i]*d[i+1]
