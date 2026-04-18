struct Particle {
  pos: vec2f,
  vel: vec2f,
  life: f32,
  maxLife: f32,
}

struct SimParams {
  time_dt: vec4f,

  emitter: vec4f,

  render: vec4f,
}

@group(0) @binding(0)
var<storage, read> particles: array<Particle>;

@group(0) @binding(1)
var<uniform> params: SimParams;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) localUV: vec2f,
  @location(1) lifeT: f32,
};

const QUAD_VERTS = array<vec2f, 6>(
  vec2f(-1.0, -1.0),
  vec2f( 1.0, -1.0),
  vec2f(-1.0,  1.0),

  vec2f(-1.0,  1.0),
  vec2f( 1.0, -1.0),
  vec2f( 1.0,  1.0),
);

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32
) -> VSOut {
  let p = particles[iid];
  let quad = QUAD_VERTS[vid];

  let aspect = params.render.y;
  let baseSize = params.render.x;

  let lifeT = clamp(p.life / max(p.maxLife, 0.0001), 0.0, 1.0);

  let sizeScale = 0.35 + lifeT * 0.85;
  var offset = quad * baseSize * sizeScale;

  offset.x = offset.x / aspect;

  let clipPos = p.pos + offset;

  var out: VSOut;
  out.position = vec4f(clipPos, 0.0, 1.0);
  out.localUV = quad;
  out.lifeT = lifeT;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let r = length(in.localUV);

  let soft = smoothstep(1.0, 0.0, r);
  let core = smoothstep(0.45, 0.0, r);

  let lifeGlow = 0.3 + in.lifeT * 0.7;

  let innerColor = vec3f(1.0, 0.95, 0.75);
  let outerColor = vec3f(1.0, 0.45, 0.10);

  let color = mix(outerColor, innerColor, core) * lifeGlow * params.render.w;
  let alpha = soft * in.lifeT;

  return vec4f(color, alpha);
}