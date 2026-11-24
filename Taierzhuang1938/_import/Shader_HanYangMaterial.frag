#version 330
in vec3 point,faceNormal;
in vec4 basis;
in float visibility,woodExposure;
uniform bool wood,band,guard,disk,knob,buttCap,foreEnd,handguard,longShell,underTrim;
uniform float seed,worn;
uniform vec2 alongRange;
uniform int steelFamily,finishGroup,trimFinish;
uniform vec2 heightRange,acrossRange;
uniform sampler2D pigmentMap,surfaceMap,detailMap;
uniform sampler2D wearColor,wearSurface,wearNormal;
layout(location=0) out vec4 base;
layout(location=1) out vec4 orm;
layout(location=2) out vec4 mapped;
layout(location=3) out vec4 finishMask;
const vec3 along=vec3(1,0,0),across=vec3(0,1,0),up=vec3(0,0,1);
float luma(vec3 color){return dot(color,vec3(.2126,.7152,.0722));}
vec3 displayToLinear(vec3 value){return mix(value/12.92,pow((value+.055)/1.055,vec3(2.4)),greaterThan(value,vec3(.04045)));}
vec3 linearToDisplay(vec3 value){return mix(12.92*value,1.055*pow(max(value,vec3(.000001)),vec3(1./2.4))-.055,greaterThan(value,vec3(.0031308)));}
vec3 artSpace(vec3 v){return vec3(-v.z,v.x,v.y);}
float patch(vec3 p,vec3 center,vec3 extent){
 vec3 dist=(p-center)/extent;return exp(-dot(dist,dist)*1.35);
}
float hash21(vec2 coord){
 vec3 bits=fract(vec3(coord.xyx)*vec3(.11369,.13787,.09987));
 bits+=dot(bits,bits.yzx+19.19);
 return fract((bits.x+bits.y)*bits.z);
}
float softNoise(vec2 coord){
 vec2 cell=floor(coord),part=fract(coord);part=part*part*(3.-2.*part);
 return mix(mix(hash21(cell),hash21(cell+vec2(1,0)),part.x),mix(hash21(cell+vec2(0,1)),hash21(cell+vec2(1)),part.x),part.y);
}
float flecks(vec2 coord){
 vec2 cell=floor(coord),pos=fract(coord)-.5;
 vec2 shift=(vec2(hash21(cell),hash21(cell+17.21))-.5)*.60;
 return (1.-smoothstep(.035,.25,length((pos-shift)*vec2(.83,1.17))))*smoothstep(.19,.78,hash21(cell+6.13));
}
float strokeDistance(vec2 p,vec2 start,vec2 end){
 vec2 line=end-start;return length(p-start-line*clamp(dot(p-start,line)/dot(line,line),0.,1.));
}
struct WearSample{vec3 marks;float freshness;};
WearSample stockPatina(vec2 position,float sidePhase){
 float taper=smoothstep(-.128,-.048,position.x);
 vec2 panel=vec2(position.x+.90*.080*(taper*taper*taper*(1.-.5*taper))+max(position.x+.048,0.)*.90,
                 position.y*mix(1.,1.93,taper));
 vec2 field=panel*vec2(48.,52.)+sidePhase;
 vec2 cell=floor(field),local=fract(field);
 float key=hash21(cell+3.67);
 vec2 anchor=.27+.46*vec2(hash21(cell+1.53),hash21(cell+8.17));
 vec2 offset=(local-anchor)/vec2(48.,52.);
 float orientation=hash21(cell+17.56);
 float crossWear=hash21(cell+2.3);
 float direction=crossWear>.58?mix(-1.55,-1.14,orientation):mix(-1.53,1.48,orientation);
 vec2 axis=vec2(cos(direction),sin(direction));
 vec2 oriented=vec2(dot(offset,axis),dot(offset,vec2(-axis.y,axis.x)));
 float span=mix(.00105,.00376,crossWear);
 float width=mix(.00048,.00148,hash21(cell+21.5));
 float crease=oriented.y+.11*oriented.x+.12*width*sin(oriented.x/span*4.1+key);
 vec2 fossil=vec2(oriented.x/span,crease/width);
 float breakup=softNoise(panel*vec2(1340.,1950.)+sidePhase);
 float chipShape=max(abs(fossil.x)*.93+.26*abs(fossil.y),abs(fossil.y)*.89+.32*abs(fossil.x));
 float cluster=softNoise(panel*vec2(16.,24.)+sidePhase);
 float active=smoothstep(.43,.74,.72*key+.28*cluster);
 float chip=(1.-smoothstep(.60,1.12,chipShape+.24*(breakup-.5)))*active;
 float lip=chip*smoothstep(-.44,.75,fossil.y+.37*fossil.x+.42*(breakup-.5));
 vec2 nickCell=floor(panel*vec2(24.,27.)+sidePhase+.32);
 vec2 nickDelta=(fract(panel*vec2(24.,27.)+sidePhase+.32)-vec2(.50+.19*(hash21(nickCell+9.4)-.5),.50+.20*(hash21(nickCell+2.8)-.5)))/vec2(24.,27.);
 float drift=hash21(nickCell+5.2);
 float angle=hash21(nickCell+11.4)>.27?mix(-1.57,-1.15,drift):mix(-.57,.54,drift);
 vec2 line=vec2(cos(angle),sin(angle));
 float reach=.0042+.0114*hash21(nickCell+6.8);
 float alongMark=dot(nickDelta,line)/reach;
 float acrossMark=dot(nickDelta,vec2(-line.y,line.x))+.00056*(1.-clamp(alongMark*alongMark,0.,1.))+.00014*(breakup-.5);
 float fringe=1.-.47*smoothstep(.28,.90,abs(alongMark));
 float graze=(1.-smoothstep(.00014*fringe,.00066*fringe,abs(acrossMark)))*(1.-smoothstep(.48,1.,abs(alongMark)));
 float catchLight=.47+.53*smoothstep(.22,.71,softNoise(nickDelta*1550.+sidePhase));
 graze*=smoothstep(.48,.77,hash21(nickCell+7.7))*(.60+.40*breakup)*catchLight;
 return WearSample(vec3(chip,lip,graze),hash21(cell+3.98));
}
// Authored in the local face frame using the two bands as photographic landmarks.
vec2 compressedFibre(vec2 p,vec2 start,vec2 middle,vec2 end,float radius,float strength,float flare){
 const vec2 aspect=vec2(12.76,1.);
 vec2 axis=(end-start)*aspect, offset=(p-start)*aspect;
 float axisLength2=dot(axis,axis);
 float t=clamp(dot(offset,axis)/axisLength2,0.,1.);
 vec2 through=(middle-start)*aspect;
 float pivot=clamp(dot(through,axis)/axisLength2,.12,.88);
 vec2 bend=through-pivot*axis;
 vec2 centre=t*axis+bend*t*(1.-t)/(pivot*(1.-pivot));
 float rim=mix(.18,1.,pow(max(0.,sin(3.141593*t)),.58));
 float grain=softNoise(p*vec2(1820.,132.)+start*89.);
 float splitting=softNoise(vec2(t*9.4,start.x*119.));
 float width=radius*rim*(.78+.29*grain+.18*splitting);
 width*=1.+flare*(.69*exp(-pow((t-.82)/.17,2.))-.28*(1.-t));
 vec2 tangent=normalize(axis+bend*(1.-2.*t)/(pivot*(1.-pivot)));
 vec2 lateral=vec2(-tangent.y,tangent.x);
 vec2 fromBed=offset-centre;
 float side=dot(fromBed,lateral)/width;
 float radial=length(fromBed)/width;
 float bed=strength*(1.-smoothstep(.19,1.,radial));
 float tear=smoothstep(.47,1.08,side)*(1.-smoothstep(1.03,1.93,radial));
 float splitFibre=tear*strength*(.30+.70*smoothstep(.27,.75,.52*splitting+.48*grain));
 return vec2(bed,splitFibre);
}
#ifdef STOCK_CREST_WEAR
uniform sampler2D stockImpression;
vec2 stockImpressionSurface(vec2 sidePoint){
 float acrossPhoto=(sidePoint.x+.112944)/.042991;
 float bottom=mix(-.027701,-.027166,acrossPhoto);
 float top=mix(.012800,.012099,acrossPhoto);
 vec2 uv=vec2((top-sidePoint.y)/(top-bottom),1.-acrossPhoto);
 vec2 fibres=sidePoint*vec2(914.,1540.);
 uv+=.0043*(vec2(softNoise(fibres),softNoise(fibres.yx+9.17))-.5);
 float edge=textureLod(stockImpression,uv,0.).r;
 float bed=smoothstep(.27,.87,edge);
 float lip=smoothstep(.15,.42,edge)*(1.-smoothstep(.44,.73,edge));
 return vec2(bed,lip);
}
// Stock-top impressions, registered from the exposed wood in Lu's stock comparison.
vec2 crestFibreWear(vec2 face){
 vec2 chip=vec2(0.);
 chip=max(chip,compressedFibre(face,vec2(0.59940,0.27760),vec2(0.60598,0.33520),vec2(0.61842,0.24840),0.087,0.84,0.35));
 chip=max(chip,compressedFibre(face,vec2(0.60445,0.37160),vec2(0.61028,0.34840),vec2(0.61648,0.31120),0.049,0.58,0.29));
 chip=max(chip,compressedFibre(face,vec2(0.62459,0.32080),vec2(0.63299,0.28200),vec2(0.63794,0.21760),0.045,0.77,0.44));
 chip=max(chip,compressedFibre(face,vec2(0.64574,0.27320),vec2(0.64778,0.23720),vec2(0.65282,0.19240),0.059,0.91,0.67));
 chip=max(chip,compressedFibre(face,vec2(0.65570,0.33080),vec2(0.65689,0.29600),vec2(0.65890,0.25280),0.039,0.72,0.43));
 chip=max(chip,compressedFibre(face,vec2(0.66341,0.13840),vec2(0.66476,0.19040),vec2(0.66482,0.22320),0.027,0.55,0.20));
 chip=max(chip,compressedFibre(face,vec2(0.07068,0.03840),vec2(0.06826,0.11880),vec2(0.06679,0.19200),0.037,0.49,-0.23));
 chip=max(chip,compressedFibre(face,vec2(0.09091,0.00320),vec2(0.08728,0.12480),vec2(0.08756,0.28920),0.051,0.83,0.12));
 chip=max(chip,compressedFibre(face,vec2(0.12600,0.00360),vec2(0.12356,0.10400),vec2(0.12346,0.21240),0.043,0.64,0.15));
 chip=max(chip,compressedFibre(face,vec2(0.13452,0.08000),vec2(0.13255,0.14800),vec2(0.13086,0.25640),0.038,0.65,0.16));
 chip=max(chip,compressedFibre(face,vec2(0.15567,0.10440),vec2(0.15451,0.14720),vec2(0.15338,0.18880),0.030,0.47,-0.19));
 chip=max(chip,compressedFibre(face,vec2(0.25758,0.12360),vec2(0.25652,0.19720),vec2(0.25539,0.23800),0.026,0.42,0.06));
 return chip;
}
#endif
vec2 observedForeWear(vec2 face){
 vec2 bed=compressedFibre(face,vec2(.2794,.6006),vec2(.2812,.5033),vec2(.2828,.3965),.043,.90,.18);
 bed=max(bed,compressedFibre(face,vec2(.3183,.5032),vec2(.3265,.4615),vec2(.3376,.4364),.071,.88,.47));
 bed=max(bed,compressedFibre(face,vec2(.3532,.5454),vec2(.3689,.6864),vec2(.3871,.8496),.045,.99,.09));
 bed=max(bed,compressedFibre(face,vec2(.3643,.602),vec2(.3736,.5303),vec2(.3866,.3658),.032,.91,.04));
 bed=max(bed,compressedFibre(face,vec2(.5214,.8542),vec2(.5314,.7145),vec2(.5470,.5382),.055,.92,-.32));
 bed=max(bed,compressedFibre(face,vec2(.5612,.8759),vec2(.5619,.7034),vec2(.5595,.4768),.050,1.,.96));
 bed=max(bed,compressedFibre(face,vec2(.5217,.4933),vec2(.5235,.3122),vec2(.5230,.1348),.043,.97,.56));
 bed=max(bed,compressedFibre(face,vec2(.5276,.4798),vec2(.5301,.3578),vec2(.5328,.2580),.041,.81,.24));
 bed=max(bed,compressedFibre(face,vec2(.5753,.2698),vec2(.5723,.1989),vec2(.5718,.1252),.031,.72,.40));
 return max(bed,compressedFibre(face,vec2(.1883,.4843),vec2(.1909,.4042),vec2(.1939,.3567),.055,.79,.25));
}
vec2 foreEndImpressions(vec2 face,float reverseSide){
 float longitudinal=mix(face.x,1.-face.x,reverseSide);
 float depth=0.;
 for(int mark=0;mark<32;mark++){
  float key=float(mark)+17.*reverseSide;
  vec2 centre=vec2(.085+.84*hash21(vec2(key,14.7)),.18+.55*hash21(vec2(key,5.8)));
  float angle=-1.25+2.5*hash21(vec2(key,8.2));
  vec2 dir=vec2(cos(angle),sin(angle));
  vec2 local=(vec2(longitudinal,face.y)-centre)*vec2(.318,.025);
  float longMark=mark<11?1.:0.;
  float extension=mix(.00065+.0028*hash21(vec2(key,23.9)),.0018+.0063*hash21(vec2(key,23.9)),longMark);
  float offset=dot(local,dir)/extension;
  float width=(.00029+.00084*hash21(vec2(key,31.1)))*mix(.25,1.,1.-smoothstep(.1,1.,abs(offset)));
  float curved=dot(local,vec2(-dir.y,dir.x))-.00047*(1.-min(1.,offset*offset))*sin(key+7.);
  float groove=(1.-smoothstep(.16*width,width,abs(curved)))*(1.-smoothstep(.65,1.,abs(offset)));
  depth=max(depth,groove*(.67+.33*softNoise(local*1600.+key)));
 }
 return reverseSide>.5?vec2(depth,0.):max(vec2(.19*depth,0.),observedForeWear(face));
}
float crownBite(vec2 face,float phase){
 vec2 warped=face+vec2(.010,.006)*(vec2(softNoise(face*72.+phase),softNoise(face*107.-phase))-.5);
 float nearMark=strokeDistance(warped,vec2(.19,.841),vec2(.235,.859));
 float brokenMark=strokeDistance(warped,vec2(.67,.930),vec2(.724,.912));
 float hollow=max(1.-smoothstep(.005,.020,nearMark),1.-smoothstep(.004,.014,brokenMark));
 return hollow*(.64+.36*softNoise(face*vec2(170.,131.)+phase));
}
float impressions(vec2 p){
 float left=strokeDistance(p,vec2(-.83,.46),vec2(-.80,-.43));
 float arc=abs(length((p-vec2(.48,.18))*vec2(1.,.88))-.33);
 float tail=min(strokeDistance(p,vec2(.81,.18),vec2(.78,-.20)),strokeDistance(p,vec2(.78,-.20),vec2(.58,-.40)));
 tail=min(tail,strokeDistance(p,vec2(.58,-.40),vec2(.34,-.44)));
 return 1.-smoothstep(.035,.205,min(left,min(arc,tail)));
}
void layer(vec3 p,vec3 normal,vec3 axisU,vec3 axisV,vec2 scale,vec2 offset,float amount,inout vec3 color,inout vec2 surface,inout vec3 gradient){
 vec2 uv=vec2(dot(p,axisU),dot(p,axisV))*scale+offset;
 color+=amount*textureLod(pigmentMap,uv,0.).rgb;
 surface+=amount*textureLod(surfaceMap,uv,0.).rg;
 vec3 detail=textureLod(detailMap,uv,0.).xyz*2.-1.;
 vec3 slope=(detail.x*axisU+detail.y*axisV)/max(detail.z,.25);
 gradient+=amount*(slope-normal*dot(normal,slope));
}
void main(){
 finishMask=vec4(0.,0.,0.,1.);
 vec3 p=artSpace(point),normal=normalize(artSpace(faceNormal));
 vec3 tangent=normalize(artSpace(basis.xyz)-normal*dot(normal,artSpace(basis.xyz)));
 vec3 bitangent=-normalize(cross(normal,tangent))*sign(basis.w);
 vec3 color=vec3(0),gradient=vec3(0);vec2 surface=vec2(0);
 vec3 fineColor=vec3(0),fineGradient=vec3(0);vec2 fineSurface=vec2(0);
 float rough,metal;
 vec3 visible;
 if(wood){
  // The three pieces share a stain and a grain field in author space. The atlas
  // boundaries only change where the samples are stored.
  vec3 weights=pow(abs(normal),vec3(3));
  weights/=max(weights.x+weights.y+weights.z,.0001);
  const vec2 swatch=vec2(.171,.407);
  float drift=.0018*sin(p.x*22.+p.y*34.)+.00075*sin(p.x*65.+p.z*52.);
  vec3 grainPoint=p+vec3(0.,drift,drift)+vec3(0.,.046,.073)*p.x;
  layer(grainPoint,normal,along,up,vec2(2.95,9.8),swatch,weights.y,color,surface,gradient);
  layer(grainPoint,normal,along,across,vec2(2.95,9.8),swatch+vec2(0,.088),weights.z,color,surface,gradient);
  layer(p,normal,across,up,vec2(6.9,9.1),swatch+vec2(.32,.22),weights.x,color,surface,gradient);
  vec3 wearRgb=vec3(0.),wearSlope=vec3(0.);
  float wearRough=0.;
  for(int plane=0;plane<3;plane++){
   vec3 axisU=plane==1?up:across,axisV=plane==0?up:along;
   vec2 grainUv=vec2(dot(grainPoint,axisU),dot(grainPoint,axisV))*vec2(7.3,4.9)+swatch+vec2(.191,.097)*float(plane);
   wearRgb+=weights[plane]*textureLod(wearColor,grainUv,0.).rgb;
   wearRough+=weights[plane]*textureLod(wearSurface,grainUv,0.).r;
   vec3 sampleNormal=textureLod(wearNormal,grainUv,0.).rgb*2.-1.;
   vec3 slope=(sampleNormal.x*axisU+sampleNormal.y*axisV)/max(.32,sampleNormal.z);
   wearSlope+=weights[plane]*(slope-normal*dot(normal,slope));
  }
  float radial=grainPoint.z+8.*p.y*p.y+.067*p.y;
  vec2 grain=vec2(p.x,radial);
  float figure=softNoise(grain*vec2(25.,340.));
  vec2 threads=vec2(p.x*70.,(radial+.00064*figure)*1450.);
  float fibre=softNoise(threads);
  float pores=smoothstep(.39,.76,.60*(1.-fibre)+.40*(1.-figure));
  float contact=clamp(.61*patch(p,vec3(.018,0,.003),vec3(.106,.064,.044))
                     +.49*patch(p,vec3(.422,0,.013),vec3(.29,.052,.049)),0.,1.);
  float polish=smoothstep(.18,.91,.56*contact+.44*softNoise(grain*vec2(10.,73.)));
  float stain=1.+.14*(figure-.5)+.22*(fibre-.5)-.075*pores-.06*(1.-woodExposure);
  vec3 pigment=mix(color*vec3(.377,.377,.381),wearRgb*.91,.58)*stain;
  visible=linearToDisplay(displayToLinear(pigment)*vec3(1.46,1.07,.66));
  rough=clamp(.583+.53*(surface.x-.55)+.17*(wearRough-.89)+.079*pores-.069*polish,.46,.73);
  if(handguard)rough+=.017;
  metal=0.;
  float fibreSlope=softNoise(threads+vec2(0.,.16))-softNoise(threads-vec2(0.,.16));
  gradient=(1.36*gradient+1.08*wearSlope)*(1.-.28*polish)+.17*fibreSlope*(up-normal*normal.z);
#ifdef STOCK_CREST_WEAR
  {
   float face=smoothstep(.25,.77,abs(normal.y));
   float crest=(1.-smoothstep(-.055,.090,p.x))*smoothstep(.31,.90,normal.z);
   finishMask.r=crest*(.60+.30*polish)*(1.-.44*pores);
   rough=mix(rough,.462+.098*pores,.52*crest);
   gradient*=1.-.43*crest;
   vec2 detail=vec2(p.x,p.z+.20*p.y);
   if(p.x<.012){
    float phase=8.80+float(p.y<0.)*7.;
    float reach=face*(1.-smoothstep(-.11,.012,p.x))*(1.-.85*crest);
    WearSample wear=stockPatina(detail,phase);
    vec3 cuts=wear.marks;
    visible=mix(visible,visible*vec3(1.65,1.62,1.58),reach*(.55*cuts.x+.34*cuts.y+.30*cuts.z));
    rough=mix(rough,.71,reach*(.63*cuts.x+.27*cuts.z));
    vec2 stepAt=vec2(.00015,0.);
    vec3 sx=stockPatina(detail+stepAt,phase).marks-stockPatina(detail-stepAt,phase).marks;
    vec3 sy=stockPatina(detail+stepAt.yx,phase).marks-stockPatina(detail-stepAt.yx,phase).marks;
    vec3 nick=along*(sx.x+.52*sx.z)+up*(sy.x+.52*sy.z);
    gradient+=.46*reach*(nick-normal*dot(nick,normal));
   }
   if(p.x<-.025 && normal.z>.06){
    vec2 facePos=(p.xy+vec2(.2455,0.))/vec2(.3192,.025);
    vec2 scar=crestFibreWear(facePos)*smoothstep(.06,.65,normal.z);
    vec2 stepAt=vec2(.00018)/vec2(.3192,.025);
    const vec2 relief=vec2(1.,-.64);
    vec3 slope=along*dot(relief,crestFibreWear(facePos+vec2(stepAt.x,0.))-crestFibreWear(facePos-vec2(stepAt.x,0.)))
               +across*dot(relief,crestFibreWear(facePos+vec2(0.,stepAt.y))-crestFibreWear(facePos-vec2(0.,stepAt.y)));
    gradient+=.64*smoothstep(.06,.65,normal.z)*(slope-normal*dot(slope,normal));
    visible*=1.-.27*scar.x;
    visible=mix(visible,visible*1.52,.64*scar.y);
    rough=mix(rough,.73,clamp(.86*scar.x+.60*scar.y,0.,1.));
    finishMask.r*=1.-clamp(1.45*scar.x+scar.y,0.,1.);
   }
   if(p.x>-.115 && p.x<-.068 && normal.y>.14){
    float flank=smoothstep(.14,.72,normal.y);
    vec2 stamp=stockImpressionSurface(p.xz)*flank;
    float lip=stamp.y*(.48+.52*softNoise(p.xz*vec2(440.,690.)));
    visible*=1.-.52*stamp.x+.15*lip;
    rough=mix(rough,.65+.04*pores,.76*stamp.x);
    vec2 stepAt=vec2(.00021,0.);
    const vec2 relief=vec2(1.,-.32);
    vec3 slope=along*dot(relief,stockImpressionSurface(p.xz+stepAt)-stockImpressionSurface(p.xz-stepAt))
               +up*dot(relief,stockImpressionSurface(p.xz+stepAt.yx)-stockImpressionSurface(p.xz-stepAt.yx));
    gradient+=.91*flank*(slope-normal*dot(slope,normal));
   }
  }
#endif
  if(foreEnd){
   vec2 dimensions=vec2(alongRange.y-alongRange.x,heightRange.y-heightRange.x);
   vec2 face=(p.xz-vec2(alongRange.x,heightRange.x))/dimensions;
   float reverseSide=float(p.y<0.);
   float flank=smoothstep(.28,.86,abs(normal.y));
   vec2 cuts=foreEndImpressions(face,reverseSide)*flank;
   vec2 stepAt=.00019/dimensions;
   const vec2 relief=vec2(1.,-.65);
   vec3 slope=along*dot(relief,foreEndImpressions(face+vec2(stepAt.x,0.),reverseSide)-foreEndImpressions(face-vec2(stepAt.x,0.),reverseSide))
              +up*dot(relief,foreEndImpressions(face+vec2(0.,stepAt.y),reverseSide)-foreEndImpressions(face-vec2(0.,stepAt.y),reverseSide));
   float margin=smoothstep(.025,.11,face.x)*(1.-smoothstep(.93,.995,face.x));
   float wornFace=flank*margin*smoothstep(.09,.28,face.y)*(1.-smoothstep(.81,.98,face.y));
   float rubbed=wornFace*(.58+.25*polish)*(1.-.43*pores);
   finishMask.r=rubbed*(1.-smoothstep(.035,.43,cuts.x))*(1.-.77*cuts.y);
   visible*=1.+.095*wornFace-.33*cuts.x+.34*cuts.y;
   rough=clamp(rough-.067*rubbed+cuts.x*(.77-rough)*.85+.083*cuts.y,.43,.77);
   gradient+=.64*flank*(slope-normal*dot(slope,normal));
  }
 }else{
  vec3 weights=pow(abs(normal),vec3(4));weights/=max(weights.x+weights.y+weights.z,.0001);
  vec2 island=vec2(.119+.19*fract(seed*.71),.308+.053*fract(seed*.79));
  float lengthwise=(p.x-alongRange.x)/max(.23,alongRange.y-alongRange.x);
  vec3 swatchPoint=vec3(lengthwise*.145,p.y*.91,p.z*.91);
  layer(swatchPoint,normal,along,up,vec2(1),island,weights.y,color,surface,gradient);
  layer(swatchPoint,normal,along,across,vec2(1),island+vec2(0,.037),weights.z,color,surface,gradient);
  layer(swatchPoint,normal,across,up,vec2(1),island+vec2(.038,0),weights.x,color,surface,gradient);
  vec2 fineTile=vec2(.595,.096)+.012*fract(seed);
  vec3 closePoint=vec3(p.x-alongRange.x,p.y,p.z*.85);
  layer(closePoint,normal,along,up,vec2(6.1,6.9),fineTile,weights.y,fineColor,fineSurface,fineGradient);
  layer(closePoint,normal,along,across,vec2(6.1,6.9),fineTile+.025,weights.z,fineColor,fineSurface,fineGradient);
  layer(closePoint,normal,across,up,vec2(6.1,6.9),fineTile,weights.x,fineColor,fineSurface,fineGradient);
  color=mix(color,fineColor,.42);surface=mix(surface,fineSurface,.37);gradient=mix(gradient,fineGradient,.62);
  float cuff=(steelFamily==1||steelFamily==7)?1.:0.,tube=steelFamily==2?1.:0.,handled=steelFamily==4?1.:0.;
  float height=clamp((p.z-heightRange.x)/max(.002,heightRange.y-heightRange.x),0.,1.);
  float section=(p.x-alongRange.x)/max(.001,alongRange.y-alongRange.x);
  vec2 uv=vec2(p.x,p.z+.43*p.y)+seed*.018;
  float grain=softNoise(uv*1380.),islands=softNoise(uv*227.+.33*softNoise(uv*890.));
  float breakup=.54*islands+.29*softNoise(uv*615.)+.17*grain;
  float edge=band?1.-smoothstep(.0002,.0020,min(p.x-alongRange.x,alongRange.y-p.x)):0.;
  float side=abs(normal.y);
  if(guard)edge=.85*smoothstep(.10,.83,1.-side);
  float shoulder=.706-.036*(section-.5);
  float crown=smoothstep(shoulder-.008,shoulder+.008,height+.004*(islands-.5));
  float facet=(1.-crown)*smoothstep(.15,.63,abs(p.y)/.017);
  float rub=patch(vec3(section,0.,height),vec3(.70,0.,.60),vec3(.68,1.,.31));
  float spot=patch(p,vec3(.145,.036,.041),vec3(.068,.030,.032));
  float rubbed=clamp(edge*(.64+.25*breakup)+handled*(.21+.33*spot)+.08*worn,0.,1.);
  float scuff=smoothstep(.48,.73,breakup)*(.32+.68*surface.y);
  float steelWindow=cuff*facet*(.27+.44*rub)*(.80+.31*scuff);
  rubbed=clamp(rubbed+steelWindow,0.,1.);
  float stipple=softNoise(uv*3370.+16.7);
  float oxideSpot=smoothstep(.57,.80,.32*breakup+.33*grain+.35*stipple+.12*(.7-surface.y));
  float oxide=clamp((.25*(1.-surface.y)+oxideSpot*(.47+.41*cuff)+cuff*crown*.19)*(1.-.73*rubbed),0.,1.);
  float pits=flecks(uv*1940.+seed)*(.35+.65*oxideSpot);
  float streak=softNoise(vec2(uv.x*136.,uv.y*4650.));
  gradient*=.64+.62*oxide-.22*rubbed;
  vec2 pitSlope=vec2(flecks(uv*1940.+seed+vec2(.16,0))-flecks(uv*1940.+seed-vec2(.16,0)),
                     flecks(uv*1940.+seed+vec2(0,.16))-flecks(uv*1940.+seed-vec2(0,.16)));
  gradient+=vec3(pitSlope.x,.43*pitSlope.y,pitSlope.y)*(.10+.18*oxideSpot);
  float variation=softNoise(uv*vec2(46.,138.)+vec2(1.6,7.2));
  float abrasion=smoothstep(.49,.77,.69*variation+.23*islands+.08*grain);
  float coat=clamp(.36+.46*(1.-variation)+.22*oxide-.40*rubbed,0.,1.);
  vec3 blued=mix(vec3(.205,.198,.185),vec3(.246,.225,.192),.46*variation+.20*oxide);
  if(guard)blued*=.89;
  if(disk)blued*=.86;
  float polish=clamp(.68*rubbed+.22*abrasion*(.25+.75*handled),0.,1.);
  float mill=clamp((luma(fineColor)-.28)*1.3,-.11,.14);
  visible=mix(blued*(.94+.14*variation+mill),vec3(.49,.463,.415),polish)*(1.-.22*pits);
  rough=clamp(.478+.32*(surface.x-.65)+.13*coat+.058*(streak-.5)-.23*polish+.035*tube+.06*oxide,.27,.78);
  metal=clamp(.887+.066*polish-.28*oxide-.078*pits,.41,.963);
  float wornFilm=smoothstep(.48,.76,.44*variation+.33*islands+.23*grain);
  float brokenFilm=smoothstep(.39,.74,.55*islands+.31*stipple+.14*streak);
  float rubField=(.20+.29*handled+.10*side)*wornFilm*brokenFilm;
  visible=mix(visible,vec3(.48,.459,.415),rubField)*(.94+.06*streak);
  rough=clamp(rough+.056*(1.-wornFilm)-.12*rubField,.23,.78);
  metal=clamp(metal+.056*rubField,.41,.973);
  gradient*=.82+.32*oxide;
  if(handled>.5||guard){
   float oldFilm=smoothstep(.40,.72,.22*variation+.28*islands+.30*grain+.20*stipple);
   visible=mix(visible,vec3(.176,.157,.122),.40*oldFilm)*(1.-.16*pits);
   rough=clamp(rough+.063*oldFilm-.037*abrasion,.29,.75);
   metal=clamp(metal-.048*oldFilm+.031*(1.-oldFilm),.40,.966);
  }
  vec2 agedSurface=vec2(0.);vec3 agedInk=vec3(0.),agedSlope=vec3(0.);
  for(int plane=0;plane<3;plane++){
   vec3 axisU=plane==1?along:across,axisV=plane==2?along:up;
   vec2 scale=mix(vec2(5.3,7.7),vec2(14.3,16.9),cuff);
   vec2 sampleAt=vec2(dot(p,axisU),dot(p,axisV))*scale+vec2(.217,.083)+island;
   agedInk+=weights[plane]*textureLod(wearColor,sampleAt,0.).rgb;
   agedSurface+=weights[plane]*textureLod(wearSurface,sampleAt,0.).rg;
   vec3 slopeTex=textureLod(wearNormal,sampleAt,0.).rgb*2.-1.;
   vec3 slope=(slopeTex.x*axisU+slopeTex.y*axisV)/max(slopeTex.z,.4);
   agedSlope+=weights[plane]*(slope-normal*dot(slope,normal));
  }
  float film=smoothstep(.22,.81,1.-agedSurface.y);
  float abrasionValue=smoothstep(.20,.49,luma(agedInk));
  if(cuff<.5){
   float directional=softNoise(uv*vec2(76.,1480.)+vec2(.9,2.1));
   float haze=.30*variation+.35*islands+.35*directional;
   float polishPath=smoothstep(.32,.78,haze)*(.21+.46*handled+.18*tube+.15*rubbed);
   float wornMask=polishPath*(.52+.48*smoothstep(.35,.74,breakup));
   visible=mix(visible,vec3(.57,.561,.54),.43*wornMask+.078*(1.-oxide));
   rough=clamp(rough-.13*wornMask+.027*(.5-haze),.25,.78);
   metal=mix(metal,.967,wornMask);
   visible*=1.-.12*film;
   rough=clamp(rough+.19*(agedSurface.x-.62),.25,.78);
   gradient+=agedSlope*(.11+.31*film);
  }
  if(guard||handled>.5){
   vec2 oldUv=vec2(p.x*17.,(p.z+.61*p.y)*27.)+island;
   vec3 plate=textureLod(wearColor,oldUv,0.).rgb;
   vec2 marks=textureLod(wearSurface,oldUv,0.).rg;
   vec3 oldNormal=textureLod(wearNormal,oldUv,0.).xyz*2.-1.;
   float freckle=smoothstep(.21,.68,luma(plate));
   float clearSteel=clamp(.78*marks.y+.22*freckle,0.,1.);
   float quietWear=.60*clearSteel+.40*smoothstep(.20,.79,variation);
   vec3 flankCoat=mix(vec3(.146,.131,.108),vec3(.277,.256,.230),quietWear);
   float finishBlend=guard?.87*smoothstep(.15,.79,side):.74;
   vec3 knobs=mix(vec3(.179,.161,.132),vec3(.483,.456,.402),clearSteel);
   visible=mix(visible,guard?flankCoat:knobs,finishBlend);
   rough=mix(rough,clamp(.36+.30*marks.x-.13*clearSteel,.30,.68),finishBlend);
   vec3 mappedSlope=along*oldNormal.x+(up+.61*across)*oldNormal.y;
   gradient=mix(gradient,.67*(mappedSlope-normal*dot(mappedSlope,normal)),finishBlend);
  }
  if(finishGroup!=0){
   bool longRound=finishGroup==1;
   bool midRound=finishGroup==2;
   bool insetDisc=finishGroup==4;
   float angle=atan(p.z-mix(heightRange.x,heightRange.y,.5),p.y);
   vec2 continuous=vec2(p.x,angle*.009);
   float drag=.54*softNoise(continuous*vec2(22.,1900.)+island)+.46*softNoise(continuous*vec2(91.,4900.)+island);
   float fineOxide=smoothstep(.49,.80,.38*grain+.29*islands+.33*stipple);
   float endRub=1.-smoothstep(.0,.12,min(section,1.-section));
   float rubStrength=(midRound?.36:.15)+.19*endRub+.17*drag;
   vec3 patina=mix(vec3(.174,.185,.191),vec3(.248,.245,.226),.31*variation+.33*fineOxide);
   vec3 cleaned=mix(vec3(.277,.297,.309),vec3(.402,.386,.352),.28+.42*drag);
   visible=mix(patina,cleaned,rubStrength)*(.95+.075*grain-.075*fineOxide);
   rough=clamp((midRound?.375:.464)+.075*fineOxide+.068*(drag-.5)-.098*endRub,.27,.67);
   metal=clamp(.903+.051*rubStrength-.052*fineOxide,.84,.966)*.972;
   vec3 axialScratch=across*(-sin(angle))+up*cos(angle);
   float microSlope=softNoise(continuous*vec2(170.,5300.)+vec2(0.,.21))-softNoise(continuous*vec2(170.,5300.)-vec2(0.,.21));
   gradient=(axialScratch-normal*dot(axialScratch,normal))*microSlope*.075+.09*agedSlope+.10*fineGradient;
   if(!longRound&&!midRound){
    visible=mix(visible,vec3(.187,.179,.163),.36);
    rough=clamp(.477+.097*fineOxide+.061*(streak-.5)-.058*endRub,.36,.67);
    gradient=.17*agedSlope+.19*fineGradient;
   }
   if(insetDisc){
    visible*=.83;
    rough=clamp(rough+.074-.067*(1.-side),.38,.73);
   }
   float finePatina=smoothstep(.36,.78,.50*breakup+.31*grain+.19*drag);
   visible=linearToDisplay(displayToLinear(visible)*(1.45-.12*finePatina));
   rough=clamp(rough+.034*(finePatina-.5),.26,.74);
   if(longRound||midRound){
    float rubbedRail=smoothstep(.57,.84,height)*smoothstep(.11,.46,side);
    float bluing=(1.-.72*rubbedRail)*(.64+.36*finePatina);
    visible=mix(visible,visible*vec3(.72,.77,.80),bluing);
    metal=mix(metal,.785,bluing*.78);
    rough=clamp(rough+.086*bluing-.075*rubbedRail+.027*(drag-.5),.29,.71);
    gradient+=.095*(1.-rubbedRail)*agedSlope;
   }
   if(finishGroup==2||finishGroup==3){
    float thinSpot=smoothstep(.58,.83,.49*variation+.26*breakup+.25*drag);
    vec3 layerTint=mix(vec3(.49,.60,.61),vec3(.79,.85,.82),.30*thinSpot+.16*endRub);
    visible=linearToDisplay(displayToLinear(visible)*layerTint*(midRound?1.15:1.28));
    rough=clamp(rough+.029+.026*finePatina-.037*thinSpot,.29,.73);
    metal*=midRound?mix(.903,.982,thinSpot):mix(.993,1.,thinSpot);
   }
   if(longShell){
    float exposedRun=smoothstep(.575,.628,p.x)*(1.-smoothstep(.899,.962,p.x));
    float wornLine=smoothstep(.79,.95,height)*(.52+.48*drag);
    float oldFilm=exposedRun*(.91+.066*variation)*(1.-.39*wornLine);
    visible=linearToDisplay(displayToLinear(visible)*mix(vec3(1.),vec3(.286,.348,.392),oldFilm));
    float felt=.54+.031*drag+.035*variation-.074*wornLine;
    rough=clamp(mix(rough,felt,exposedRun*.91),.29,.76);
    metal*=1.-.054*oldFilm;
    gradient*=1.-.35*exposedRun;
   }
  }
  if(trimFinish!=0){
   bool loop=trimFinish==1;
   bool strip=trimFinish==3;
   float openArc=loop?(1.-smoothstep(.30,.82,height)):.0;
   float rail=strip?smoothstep(.52,.93,abs(normal.z)):smoothstep(.29,.91,abs(normal.z));
   float wearCloud=.46*softNoise(uv*vec2(91.,138.)+island)+.29*islands+.25*grain;
   float exposed=clamp(.18+.46*openArc+.23*rail+.29*smoothstep(.34,.76,wearCloud)-.26*film,0.,1.);
   if(strip)exposed=clamp(.16+.40*rail+.28*scuff+.15*edge,0.,1.);
   if(trimFinish==2)exposed=.26*exposed;
   vec3 patina=mix(vec3(.145,.136,.118),vec3(.250,.246,.222),wearCloud);
   vec3 polishColor=mix(vec3(.360,.354,.325),vec3(.538,.526,.475),abrasionValue);
   visible=mix(patina,polishColor,exposed)*(.95+.08*stipple);
   rough=clamp(.568+.08*(agedSurface.x-.60)-.30*exposed+.046*(grain-.5),.25,.74);
   metal=clamp(.87+.096*exposed-.052*film,.81,.974);
   gradient=.17*agedSlope+.14*fineGradient;
  }
  if(buttCap){
   vec2 capUv=vec2(p.y+.19*p.z,p.z)*vec2(26.,13.)+island;
   vec3 freckles=textureLod(wearColor,capUv,0.).rgb;
   vec2 layerFinish=textureLod(wearSurface,capUv,0.).rg;
   vec3 layerNormal=textureLod(wearNormal,capUv,0.).rgb*2.-1.;
   float exposedRim=1.-smoothstep(.36,.97,abs(normal.x));
   float rubLayer=clamp(.65*layerFinish.y+.21*luma(freckles)+.14*grain,0.,1.);
   visible=mix(vec3(.185,.167,.143),vec3(.376,.349,.306),.52*rubLayer+.24*exposedRim+.12*stipple);
   rough=clamp(.39+.22*layerFinish.x+.063*(1.-rubLayer)-.17*exposedRim,.28,.74);
   metal=clamp(.82+.14*rubLayer+.05*exposedRim,.79,.985);
   vec3 capSlope=across*layerNormal.x+up*layerNormal.y;
   gradient=(capSlope-normal*dot(capSlope,normal))*.52+.13*agedSlope;
  }
  if(knob){
   vec3 sphere=normalize(normal);
   float rubNoise=softNoise(vec2(sphere.x+.52*sphere.y,sphere.z-.23*sphere.y)*4.1+island);
   float pocket=smoothstep(.22,.84,.52*film+.28*rubNoise+.20*breakup);
   float polishArc=smoothstep(.22,.88,dot(sphere,normalize(vec3(.48,.71,.30)))+.17*(rubNoise-.5));
   float microWear=softNoise(vec2(p.x*2940.,(p.z+.43*p.y)*3750.)+3.1*island);
   float sharpWear=smoothstep(.23,.84,polishArc)*smoothstep(.26,.83,.24*abrasionValue+.33*rubNoise+.21*grain+.22*microWear);
   float brightTrace=smoothstep(.48,.77,.45*islands+.31*grain+.24*rubNoise);
   vec3 oldSkin=mix(vec3(.174,.151,.124),vec3(.365,.333,.284),.25*(1.-pocket)+.23*rubNoise+.52*sharpWear);
   visible=oldSkin*(.89+.19*brightTrace);
   rough=clamp(.563+.081*pocket-.141*sharpWear+.072*(microWear-.5),.40,.72);
   gradient=.15*agedSlope+.15*fineGradient+(up-sphere*sphere.z)*(.12*(grain-.5)+.19*(microWear-.5));
  }
  if(steelFamily==7){
   // The forward band shows a broad satin face and two rolled returns.
   float rimDistance=min(section,1.-section);
   float rim=1.-smoothstep(.017,.093,rimDistance);
   float dirt=smoothstep(.32,.77,.61*film+.28*variation+.11*grain);
   float flank=smoothstep(.30,.90,side);
   float patchWear=patch(vec3(section,height,0.),vec3(.62,.54,0.),vec3(.44,.27,1.));
   float wear=flank*patchWear*(.69+.31*variation);
   float recess=smoothstep(.70,.94,height)*(.72+.28*dirt);
   vec3 dark=mix(vec3(.156,.176,.184),vec3(.228,.237,.232),variation);
   vec3 rubbedFace=mix(vec3(.305,.338,.350),vec3(.495,.515,.505),.28+.65*wear);
   visible=mix(dark,rubbedFace,.27+.57*wear+.16*rim);
   visible=mix(visible,vec3(.120,.123,.119),.43*recess+.11*dirt*(1.-wear));
   float rollWear=rim*(.72+.28*variation);
   float rubbing=wear*smoothstep(.28,.78,.65*abrasionValue+.35*variation);
   rough=clamp(.488+.048*dirt+.066*(surface.x-.6)-.186*wear-.257*rollWear-.045*rubbing,.235,.62);
   visible=mix(visible,vec3(.46,.48,.49),.31*rubbing);
   metal=clamp(.947+.032*wear-.059*recess-.029*dirt,.85,.98);
   vec3 shoulderNormal=normalize(normal+along*.22*(section-.5)*flank);
   vec3 shoulderSlope=shoulderNormal/max(.55,dot(shoulderNormal,normal))-normal;
   gradient=shoulderSlope+.045*fineGradient+.045*agedSlope*(.50+.50*dirt);
   vec2 cheek=vec2(p.y>=0.?section:1.-section,height);
   vec2 disturbed=cheek+.062*vec2(softNoise(cheek*11.+island)-.5,softNoise(cheek*13.-island)-.5);
   float islandWear=patch(vec3(disturbed,0.),vec3(.46,.52,0.),vec3(.19,.17,1.))
                   +.82*patch(vec3(disturbed,0.),vec3(.68,.47,0.),vec3(.16,.10,1.));
   float exposed=flank*smoothstep(.16,.86,islandWear)*(.42+.58*smoothstep(.30,.75,.47*variation+.33*abrasionValue+.20*grain));
   visible=mix(visible,vec3(.535,.561,.555),.63*exposed);
   rough=mix(rough,.218+.045*grain,.84*exposed);
   metal=mix(metal,.978,.75*exposed);
   gradient+=.10*exposed*agedSlope;
   float cap=smoothstep(.70,.85,height)*(.66+.34*dirt);
   visible=mix(visible,vec3(.112,.122,.127),.47*cap);
   rough=mix(rough,.58,.47*cap);
#ifdef BAND_FINISH
   // The satin face scatters a broad light while the rolled returns stay polished.
   float broadFace=smoothstep(.05,.14,rimDistance)*(.32+.68*flank)
                 *smoothstep(.07,.25,height)*(1.-smoothstep(.75,.94,height));
   float gloss=1.-smoothstep(.28,.52,rough);
   vec3 filmTint=mix(vec3(.83,.87,1.01),vec3(.67,.74,.83),gloss);
   visible=linearToDisplay(displayToLinear(visible)*mix(vec3(1.),filmTint,broadFace));
   rough+=broadFace*mix(.225,.185,gloss);
   metal-=broadFace*mix(.085,.043,gloss);
   vec3 satinNormal=normalize((normal+gradient)*vec3(1.,1.,.73));
   gradient=mix(gradient,satinNormal/max(.42,dot(satinNormal,normal))-normal,broadFace);
#endif
  }else if(steelFamily==1){
   // The near side carries a slim raised rib with a recessed return beside it.
   vec2 face=vec2(p.y>=0.?section:1.-section,height);
   float frontFace=smoothstep(.15,.71,p.y/.015);
   float cheek=smoothstep(.32,.84,abs(p.y)/.015)*smoothstep(.038,.20,height)*(1.-smoothstep(.86,.99,height));
   float mottling=.46*islands+.30*film+.24*variation;
   float relief=cheek*mix(.40,1.,frontFace);
   float centre=.515+.02*(height-.53);
   float ribPos=(section-centre)/.087;
   float groovePos=(section-centre+.166)/.054;
#ifdef REAR_TRIM_FINISH
   float convergence=smoothstep(.135,.355,height);
   float crestEnd=smoothstep(.137,.207,height);
   float drift=.013*(softNoise(vec2(height*15.,seed+1.32))-.5);
   float taperedSection=.563+(section-.563-drift)/mix(.225,1.,convergence);
   ribPos=mix(ribPos,(taperedSection-centre)/.087,frontFace);
   groovePos=mix(groovePos,(taperedSection-centre+.166)/.054,frontFace);
   relief*=mix(1.,crestEnd,frontFace);
#endif
   float rib=exp(-ribPos*ribPos);
   float groove=exp(-groovePos*groovePos);
   float edgeRub=edge*(.61+.39*smoothstep(.32,.68,breakup));
   float shoulderPatch=patch(vec3(face,0.),vec3(.764,.629,0.),vec3(.33,.135,1.));
   float chipped=smoothstep(.35,.73,.46*grain+.29*islands+.25*abrasionValue);
   float exposed=shoulderPatch*(.38+.62*chipped)*(1.-crown);
   float crownOxide=crown*(.40+.60*mottling);
   float grooveFilm=groove*relief*(.72+.28*film);
   float burnish=clamp(rib*relief*.89+edgeRub*.74+exposed*.78,0.,1.);
   vec3 patinated=mix(vec3(.155,.161,.161),vec3(.302,.283,.25),mottling);
   vec3 wornFace=mix(vec3(.342,.360,.362),vec3(.555,.554,.522),chipped);
   visible=mix(patinated,wornFace,burnish);
   visible=mix(visible,vec3(.105,.099,.087),.51*crownOxide+.54*grooveFilm);
   visible=mix(visible,vec3(.58,.56,.52),exposed*.70);
   float rubbedShoulder=smoothstep(.20,.78,shoulderPatch)*(.54+.46*chipped)*(1.-crown);
   visible=mix(visible,vec3(.655,.651,.607),.69*rubbedShoulder);
   rough=clamp(.487+.073*mottling+.094*crownOxide+.086*grooveFilm-.255*burnish-.108*exposed-.13*rubbedShoulder-.073*edgeRub,.205,.78);
   metal=clamp(.940+.034*burnish-.176*crownOxide-.085*grooveFilm,.68,.983);
   vec3 flankPlane=normalize(sign(p.y)*across+up*(.09+.12*height));
   vec3 flankTangent=normalize(along-flankPlane*dot(along,flankPlane));
   vec3 formed=normalize(flankPlane+flankTangent*(2.72*ribPos*rib-1.68*groovePos*groove));
   float rimGuard=smoothstep(.017,.093,min(section,1.-section));
   gradient=mix(gradient*.34,formed/max(.25,dot(formed,normal))-normal,relief*rimGuard);
   gradient+=agedSlope*(.10+.28*crownOxide)+.06*fineGradient;
   vec2 glyph=vec2(section-.50,height-.505)*vec2(6.7,15.2);
   float stamp=impressions(glyph)*frontFace;
   vec2 incised=vec2(impressions(glyph+vec2(.05,0.))-impressions(glyph-vec2(.05,0.)),
                     impressions(glyph+vec2(0.,.045))-impressions(glyph-vec2(0.,.045)));
   gradient+=frontFace*(.47+.29*grain)*(incised.x*along+incised.y*up);
   visible*=1.-.20*stamp;
   rough+=.048*stamp;
   float chippedCrown=crownBite(face,seed)*crown*side;
   visible*=1.-.32*chippedCrown;
   rough=mix(rough,.77,.57*chippedCrown);
#ifdef BAND_FINISH
   // Two differently worn flanks border the dark return in the Lu side photograph.
   float wearZone=frontFace*cheek*(1.-smoothstep(.69,.84,height));
   float lateral=section-.017*(height-.51);
#ifdef REAR_TRIM_FINISH
   lateral=taperedSection-.017*(height-.51);
   wearZone*=crestEnd;
#endif
   float narrowWear=exp(-pow((lateral-.445)/.084,2.))*(.66+.34*smoothstep(.31,.57,height));
   float wideWear=smoothstep(.650,.750,lateral)*(1.-smoothstep(.895,.979,lateral));
   float darkReturn=1.-smoothstep(.024,.095,abs(lateral-.588));
   float abrasion=.48*chipped+.32*abrasionValue+.20*grain;
   float bare=wearZone*(.86*narrowWear+.78*wideWear)*(.71+.29*abrasion);
   vec3 silver=mix(vec3(.533,.555,.559),vec3(.767,.762,.720),abrasion);
   float unhandled=wearZone*(1.-smoothstep(.27,.416,lateral))*(1.-.67*edgeRub);
   unhandled=max(unhandled,.82*wearZone*(1.-clamp(1.18*narrowWear+wideWear,0.,1.)));
   vec3 plate=displayToLinear(visible)*mix(vec3(1.),vec3(.29,.34,.36),unhandled);
   visible=linearToDisplay(mix(plate,displayToLinear(silver),bare));
   visible=mix(visible,vec3(.044,.052,.055),.98*wearZone*darkReturn);
   rough=mix(rough,.222+.073*mottling,bare*.85);
   rough=mix(rough,.625,.69*wearZone*darkReturn);
   float polishedReturn=wearZone*exp(-pow((lateral-.79)/.123,2.));
   vec3 sheetNormal=normalize(normal+gradient+polishedReturn*(along*0.15-up*0.19));
   gradient=sheetNormal/max(.30,dot(sheetNormal,normal))-normal;
   visible=linearToDisplay(displayToLinear(visible)*mix(1.,0.84,polishedReturn));
   metal=mix(metal,.982,.78*bare);
#ifdef REAR_TRIM_FINISH
   float quietFoot=frontFace*smoothstep(.18,.70,side)*(1.-smoothstep(.128,.231,height));
   vec3 footPatina=mix(vec3(.155,.162,.161),vec3(.233,.207,.178),mottling);
   visible=mix(visible,footPatina,.80*quietFoot);
   rough=mix(rough,.548+.093*mottling,.72*quietFoot);
   float intactFilm=wearZone*(1.-smoothstep(.17,.68,narrowWear+wideWear))*(.62+.38*film);
   visible=linearToDisplay(displayToLinear(visible)*mix(vec3(1.),vec3(.64,.68,.72),intactFilm));
   float brokenEdge=wearZone*(.32+.68*softNoise(vec2(height*74.,lateral*21.)+island))
                   *smoothstep(.15,.65,wideWear)*(1.-smoothstep(.72,.97,wideWear));
   rough=clamp(rough+.075*brokenEdge,.205,.79);
#endif
#endif
  }else{
   // Worn bluing on the round and flat steel shares a cool undertone.
   // Keep the relief of scanned corrosion primarily in the surviving finish.
   float coating=smoothstep(.23,.86,.40*film+.37*variation+.23*islands);
   float contact=clamp(.36*edge+.19*abrasionValue+.16*(1.-film),0.,1.);
   float bluing=clamp(.64+.29*coating-.46*contact,0.,1.);
   if(trimFinish!=0||buttCap)bluing*=.64;
   if(knob){
    float smoothWear=.67+.33*variation;
    visible=mix(visible,vec3(.225,.237,.239),smoothWear*.72);
    rough=clamp(.430+.088*coating-.086*contact,.34,.57);
    gradient*=.37;
   }
   vec3 neutral=vec3(luma(visible));
   visible=mix(visible,neutral,bluing*.47);
   vec3 tint=mix(vec3(.91,.93,.92),vec3(.43,.53,.57),bluing);
   visible=linearToDisplay(displayToLinear(visible)*tint);
   float drawMarks=softNoise(uv*vec2(64.,3210.)+island);
   float streakWear=smoothstep(.51,.84,drawMarks)*(.43+.57*contact);
   rough=clamp(rough-.051*bluing-.048*streakWear+.021*coating,.24,.81);
   metal=clamp(metal+.027*(1.-coating),.40,.986);
   gradient*=.68+.25*coating;
   if(!knob&&!underTrim&&trimFinish==0){
    // Thin oxide carries a little diffuse light through the dark game environment.
    visible=linearToDisplay(displayToLinear(visible)*1.76);
    metal*=finishGroup==3?.990:.958;
   }
   if(guard){
    // The protected broad face is darker than the exposed rolled edge.
    float plane=smoothstep(.52,.96,side)*(.71+.29*smoothstep(.29,.49,section));
    float patina=mix(.39,.29,coating);
    visible=linearToDisplay(displayToLinear(visible)*mix(1.,patina,plane));
    rough=clamp(rough+plane*(.098+.027*coating),.24,.80);
   }
   if(underTrim){
    float depth=clamp((p.y-acrossRange.x)/max(.001,acrossRange.y-acrossRange.x),0.,1.);
    float returnWear=smoothstep(.46,.88,depth)*(.81+.19*abrasionValue);
    visible=mix(vec3(.175,.184,.188),vec3(.493,.502,.485),returnWear);
    rough=.498+.047*coating-.217*returnWear;
    metal=.92+.059*returnWear;
    gradient=.10*fineGradient+.07*agedSlope;
    float border=(depth-.61)/.104;
    float pressed=exp(-border*border)*(1.-abs(normal.y));
    visible*=1.-.38*pressed;
    rough=mix(rough,.64,.57*pressed);
    gradient+=(across-normal*normal.y)*(-1.52*border*pressed);
    float lip=smoothstep(.71,.86,depth)*(.74+.26*abrasionValue);
    visible=mix(visible,vec3(.58,.60,.58),.66*lip);
    rough=mix(rough,.245,.77*lip);
   }
#ifdef REAR_TRIM_FINISH
   if(trimFinish==2){
    float broad=smoothstep(.42,.90,side);
    float corner=smoothstep(.22,.78,1.-side)*(.52+.48*abrasionValue);
    float oxide=smoothstep(.27,.76,.58*film+.27*variation+.15*grain);
    vec3 heel=mix(vec3(.190,.183,.163),vec3(.32,.307,.275),.42+.36*variation-.25*oxide);
    visible=mix(heel,vec3(.477,.469,.438),.69*corner);
    rough=clamp(.54+.067*oxide+.040*(grain-.5)-.240*corner,.26,.69);
    metal=clamp(.914+.061*corner-.065*oxide,.82,.982);
    gradient=.19*agedSlope+.077*fineGradient*(.72+.28*broad);
   }else if(trimFinish==1){
    float handledArc=(1.-smoothstep(.24,.79,height))*(.68+.32*abrasionValue);
    visible=mix(visible,vec3(.545,.536,.494),.46*handledArc);
    rough=clamp(rough-.070*handledArc,.235,.72);
    metal=mix(metal,.978,.62*handledArc);
   }
#endif
  }
 }
 base=vec4(visible,1.);
 orm=vec4(visibility,rough,metal,1.);
 mapped=vec4(normalize(vec3(dot(gradient,tangent),dot(gradient,bitangent),1.))*.5+.5,1.);
}
