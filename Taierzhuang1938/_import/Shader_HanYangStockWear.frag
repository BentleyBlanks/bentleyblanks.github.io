#version 330
in vec3 point, faceNormal;
in vec4 basis;
uniform int regionCount, strokeCount;
uniform vec4 regionShape[16], regionPaint[16];
uniform vec4 strokeLine[40], strokeShape[40], strokePaint[40];
layout(location=0) out vec4 finish;
layout(location=1) out vec3 relief;

float Hash(vec2 p) {
    vec3 f = fract(vec3(p.xyx) * vec3(.11369,.13787,.09987));
    f += dot(f,f.yzx+19.19);
    return fract((f.x+f.y)*f.z);
}

float Noise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f*f*(3.-2.*f);
    return mix(mix(Hash(cell),Hash(cell+vec2(1.,0.)),f.x),
               mix(Hash(cell+vec2(0.,1.)),Hash(cell+vec2(1.)),f.x),f.y);
}

vec2 Perpendicular(vec2 v) { return vec2(-v.y,v.x); }

vec2 Project(vec2 face) { return vec2(point.z,dot(point.xy,Perpendicular(face))); }

void main() {
    vec3 n = normalize(faceNormal);
    float matte = 0., burnish = 0., fibre = 0., cavity = 0., depth = 0.;
    for (int i = 0; i < regionCount; ++i) {
        vec4 shape = regionShape[i], paint = regionPaint[i];
        vec2 face = paint.xy;
        vec2 q = (Project(face)-shape.xy)/shape.zw;
        float facing = smoothstep(.13,.77,dot(n.xy,face));
        if (dot(q,q) > 2. || facing <= 0.) continue;
        float key = 27.53+float(i)*9.13;
        float mottling = Noise(q*vec2(2.5,4.4)+key);
        float grain = Noise(Project(face)*vec2(84.,2310.)+key);
        float margin = length(q+vec2(.14,-.12)*(mottling-.5));
        float broken = margin + .40*(mottling-.5) + .13*(grain-.5);
        float worn = facing * (1.-smoothstep(.18,1.06,broken));
        matte = max(matte,paint.z*worn*smoothstep(.20,.78,.68*mottling+.32*grain));
        burnish = max(burnish,paint.w*worn*(.54+.46*smoothstep(.20,.78,1.-mottling)));
    }
    for (int i = 0; i < strokeCount; ++i) {
        vec4 line = strokeLine[i], shape = strokeShape[i], paint = strokePaint[i];
        vec2 face = shape.xy;
        float facing = smoothstep(.21,.78,dot(n.xy,face));
        vec2 offset = Project(face)-line.xy;
        vec2 q = vec2(dot(offset,line.zw),dot(offset,Perpendicular(line.zw)))/shape.zw;
        if (abs(q.x) > 1.10 || abs(q.y) > 2.15 || facing <= 0.) continue;

        float key = 15.79+float(i)*7.87;
        float wander = .19*sin(q.x*4.1+key) + .16*(Noise(vec2(q.x*5.4,key))-.5);
        float side = q.y - paint.w*(1.-min(q.x*q.x,1.)) - wander;
        float taper = smoothstep(-1.02,-.51,q.x)*(1.-smoothstep(.41,1.,q.x));
        float split = Noise(vec2(q.x*6.8,key));
        float fuzz = Noise(vec2(q.x*12.9,side*7.1)+key);
        float width = (.37+.57*taper)*(.54+.58*split);
        float continuity = .37+.63*smoothstep(.14,.75,split);
        float pressure = paint.x*facing*taper*continuity;
        float compressed = pressure*(1.-smoothstep(.14,.89,abs(side)/width));
        float chipWidth = width*(1.1+.35*fuzz);
        float torn = pressure*(1.-smoothstep(.15,.69,abs(side-.52*width)/chipWidth))
                   * smoothstep(.16,.81,.57*split+.43*fuzz);
        float exposed = paint.z*(.68*torn + compressed*(.44+.56*fuzz));
        fibre = max(fibre,exposed);
        cavity = max(cavity,compressed*min(1.,paint.y/.00019));
        depth += paint.y*(compressed-.14*torn);
    }

    // Differentiate the painted cuts in surface metres and express their
    // relief in the mesh tangent frame, even on rotated or mirrored UV charts.
    vec3 t = normalize(basis.xyz-n*dot(n,basis.xyz));
    vec3 b = cross(n,t)*sign(basis.w);
    vec3 dx = dFdx(point), dy = dFdy(point);
    vec2 ax = vec2(dot(dx,t),dot(dx,b)), ay = vec2(dot(dy,t),dot(dy,b));
    float det = ax.x*ay.y-ax.y*ay.x;
    vec2 hd = vec2(dFdx(depth),dFdy(depth)), slope = vec2(0.);
    if (abs(det) > 1.e-11) {
        slope = vec2(ay.y*hd.x-ax.y*hd.y,ax.x*hd.y-ay.x*hd.x)/det;
    }
    finish = vec4(matte,burnish,fibre,cavity);
    relief = vec3((128.+127.*clamp(slope/.80,-1.,1.))/255.,1.);
}
