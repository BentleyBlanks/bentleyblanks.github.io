#version 330
in vec3 point,faceNormal;
in vec4 basis;
in float visibility,woodExposure,edgeWear;
uniform bool wood,band,guard,disk,knob,buttCap,foreEnd,handguard,longShell,underTrim;
uniform float seed,worn;
uniform vec2 alongRange;
uniform int steelFamily,finishGroup,trimFinish,steelDetail;
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
void layer(vec3 p,vec3 normal,vec3 axisU,vec3 axisV,vec2 scale,vec2 offset,float amount,inout vec3 color,inout vec2 surface,inout vec3 gradient){
 vec2 uv=vec2(dot(p,axisU),dot(p,axisV))*scale+offset;
 color+=amount*textureLod(pigmentMap,uv,0.).rgb;
 surface+=amount*textureLod(surfaceMap,uv,0.).rg;
 vec3 detail=textureLod(detailMap,uv,0.).xyz*2.-1.;
 vec3 slope=(detail.x*axisU+detail.y*axisV)/max(detail.z,.25);
 gradient+=amount*(slope-normal*dot(normal,slope));
}
float SteelNoise(vec3 point,vec3 weights){
 return dot(weights,vec3(softNoise(point.yz+3.1),softNoise(point.xz-5.7),softNoise(point.xy+8.2)));
}
void main(){
 finishMask=vec4(0.,0.,0.,1.);
 vec3 p=artSpace(point),normal=normalize(artSpace(faceNormal));
 vec3 tangent=normalize(artSpace(basis.xyz)-normal*dot(normal,artSpace(basis.xyz)));
 vec3 bitangent=-normalize(cross(normal,tangent))*sign(basis.w);
 vec3 color=vec3(0),gradient=vec3(0);vec2 surface=vec2(0);
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
  vec3 weights=pow(abs(normal),vec3(4.));
  weights/=max(dot(weights,vec3(1.)),.0001);
  vec3 samplePoint=p+vec3(.021,.049,.073)*seed;
  vec3 agedColor=vec3(0.),agedSlope=vec3(0.),poreSlope=vec3(0.);
  vec2 agedSurface=vec2(0.);
  float pores=0.;
  for(int plane=0;plane<3;plane++){
   vec3 axisU=plane==1?along:across;
   vec3 axisV=plane==2?along:up;
   vec2 uv=vec2(dot(samplePoint,axisU),dot(samplePoint,axisV));
   float weight=weights[plane];
   layer(p,normal,axisU,axisV,vec2(8.7,9.9),vec2(.318,.517)+.019*seed,weight,color,surface,gradient);
   vec2 agedUv=uv*vec2(24.3,28.9)*(steelDetail==4?1.36:1.)+vec2(.37,.63);
   agedColor+=weight*textureLod(wearColor,agedUv,0.).rgb;
   agedSurface+=weight*textureLod(wearSurface,agedUv,0.).rg;
   vec3 scan=textureLod(wearNormal,agedUv,0.).xyz*2.-1.;
   agedSlope+=weight*(axisU*scan.x+axisV*scan.y)/max(scan.z,.34);
   vec2 cell=uv*vec2(1550.,1470.)+vec2(2.4,8.1)*float(plane);
   pores+=weight*flecks(cell);
   poreSlope+=weight*(axisU*(flecks(cell-vec2(.14,0.))-flecks(cell+vec2(.14,0.)))
                    +axisV*(flecks(cell-vec2(0.,.14))-flecks(cell+vec2(0.,.14))));
  }
  float cloud=SteelNoise(samplePoint*(steelDetail==4?238.:162.),weights);
  float mottling=SteelNoise(samplePoint*428.,weights);
  float fine=SteelNoise(samplePoint*2170.,weights);
  float film=smoothstep(.21,.82,.41*cloud+.38*mottling+.21*(1.-agedSurface.y));
  if(steelDetail==4)film=mix(.46,film,.68);
  float pitDepth=pores*(.33+.67*film);
  float oxidation=smoothstep(.49,.78,.46*mottling+.32*film+.22*fine);
  float pitting=clamp(.79*pitDepth+.21*oxidation,0.,1.);

  float length=max(.001,alongRange.y-alongRange.x);
  float section=clamp((p.x-alongRange.x)/length,0.,1.);
  float height=clamp((p.z-heightRange.x)/max(.002,heightRange.y-heightRange.x),0.,1.);
  float tip=min(section,1.-section)*length;
  float rim=band?(1.-smoothstep(.00009,.00140,tip))*(.62+.38*fine):0.;
  float shoulder=abs(normal.z);
  float rub=.18+.09*worn+.09*cloud;
  float edge=max(edgeWear,rim*(steelFamily==1||steelFamily==7?.91:.76));

  if(steelFamily==1||steelFamily==7){
   // Burnishing breaks into patches as it leaves the edge of the formed strap.
   float cheek=smoothstep(.24,.85,abs(normal.y));
   float turnHeight=height+.055*(mottling-.5);
   float faceFade=smoothstep(.16,.35,turnHeight)*(1.-smoothstep(.60,.82,turnHeight));
   float wearPatch=patch(vec3(section,height,0.),vec3(.69,.55,0.),vec3(.43,.30,1.));
   float crest=steelFamily==1?patch(vec3(section,0.,0.),vec3(.51,0.,0.),vec3(.14,1.,1.)):0.;
   float scuff=smoothstep(.24,.71,.58*mottling+.42*cloud);
   float wiped=steelFamily==7?.31:.18;
   rub=.13+cheek*faceFade*((.23+wiped)*wearPatch+.21*crest)*scuff;
   vec2 face=vec2(p.y>=0.?section:1.-section,height);
   film=max(film,.52*crownBite(face,seed)*smoothstep(.71,.89,height));
  }else if(steelDetail==1){
   rub=.37+.20*smoothstep(.18,.78,normal.z)+.12*mottling;
  }else if(steelDetail==2){
   rub=.32+.25*smoothstep(.32,.75,cloud)+.09*shoulder;
  }else if(steelDetail==3){
   rub=.15+.14*smoothstep(.30,.84,normal.z);
  }else if(steelDetail==4){
   rub=.14+.08*shoulder+.07*cloud;
  }

  if(knob)rub=.26+.30*smoothstep(.25,.77,cloud);
  if(guard)rub=.07+.20*smoothstep(.28,.84,1.-abs(normal.y));
  if(disk)rub*=.69;
  if(buttCap)rub=.16+.18*(1.-abs(normal.x))+.08*mottling;
  if(trimFinish!=0)rub=.11+.16*(1.-smoothstep(.20,.81,height))+.12*shoulder;
  if(underTrim){
   float depth=clamp((p.y-acrossRange.x)/max(.001,acrossRange.y-acrossRange.x),0.,1.);
   rub=.10+.32*smoothstep(.51,.90,depth);
  }
  if(longShell)rub*=.79;
  // Real rounded faces provide the edge mask for the receiver and the sight.
  // Break up the wear with the scan and keep the surface normal at its baked scale.
  float polish=clamp(rub+.64*edge*(.68+.32*mottling)-.19*film,0.,.92);
  float mineral=clamp(.60*luma(agedColor)+.40*luma(color),0.,1.);
  vec3 oxide=mix(vec3(.143,.134,.119),vec3(.239,.227,.209),.48*cloud+.36*mineral+.16*mottling);
  if(finishGroup==1||finishGroup==3)oxide*=vec3(.96,1.01,1.035);
  vec3 bare=mix(vec3(.288,.282,.266),vec3(.388,.377,.349),.35*cloud+.65*fine);
  visible=mix(oxide,bare,polish)*(1.-.23*pitting-.083*oxidation);
  rough=clamp(.484+.112*film+.085*pitting+.037*(agedSurface.x-.5)
                   +.04*(surface.x-.5)-.265*polish,.32,.72);
  metal=clamp(.915+.075*polish-.088*film-.134*pitting,.70,.985);
  gradient=gradient*(.16+.064*film)+agedSlope*(.14+.13*film)+poreSlope*(.060+.105*film);
 }
 base=vec4(visible,1.);
 orm=vec4(visibility,rough,metal,1.);
 mapped=vec4(normalize(vec3(dot(gradient,tangent),dot(gradient,bitangent),1.))*.5+.5,1.);
}
