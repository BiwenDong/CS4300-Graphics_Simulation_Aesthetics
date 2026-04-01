
@group(0) @binding(0) var<uniform> resolution : vec2f;
@group(0) @binding(1) var smp                 : sampler;
@group(0) @binding(2) var backBuffer          : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mouse      : vec2f;
@group(0) @binding(4) var<uniform> params     : vec4f;

@group(0) @binding(5) var<uniform> timeData   : vec2f;

@group(1) @binding(0) var videoBuffer         : texture_external;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);          
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let rx = vec2f( 0.7986, -0.6020);
  let ry = vec2f( 0.6020,  0.7986);

  v += a * vnoise(p); p = vec2f(dot(p, rx), dot(p, ry)) * 2.1 + vec2f( 5.2,  1.3); a *= 0.5;
  v += a * vnoise(p); p = vec2f(dot(p, rx), dot(p, ry)) * 2.1 + vec2f( 1.7,  9.2); a *= 0.5;
  v += a * vnoise(p); p = vec2f(dot(p, rx), dot(p, ry)) * 2.1 + vec2f( 8.3,  2.8); a *= 0.5;
  v += a * vnoise(p);
  return v;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {

  let uv0       = pos.xy / resolution;
  let t         = timeData.x;
  let rippleStr = timeData.y;
  let fbmStr    = params.x;
  let mode      = params.y;
  let tint      = params.z;
  let mixAmt    = params.w;

  let n1 = fbm(uv0 * 5.5 + vec2f( t * 0.21, -t * 0.14));
  let n2 = fbm(uv0.yx * 4.9 + vec2f(-t * 0.13,  t * 0.18));

  var uv = uv0 + vec2f(n1 - 0.5, n2 - 0.5) * fbmStr;

  let toMouse   = uv0 - mouse;
  let dist      = length(toMouse);
  let ripple    = sin(dist * 22.0 - t * 5.5) * rippleStr * exp(-dist * 5.0);

  let rippleDir = normalize(toMouse + vec2f(0.0001, 0.0001));
  uv += rippleDir * ripple * 0.06;

  let video = textureSampleBaseClampToEdge(videoBuffer, smp, uv);

  let fb    = textureSample(backBuffer, smp, uv0);
  var color = mix(fb.rgb * 0.981, video.rgb, mixAmt);

  color += vec3f(tint * 0.85, tint * 0.28, -tint * 0.55);

  if (mode > 0.5 && mode < 1.5) {
    color = vec3f(color.b, color.r * 0.55, color.g + color.b * 0.28);
    let scan = 0.5 + 0.5 * sin(uv0.y * resolution.y * 0.6);
    color *= (0.88 + 0.12 * scan);
    color += vec3f(0.0, 0.03, tint * 1.4);
    let streak = step(0.97, fract(n1 * 7.3 + t * 0.6));
    color = mix(color, 1.0 - color, streak * 0.6);
  }

  if (mode >= 1.5) {
    let inv  = 1.0 - color;
    let luma = dot(inv, vec3f(0.2126, 0.7152, 0.0722));
    let post = floor(luma * 5.0) / 5.0;
    color    = mix(inv, vec3f(post), 0.68);
    color += vec3f(0.02, 0.0, 0.05) * (1.0 - luma);
  }

  let c      = uv0 - 0.5;
  let vig    = 1.0 - dot(c, c) * 1.25;
  color     *= max(vig, 0.0);

  return vec4f(color, 1.0);
}
