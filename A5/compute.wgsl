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
var<storage, read_write> particles: array<Particle>;

@group(0) @binding(1)
var<uniform> params: SimParams;

fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

fn rand1(seed: f32) -> f32 {
  return hash(seed);
}

fn rand2(seed: f32) -> vec2f {
  return vec2f(
    hash(seed * 12.9898 + 78.233),
    hash(seed * 39.3468 + 11.135)
  );
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;

  if (i >= arrayLength(&particles)) {
    return;
  }

  var p = particles[i];

  let time = params.time_dt.x;
  let dt = params.time_dt.y;
  let drag = params.time_dt.z;
  let respawnToggle = params.time_dt.w;

  let emitterPos = params.emitter.xy;
  let baseSpeed = params.emitter.z;
  let spread = params.emitter.w;
  let gravity = params.render.z;

  p.life = p.life - dt;

  if (p.life <= 0.0 || respawnToggle > 0.5) {
    let seed = f32(i) + time * 17.0;

    let r = rand2(seed);
    let angle = (r.x - 0.5) * spread;

    let dir = normalize(vec2f(sin(angle), cos(angle)));
    let speed = baseSpeed * (0.5 + 0.9 * r.y);

    p.pos = emitterPos + vec2f(
      (rand1(seed + 3.1) - 0.5) * 0.03,
      (rand1(seed + 8.7) - 0.5) * 0.03
    );

    p.vel = dir * speed;
    p.life = 1.0 + rand1(seed + 5.3) * 1.5;
    p.maxLife = p.life;
  } else {
    p.vel.y = p.vel.y - gravity * dt;

    p.vel = p.vel * max(0.0, 1.0 - drag * dt);

    p.pos = p.pos + p.vel * dt;

    if (abs(p.pos.x) > 1.2 || abs(p.pos.y) > 1.2) {
      p.life = -1.0;
    }
  }

  particles[i] = p;
}