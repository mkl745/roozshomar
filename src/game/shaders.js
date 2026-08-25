const SHADERS = (() => {

const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = h21(i), b = h21(i+vec2(1.0,0.0)), c = h21(i+vec2(0.0,1.0)), d = h21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = r*p*2.03; a *= 0.5; }
  return v;
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uSunYD;
uniform float uSunR;
uniform float uCamX;
uniform vec3 uCTop;
uniform vec3 uCUp;
uniform vec3 uCMid;
uniform vec3 uCLow;
uniform vec3 uCHor;
uniform vec3 uCGlow;
uniform float uCloudAmt;
uniform float uCloudLit;
uniform float uSunI;
uniform float uHaze;
${NOISE}
vec3 stopGrad(float y){
  vec3 c = mix(uCTop, uCUp, smoothstep(0.00, 0.32, y));
  c = mix(c, uCMid, smoothstep(0.28, 0.58, y));
  c = mix(c, uCLow, smoothstep(0.54, 0.80, y));
  c = mix(c, uCHor, smoothstep(0.76, 0.97, y));
  return c;
}
void main(){
  vec2 uv = vec2(vUV.x, 1.0-vUV.y);
  float aspect = uRes.x/uRes.y;
  vec3 col = stopGrad(uv.y);

  vec2 sunP = uSunYD;
  float sd = length((uv - sunP)*vec2(aspect, 1.0));

  vec2 cuv = vec2(uv.x*(2.2 + uCloudAmt*1.6) + uTime*(0.0045 + uCloudAmt*0.004) + uCamX*0.00003,
                  uv.y*(5.5 + uCloudAmt*4.0));
  float band1 = smoothstep(0.24, 0.02, abs(uv.y-0.26));
  float band2 = smoothstep(0.18, 0.02, abs(uv.y-0.48))*0.7;
  float stratus = smoothstep(0.30, 0.75, fbm(vec2(uv.x*1.4 + uTime*0.008 + uCamX*0.00004, uv.y*9.0)))*uCloudAmt;
  float cd1 = fbm(cuv + vec2(0.0, 13.7));
  float cd2 = fbm(cuv*1.7 + vec2(31.4, 7.7));
  float thr = mix(0.62, 0.36, uCloudAmt);
  float d1 = smoothstep(thr, thr+0.34, cd1)*band1*mix(0.92, 1.0, uCloudAmt);
  float d2 = smoothstep(thr+0.06, thr+0.40, cd2)*band2;
  float prox = exp(-sd*1.9);

  vec3 cShadow = mix(uCMid*0.72, vec3(0.24,0.27,0.33), uCloudAmt*uCloudLit*0.9);
  vec3 cLight = mix(uCGlow, vec3(0.52,0.57,0.60), uCloudLit*0.55);
  float lit = clamp(prox*1.5*uSunI + smoothstep(0.5,0.9,cd1)*0.25, 0.0, 1.0)*mix(1.0, 0.45, uCloudLit);
  vec3 cloudCol = mix(cShadow, cLight, lit);
  col = mix(col, cloudCol, clamp(d1*0.92 + d2*0.85 + stratus*0.55*mix(0.35,1.0,uCloudLit), 0.0, 1.0));

  float disc = smoothstep(uSunR, uSunR*0.86, sd);
  float halo = exp(-sd*3.2)*0.50 + exp(-sd*8.0)*0.70;
  col += (uCGlow*0.55 + vec3(0.45,0.42,0.31))*uSunI*(disc*1.15 + halo*0.85);

  float hz = (uv.y - 0.84) * 7.0;
  float hg = exp(-hz*hz) * exp(-abs(uv.x-sunP.x)*aspect*1.35);
  col += hg*uCGlow*uHaze;

  col += (h21(uv*uRes)-0.5)/255.0;
  oC = vec4(max(col, 0.0), 1.0);
}`;

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
uniform vec2 uRes;
uniform vec2 uCamPos;
uniform vec2 uViewHalf;
uniform int uMode;
uniform vec4 uRect;
uniform float uRot;
out vec2 vUV;
out float vWx;
void main(){
  vec2 p = aPos*uRect.zw;
  float cs = cos(uRot), sn = sin(uRot);
  p = vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs);
  vec2 wpos = uRect.xy + p;
  if(uMode == 0){
    vec2 rel = (wpos - uCamPos)/uViewHalf;
    gl_Position = vec4(rel.x, -rel.y, 0.0, 1.0);
  } else {
    vec2 n = (wpos/uRes)*2.0 - 1.0;
    gl_Position = vec4(n.x, -n.y, 0.0, 1.0);
  }
  vUV = aUV;
  vWx = wpos.x;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vWx;
out vec4 oC;
uniform sampler2D uT0;
uniform vec4 uTint;
uniform vec4 uUVR;
uniform float uFlip;
uniform float uSway;
uniform float uTime;
void main(){
  vec2 uv = vec2(mix(vUV.x, 1.0-vUV.x, uFlip), vUV.y);
  if(uSway > 0.001){
    float topness = 1.0 - uv.y;
    uv.x += sin(uTime*1.8 + vWx*0.018 + uv.y*3.5)*0.016*uSway*topness*topness;
  }
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 fuv = uUVR.xy + uv*uUVR.zw;
  vec4 c = texture(uT0, fuv)*uTint;
  if(c.a < 0.004) discard;
  oC = c;
}`;

const WATER_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform float uTime;
uniform float uRain;
${NOISE}
uniform vec3 uDeep;
uniform vec3 uReflHi;
uniform vec3 uReflLo;
uniform vec3 uFoamC;
void main(){
  float surf = 1.0 - vUV.y;
  float depth = vUV.y;
  vec3 refl = mix(uReflLo, uReflHi, pow(surf, 1.6));
  vec3 col = mix(refl, uDeep, smoothstep(0.0, 0.62, depth));

  float w = sin(vUV.x*42.0 + uTime*0.8 + sin(vUV.x*23.0 - uTime*0.47)*1.6)*0.5+0.5;
  col += smoothstep(0.78, 1.0, w)*exp(-depth*3.2)*0.26*mix(uReflHi, vec3(1.0), 0.4);

  float s = fbm(vec2(vUV.x*7.0 - uTime*0.05, vUV.y*26.0));
  col += pow(smoothstep(0.60, 0.95, s), 2.2)*(0.20 + 0.55*surf)*uReflHi;

  float dim = fbm(vec2(vUV.x*160.0 + uTime*1.6, vUV.y*300.0));
  col += smoothstep(0.78, 0.98, dim)*(0.05 + 0.22*uRain)*exp(-depth*2.0)*uFoamC;

  vec2 cell = floor(vec2(vUV.x*110.0, vUV.y*26.0)) + floor(uTime*2.2);
  float tw = step(0.986, h21(cell))*(0.5+0.5*sin(uTime*9.0 + h21(cell+7.0)*20.0));
  col += tw*surf*uReflHi*(0.5 + 0.5*uRain);

  float foam = smoothstep(0.93, 1.0, surf)*(0.40 + 0.28*sin(uTime*1.7 + vUV.x*46.0) + 0.25*uRain*sin(uTime*7.0+vUV.x*90.0));
  col = mix(col, uFoamC, clamp(foam, 0.0, 1.0)*0.75);
  col = mix(col, uDeep*0.55, smoothstep(0.10, 0.0, surf));

  float ax = smoothstep(0.0, 0.07, vUV.x)*smoothstep(1.0, 0.93, vUV.x);
  float a = (0.90 - depth*0.08)*ax;
  oC = vec4(col, a);
}`;

const RAIN_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform float uTime;
uniform float uAmt;
uniform float uWind;
uniform vec2 uRes;
float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
void main(){
  vec2 suv = vec2(vUV.x, 1.0-vUV.y);
  float aspect = uRes.x/uRes.y;
  vec2 p = vec2(suv.x*aspect, suv.y);
  vec2 q = vec2(p.x - p.y*uWind, p.y);
  float a = 0.0;
  for(int k=0;k<3;k++){
    float fk = float(k);
    float cols = 70.0 + fk*90.0;
    float spd = 1.4 + fk*1.15;
    float thick = 0.16 - fk*0.035;
    float br = 0.38 - fk*0.09;
    float u = q.x*cols/aspect;
    float cu = floor(u);
    float ru = rh(vec2(cu, fk*17.0 + floor(uTime*0.23)*3.0));
    float on = step(ru, 0.42);
    float y = q.y*(2.2 + fk) + uTime*spd + ru*40.0;
    float yy = fract(y);
    float streak = smoothstep(0.0, 0.05, yy)*smoothstep(0.30 + fk*0.10, 0.05, yy);
    float thin = smoothstep(thick, 0.01, abs(fract(u)-0.5));
    a += streak*thin*on*br;
  }
  a *= uAmt;
  oC = vec4(vec3(0.72, 0.80, 0.90)*a, a);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform sampler2D uT0;
uniform float uThresh;
void main(){
  vec3 c = texture(uT0, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(uThresh, uThresh+0.32, l);
  oC = vec4(c*w, 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform sampler2D uT0;
uniform vec2 uTexel;
void main(){
  vec3 c = texture(uT0, vUV).rgb*4.0;
  c += texture(uT0, vUV + uTexel*vec2( 1.0, 1.0)).rgb;
  c += texture(uT0, vUV + uTexel*vec2(-1.0, 1.0)).rgb;
  c += texture(uT0, vUV + uTexel*vec2( 1.0,-1.0)).rgb;
  c += texture(uT0, vUV + uTexel*vec2(-1.0,-1.0)).rgb;
  oC = vec4(c/8.0, 1.0);
}`;

const UP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uTexel;
void main(){
  vec3 a = texture(uA, vUV).rgb*4.0;
  a += texture(uA, vUV + uTexel*vec2( 1.0, 1.0)).rgb*2.0;
  a += texture(uA, vUV + uTexel*vec2(-1.0, 1.0)).rgb*2.0;
  a += texture(uA, vUV + uTexel*vec2( 1.0,-1.0)).rgb*2.0;
  a += texture(uA, vUV + uTexel*vec2(-1.0,-1.0)).rgb*2.0;
  a /= 12.0;
  oC = vec4(a + texture(uB, vUV).rgb, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oC;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uSunUV;
uniform float uRay;
uniform float uBloomAmt;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uVig;
uniform float uCA;
uniform float uGrain;
uniform float uLetter;
uniform float uFW;
uniform float uFB;
uniform float uUnder;
${NOISE}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV;
  uv += vec2(sin(uv.y*32.0 + uTime*1.7), cos(uv.x*26.0 - uTime*1.3))*0.0022*uUnder;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 caOff = cc*r2*uCA;
  vec3 col;
  col.r = texture(uScene, uv + caOff).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - caOff).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 ray = vec3(0.0);
  if(uRay > 0.002){
    vec2 sv = (uSunUV - uv)/24.0;
    vec2 p = uv;
    float wgt = 0.10;
    for(int i=0;i<24;i++){
      p += sv;
      ray += texture(uBloom, p).rgb*wgt;
      wgt *= 0.955;
    }
    ray *= uRay*1.9;
  }
  col += bloom*uBloomAmt + ray*vec3(1.05, 0.90, 0.68);

  col *= uExposure;
  col = aces(col);
  col = col*uGain + uLift*(1.0-col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col *= 1.0 - uVig*smoothstep(0.15, 0.85, r2*1.7);

  col = mix(col, col*vec3(0.58, 0.80, 1.00) + vec3(0.008, 0.028, 0.050), clamp(uUnder, 0.0, 1.0)*0.88);

  float g = (h21(uv*uRes*0.4 + fract(uTime*13.73)*61.7) - 0.5)*uGrain;
  col += g*(1.0 - l*0.55);

  float barH = uLetter*0.135;
  col *= smoothstep(barH - 0.0015, barH + 0.0015, min(uv.y, 1.0-uv.y));

  col = mix(col, vec3(1.05, 1.01, 0.95), clamp(uFW, 0.0, 1.0));
  col *= (1.0 - clamp(uFB, 0.0, 1.0));

  col += (h21(uv*uRes) - 0.5)/255.0;
  oC = vec4(col, 1.0);
}`;

const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 iP;
layout(location=1) in vec2 iUV;
layout(location=2) in vec4 iC;
out vec2 vUV;
out vec4 vC;
void main(){
  gl_Position = vec4(iP, 0.0, 1.0);
  vUV = iUV;
  vC = iC;
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vC;
out vec4 oC;
uniform sampler2D uT0;
void main(){ oC = texture(uT0, vUV)*vC; }`;

return { SKY_FS, SPRITE_VS, SPRITE_FS, WATER_FS, RAIN_FS, BRIGHT_FS, DOWN_FS, UP_FS, COMPOSITE_FS, PARTICLE_VS, PARTICLE_FS };
})();
