"""Ki-4 upper-wing planform from the original NDL canvas73 outline.

Printed constraints: 6000mm half span and2000mm maximum outline chord.
Contours are scan-calibrated reconstruction, not a manufacturing survey.
Manual SHA256: 4239a36df72f99638d32877ddd38ffc2683493b4a6b9de1f5f585d87ff425672
Pixel datums: root742, tip3390, straight LE1252, maximum TE2143.
Keep near-tip interpolation smooth in angular coordinates so the closed tip
has a proper rounded tangent instead of a coarse span-linear corner.
"""
import math
upperPlanFront=[(0.0, 2.0), (4.4, 2.0), (4.481873111782478, 1.9932659932659933), (4.77643504531722, 1.9910213243546577), (5.003021148036254, 1.9820426487093155), (5.116314199395771, 1.9663299663299663), (5.229607250755287, 1.941638608305275), (5.342900302114804, 1.9124579124579124), (5.456193353474321, 1.872053872053872), (5.569486404833837, 1.8204264870931537), (5.682779456193353, 1.755331088664422), (5.7960725075528705, 1.6835016835016834), (5.852719033232629, 1.6296296296296298), (5.909365558912387, 1.5757575757575757), (5.966012084592145, 1.5039281705948373), (6.0, 1.3984287317620652)]
upperPlanRear=[(0.0, 0.7272727272727273), (0.40105740181268884, 0.5836139169472503), (0.7001510574018127, 0.2940516273849607), (1.0989425981873113, 0.11672278338944997), (1.4003021148036254, 0.03367003367003374), (1.75, 0.0), (2.4992447129909365, 0.0), (3.2492447129909365, 0.08754208754208759), (3.75, 0.1571268237934904), (3.9992447129909365, 0.19753086419753085), (4.2009063444108765, 0.23569023569023573), (4.400302114803625, 0.28507295173961844), (4.481873111782478, 0.3097643097643097), (4.77643504531722, 0.3973063973063973), (5.003021148036254, 0.47811447811447816), (5.116314199395771, 0.5252525252525253), (5.229607250755287, 0.5679012345679013), (5.342900302114804, 0.6217732884399552), (5.456193353474321, 0.6778900112233446), (5.569486404833837, 0.7429854096520763), (5.682779456193353, 0.8215488215488216), (5.7960725075528705, 0.9248035914702581), (5.852719033232629, 0.9876543209876543), (5.909365558912387, 1.0684624017957352), (5.966012084592145, 1.1851851851851851), (6.0, 1.3984287317620652)]

def ShapeTangents(table):
    h=[table[i+1][0]-table[i][0] for i in range(len(table)-1)]
    d=[(table[i+1][1]-table[i][1])/h[i] for i in range(len(h))]
    slopes=[d[0]]
    for i in range(1,len(table)-1):
        if d[i-1]*d[i]<=0:slopes.append(0.)
        else:
            w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
            slopes.append((w1+w2)/(w1/d[i-1]+w2/d[i]))
    slopes.append(d[-1]);return slopes

upperFrontAngular=[(math.asin(s/6),y) for s,y in upperPlanFront]
upperRearAngular=[(math.asin(s/6),y) for s,y in upperPlanRear]
upperFrontTangents=ShapeTangents(upperFrontAngular)
upperRearTangents=ShapeTangents(upperRearAngular)

def ShapeValue(table,slopes,value):
    if value<=table[0][0]:return table[0][1]
    if value>=table[-1][0]:return table[-1][1]
    for i,(first,last) in enumerate(zip(table,table[1:])):
        if first[0]<=value<=last[0]:
            h=last[0]-first[0];t=(value-first[0])/h
            return (2*t**3-3*t*t+1)*first[1]+(t**3-2*t*t+t)*h*slopes[i]+(-2*t**3+3*t*t)*last[1]+(t**3-t*t)*h*slopes[i+1]

def UpperPlanform(span):
    angle=math.asin(max(0,min(1,abs(span)/6)))
    return ShapeValue(upperFrontAngular,upperFrontTangents,angle),ShapeValue(upperRearAngular,upperRearTangents,angle)

def SegmentDistance(point,first,last):
    delta=(last[0]-first[0],last[1]-first[1]);length=delta[0]**2+delta[1]**2
    f=max(0,min(1,((point[0]-first[0])*delta[0]+(point[1]-first[1])*delta[1])/length)) if length else 0
    return math.hypot(point[0]-first[0]-delta[0]*f,point[1]-first[1]-delta[1]*f)

def UpperSpanSamples(start,end,spacing=.065,tolerance=.0005):
    count=max(12,math.ceil((end-start)/spacing));angles=[math.asin((start+(end-start)*i/count)/6) for i in range(count+1)]
    result=[angles[0]]
    def Point(angle,edge):return (6*math.sin(angle),UpperPlanform(6*math.sin(angle))[edge])
    def Split(first,last,depth=0):
        error=max(SegmentDistance(Point(first+(last-first)*f,edge),Point(first,edge),Point(last,edge)) for f in [.25,.5,.75] for edge in [0,1])
        if error>tolerance and depth<12:
            mid=(first+last)/2;Split(first,mid,depth+1);Split(mid,last,depth+1)
        else:result.append(last)
    for first,last in zip(angles,angles[1:]):Split(first,last)
    samples=[6*math.sin(a) for a in result];samples[0]=start;samples[-1]=end
    return samples

# NDL canvas74: approximate8.520m total span,3790mm outer panel,
# nominal1250mm chord and150/480/620mm chordwise reference segments.
# Fore/aft contour follows the skew-calibrated scan; the apex overlaps a guide.
lowerPlanFront=[(0, 1.5275), (0.5, 1.5275), (0.5735484827870269, 1.5275), (0.9439459077353309, 1.5272280935721994), (1.3143236879070823, 1.5272280935721994), (1.6847014680788337, 1.5272280935721994), (2.055079248250585, 1.5272280935721994), (2.4254570284223362, 1.5272280935721994), (2.7958151638175357, 1.5272280935721994), (3.1661732992127343, 1.5272280935721994), (3.4439762791181003, 1.5272280935721994), (3.6293223274163973, 1.5214691651105396), (3.81486482348022, 1.4887150653052699), (3.907773584948001, 1.4594079814223073), (4.000819859851649, 1.4171708635590168), (4.093925069084956, 1.3693923025613), (4.149815697312113, 1.3381391591666045), (4.187266015636894, 1.2994479690258784), (4.215339020798065, 1.2718149372039407), (4.239688603380966, 1.2460191619134524), (4.26, 1.1620000000000001)]
lowerPlanRear=[(0, 0.2775), (0.5, 0.2775), (0.5870640890552444, 0.2775), (0.9574025796738905, 0.2775), (1.3277214255159842, 0.2775), (1.6980599161346301, 0.2775), (2.068260893317408, 0.2907593331799294), (2.438245777958106, 0.32869140541201247), (2.808152083492595, 0.374012068489997), (3.1778030069318977, 0.4433456518171619), (3.362481132827405, 0.4918660513168098), (3.547080679616702, 0.5477750416623592), (3.7315427129701293, 0.6166140659882365), (3.823704972928909, 0.6574985951413391), (3.9157493642283727, 0.7094660105632942), (4.007656242091969, 0.774363459965577), (4.0993077378603795, 0.86327382961704), (4.154098258600589, 0.9354609580649668), (4.190605627650843, 0.9854328580750602), (4.217932131303013, 1.0279914392891876), (4.2411423168458615, 1.1093302312642725), (4.26, 1.1620000000000001)]
lowerFrontAngular=[(math.asin(s/4.26),y) for s,y in lowerPlanFront]
lowerRearAngular=[(math.asin(s/4.26),y) for s,y in lowerPlanRear]
lowerFrontTangents=ShapeTangents(lowerFrontAngular)
lowerRearTangents=ShapeTangents(lowerRearAngular)

def LowerPlanform(span):
    angle=math.asin(max(0,min(1,abs(span)/4.26)))
    return ShapeValue(lowerFrontAngular,lowerFrontTangents,angle),ShapeValue(lowerRearAngular,lowerRearTangents,angle)

def LowerSpanSamples(start,end,spacing=.065,tolerance=.0005):
    count=max(12,math.ceil((end-start)/spacing));angles=[math.asin((start+(end-start)*i/count)/4.26) for i in range(count+1)];result=[angles[0]]
    def Point(angle,edge):return (4.26*math.sin(angle),LowerPlanform(4.26*math.sin(angle))[edge])
    def Split(first,last,depth=0):
        error=max(SegmentDistance(Point(first+(last-first)*f,edge),Point(first,edge),Point(last,edge)) for f in [.25,.5,.75] for edge in [0,1])
        if error>tolerance and depth<12:
            mid=(first+last)/2;Split(first,mid,depth+1);Split(mid,last,depth+1)
        else:result.append(last)
    for first,last in zip(angles,angles[1:]):Split(first,last)
    samples=[4.26*math.sin(a) for a in result];samples[0]=start;samples[-1]=end;return samples
