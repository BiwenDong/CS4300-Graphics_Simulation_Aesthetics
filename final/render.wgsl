struct Uniforms {
  tex_w:     f32,
  tex_h:     f32,
  _a: f32, _b: f32, _c: f32, _d: f32,
  _e: f32, _f: f32, _g: f32, _h: f32,
  _i: f32, _j: f32,
  bloom_amt: f32,   // offset 12
  _k: f32, _l: f32, _m: f32,
}

@group(0) @binding(0) var trail_tex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uni: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0)       uv:  vec2f,
}

const QUAD = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  let p = QUAD[vid];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv  = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

fn load(px: vec2i) -> f32 {
  let cx = clamp(px.x, 0, i32(uni.tex_w) - 1);
  let cy = clamp(px.y, 0, i32(uni.tex_h) - 1);
  return textureLoad(trail_tex, vec2i(cx, cy), 0).r;
}

fn ring(px: vec2i, r: i32) -> f32 {
  var s = 0.0;
  s += load(px + vec2i(-r, -r));
  s += load(px + vec2i( 0, -r));
  s += load(px + vec2i( r, -r));
  s += load(px + vec2i(-r,  0));
  s += load(px + vec2i( r,  0));
  s += load(px + vec2i(-r,  r));
  s += load(px + vec2i( 0,  r));
  s += load(px + vec2i( r,  r));
  return s / 8.0;
}

fn palette(t: f32) -> vec3f {
  let c0 = vec3f(0.00, 0.00, 0.06);
  let c1 = vec3f(0.00, 0.78, 0.72);
  let c2 = vec3f(0.82, 1.00, 1.00);
  let t2 = clamp(t, 0.0, 1.0);
  if (t2 < 0.5) { return mix(c0, c1, t2 * 2.0); }
  return mix(c1, c2, (t2 - 0.5) * 2.0);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let px = vec2i(i32(in.uv.x * uni.tex_w), i32(in.uv.y * uni.tex_h));

  let direct = load(px);
  let b1     = ring(px,  4);
  let b2     = ring(px, 10);

  let t = clamp(direct + (b1 * 0.55 + b2 * 0.25) * uni.bloom_amt, 0.0, 1.0);
  return vec4f(palette(pow(t, 0.55)), 1.0);
}
