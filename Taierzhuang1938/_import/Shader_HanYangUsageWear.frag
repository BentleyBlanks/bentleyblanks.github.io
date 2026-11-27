#version 330
in vec3 point, faceNormal;
in float bevel;
uniform int surface;
uniform float phase, intensity;
uniform vec2 lengthRange;
uniform sampler2D weatheredSteel;
layout(location=0) out vec4 finish;
layout(location=1) out vec2 coverage;

float Hash(vec2 p) {
    vec3 f = fract(vec3(p.xyx) * vec3(.11369,.13787,.09987));
    f += dot(f,f.yzx+19.19);
    return fract((f.x+f.y)*f.z);
}

float Noise(vec2 p) {
    vec2 f=fract(p);
    vec2 c=floor(p);
    f=f*f*(3.-2.*f);
    return mix(mix(Hash(c),Hash(c+vec2(1.,0.)),f.x),mix(Hash(c+vec2(0.,1.)),Hash(c+vec2(1.)),f.x),f.y);
}

float Patch(vec3 p,vec3 center,vec3 extent) {
    vec3 r=(p-center)/extent;
    return exp(-dot(r,r)*1.35);
}

// Broken surface abrasion with taper and lateral drift along the grain
// or the working direction of the steel face.
float Threads(vec2 p,vec2 interval,float salt) {
    vec2 grid=p/interval+vec2(salt,salt*.613);
    vec2 cell=floor(grid);
    vec2 local=fract(grid)-(.32+.36*vec2(Hash(cell+13.4),Hash(cell+28.1)));
    float travel=mix(.13,.31,Hash(cell+9.2));
    float u=local.x/travel;
    float taper=1.-smoothstep(.38,1.,abs(u));
    float roughTip=Noise(vec2(local.x*22.+salt,cell.y*.64));
    float drift=mix(-.34,.41,Hash(cell+11.4))*local.x;
    drift+=.047*sin(u*4.2+Hash(cell+7.37)*6.28)*(1.-min(1.,u*u));
    float width=mix(.059,.169,Hash(cell+29.7))*(.62+.38*taper);
    float across=abs(local.y-drift);
    float nick=(1.-smoothstep(.28*width,width,across))*taper;
    return nick*smoothstep(.52,.86,Hash(cell+35.2))*(.42+.58*roughTip);
}

float TaperedTrack(vec2 p,vec2 start,vec2 end,float width,float key) {
    vec2 travel=end-start;
    float along=clamp(dot(p-start,travel)/dot(travel,travel),0.,1.);
    float ends=smoothstep(.0,.15,along)*(1.-smoothstep(.72,1.,along));
    vec2 perpendicular=normalize(vec2(-travel.y,travel.x));
    vec2 offset=p-start-along*travel;
    float warp=Noise(vec2(along*7.2+key,key*.67))-.5;
    float gap=Noise(vec2(along*13.4,key));
    float distance=length(offset-perpendicular*warp*width*.65);
    float feather=width*(.58+.42*ends);
    return (1.-smoothstep(.27*feather,feather,distance))*ends*(.40+.60*smoothstep(.17,.67,gap));
}

vec4 WoodWear(vec3 p,vec3 n) {
    float reach;
    if(surface==1) {
        reach=.88*Patch(p,vec3(0.,.019,-.193),vec3(.028,.026,.146))
             +.78*Patch(p,vec3(0.,-.015,-.018),vec3(.026,.038,.079))
             +.63*Patch(p,vec3(0.,.027,-.435),vec3(.026,.033,.143))
             +.22*Patch(p,vec3(-.010,-.024,.155),vec3(.022,.044,.106));
    }else if(surface==2) {
        reach=.82*Patch(p,vec3(0.,.046,-.454),vec3(.026,.028,.111))
             +.43*Patch(p,vec3(0.,.046,-.297),vec3(.027,.019,.034));
    }else{
        reach=.63*Patch(p,vec3(0.,.024,-.688),vec3(.026,.022,.096))
             +.39*Patch(p,vec3(0.,.029,-.879),vec3(.024,.024,.042));
    }
    reach=clamp(reach,0.,1.)*(1.-smoothstep(.60,.93,abs(n.z)));
    vec2 grain=vec2(-p.z,p.y+.47*p.x);
    float spread=Noise(grain*vec2(25.4,96.)+phase);
    float scatter=Noise(grain*vec2(71.,433.)+phase*1.71);
    float fibre=Noise(grain*vec2(106.,2810.)+phase*.91);
    float matte=reach*smoothstep(.38,.80,.49*spread+.30*scatter+.21*fibre);
    float sheen=reach*smoothstep(.22,.72,.70*(1.-spread)+.30*scatter);
    float micro=Threads(grain,vec2(.047,.0020),phase+29.83);
    micro=max(micro,.61*Threads(grain+vec2(.019,-.0008),vec2(.028,.00159),phase+21.3));
    float scuff=micro*(.13+.87*reach)*(.52+.48*fibre);
    if(surface==1) {
        vec2 cheek=(grain-vec2(.039,-.013))/vec2(.289,.054);
        float contactMark=TaperedTrack(cheek,vec2(.14,.52),vec2(.49,.56),.019,7.4);
        contactMark=max(contactMark,.79*TaperedTrack(cheek,vec2(.26,.69),vec2(.61,.70),.018,11.9));
        contactMark=max(contactMark,.70*TaperedTrack(cheek,vec2(.48,.64),vec2(.66,.68),.014,23.2));
        scuff=max(scuff,reach*contactMark);
    }
    return vec4(sheen,matte,scuff,reach);
}

vec2 PatinaScan(vec3 p,vec3 n) {
    vec3 weight=pow(abs(n),vec3(4.));
    weight/=max(dot(weight,vec3(1.)),.0001);
    return weight.x*textureLod(weatheredSteel,p.zy*vec2(11.7,14.8)+vec2(.17,.51),0.).rg
         + weight.y*textureLod(weatheredSteel,p.zx*vec2(11.7,13.8)+vec2(.67,.27),0.).rg
         + weight.z*textureLod(weatheredSteel,p.xy*vec2(18.2,22.0)+vec2(.29,.73),0.).rg;
}

void SteelWear(vec3 p,vec3 n) {
    vec2 scan=PatinaScan(p,n);
    vec2 face=vec2(p.z,p.y+.69*p.x);
    float film=Noise(face*vec2(167.,219.)+phase);
    float speckle=Noise(face*vec2(397.,528.)+phase*.87);
    float drift=Noise(face*vec2(48.3,87.)+phase*1.27);
    float oxide=intensity*smoothstep(.43,.81,.39*film+.26*speckle+.23*scan.x+.12*scan.y);
    float exposed=intensity*smoothstep(.48,.86,.47*drift+.31*film+.22*(1.-scan.x));
    exposed*=.65+.35*smoothstep(.12,.89,n.y);
    float rim=smoothstep(.17,.86,bevel);
    float interrupted=Noise(vec2((p.z+.57*p.y)*141.7,(p.x-.34*p.y)*211.)+phase);
    float breakup=smoothstep(.34,.79,.59*interrupted+.28*film+.13*(1.-scan.y));
    float tipWear=rim*breakup*(.67+.33*speckle);
    float edgeGap=rim*(1.-breakup);
    float scratches=.25*Threads(face,vec2(.035,.0027),phase+8.96)*intensity;
    if(surface==4) {
        float z=(p.z-lengthRange.x)/(lengthRange.y-lengthRange.x);
        float capFacing=max(smoothstep(.08,.76,n.y),.78*smoothstep(.32,.90,abs(n.x)));
        // Follow the arc of the plate into the side returns so the scuffs
        // run down the exposed length at either viewing angle.
        float across=.5+atan(p.x,max(.0005,p.y-.0268))/3.08;
        vec2 plate=vec2(z,across);
        float tracks=TaperedTrack(plate,vec2(.14,.27),vec2(.89,.32),.018,8.1);
        tracks=max(tracks,.76*TaperedTrack(plate,vec2(.26,.44),vec2(.96,.51),.014,3.9));
        tracks=max(tracks,.87*TaperedTrack(plate,vec2(.09,.66),vec2(.74,.74),.016,17.4));
        tracks=max(tracks,.80*TaperedTrack(plate,vec2(.49,.59),vec2(.88,.61),.011,27.0));
        tracks=max(tracks,.64*TaperedTrack(plate,vec2(.11,.71),vec2(.45,.63),.013,12.4));
        tracks=max(tracks,.88*TaperedTrack(plate,vec2(.31,.12),vec2(.94,.19),.016,36.2));
        tracks=max(tracks,.87*TaperedTrack(plate,vec2(.40,.83),vec2(.91,.86),.014,45.1));
        float striation=Threads(vec2(p.z,across*.030),vec2(.035,.00165),phase+17.3);
        scratches=max(scratches,capFacing*max(tracks,.75*striation));
        float swept=Noise(vec2(z*4.9,across*10.7)+phase);
        float shortWipe=Noise(vec2(p.z*89.,across*21.3)+phase+3.4);
        float wiped=capFacing*smoothstep(.25,.80,.48*swept+.25*film+.27*shortWipe);
        exposed=max(exposed,.77*wiped);
        oxide=max(oxide*(1.-.76*wiped),.52*capFacing*smoothstep(.50,.84,.49*film+.33*scan.x+.18*speckle));
    }
    finish=vec4(oxide,exposed,tipWear,scratches);
    coverage=vec2(1.,edgeGap);
}

void main() {
    vec3 normal=normalize(faceNormal);
    if(surface==0||surface==4) {
        SteelWear(point,normal);
    }else{
        finish=WoodWear(point,normal);
        coverage=vec2(1.,0.);
    }
}
