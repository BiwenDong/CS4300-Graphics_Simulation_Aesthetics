// Physarum Slime Mold – agent compute shader
//
// Each agent stores: pos (vec2f), angle (f32), _pad (f32)
//
// Per step:
//   1. Sense pheromone in three directions (left, centre, right)
//   2. Turn toward the strongest signal
//   3. Move forward by move_speed pixels
//   4. Deposit 1 unit into the atomic deposit buffer at the new position
//
// Toroidal wrapping keeps agents inside the trail texture.

struct Agent {
  pos:   vec2f,
  angle: f32,
  _pad:  f32,
}

// Must match layout in main.js (16 × f32, 64 bytes)
struct Uniforms {
  tex_w:        f32,
  tex_h:        f32,
  agent_count:  f32,
  time:         f32,
  decay:        f32,
  sensor_angle: f32,
  sensor_dist:  f32,
  turn_speed:   f32,
  move_speed:   f32,
  mouse_x:      f32,
  mouse_y:      f32,
  mouse_active: f32,
  bloom_amt:    f32,
  _p0: f32, _p1: f32, _p2: f32,
}

@group(0) @binding(0) var<storage, read_write> agents:  array<Agent>;
@group(0) @binding(1) var<storage, read_write> deposit: array<atomic<u32>>;
@group(0) @binding(2) var<uniform>             uni:     Uniforms;
@group(0) @binding(3) var trail: texture_2d<f32>;

// Cheap hash for per-agent randomness that changes each frame
fn hash(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u);
  x = x * 0x45d9f3bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}

// Sample pheromone at the sense point in direction `angle`
fn sense(pos: vec2f, angle: f32) -> f32 {
  let sp = pos + vec2f(cos(angle), sin(angle)) * uni.sensor_dist;
  let cx = clamp(i32(sp.x), 0, i32(uni.tex_w) - 1);
  let cy = clamp(i32(sp.y), 0, i32(uni.tex_h) - 1);
  return textureLoad(trail, vec2i(cx, cy), 0).r;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(uni.agent_count)) { return; }

  var ag = agents[i];
  let sa = uni.sensor_angle;

  let sL = sense(ag.pos, ag.angle - sa);
  let sC = sense(ag.pos, ag.angle);
  let sR = sense(ag.pos, ag.angle + sa);

  // Cheap per-agent, per-frame random value
  let rng = hash(i * 1234u + u32(uni.time * 3713.0));

  if (sC >= sL && sC >= sR) {
    // Ahead is strongest: continue with tiny random wiggle to break symmetry
    ag.angle += (rng - 0.5) * 0.08;
  } else if (sL > sR) {
    ag.angle -= uni.turn_speed;
  } else if (sR > sL) {
    ag.angle += uni.turn_speed;
  } else {
    // Equal left / right: pick randomly
    ag.angle += select(-uni.turn_speed, uni.turn_speed, rng > 0.5);
  }

  // Move forward
  ag.pos += vec2f(cos(ag.angle), sin(ag.angle)) * uni.move_speed;

  // Toroidal wrap
  let w = uni.tex_w;
  let h = uni.tex_h;
  if (ag.pos.x < 0.0)  { ag.pos.x += w; }
  if (ag.pos.x >= w)   { ag.pos.x -= w; }
  if (ag.pos.y < 0.0)  { ag.pos.y += h; }
  if (ag.pos.y >= h)   { ag.pos.y -= h; }

  // Deposit one unit at the new position (atomic avoids lost writes)
  let px  = u32(clamp(ag.pos.x, 0.0, w - 1.0));
  let py  = u32(clamp(ag.pos.y, 0.0, h - 1.0));
  atomicAdd(&deposit[py * u32(uni.tex_w) + px], 1u);

  agents[i] = ag;
}
