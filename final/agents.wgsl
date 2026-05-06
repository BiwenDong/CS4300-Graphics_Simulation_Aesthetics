struct Agent {
  pos:   vec2f,
  angle: f32,
  _pad:  f32,
}

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

fn hash(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u);
  x = x * 0x45d9f3bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}

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

  let rng = hash(i * 1234u + u32(uni.time * 3713.0));

  if (sC >= sL && sC >= sR) {
    ag.angle += (rng - 0.5) * 0.08;
  } else if (sL > sR) {
    ag.angle -= uni.turn_speed;
  } else if (sR > sL) {
    ag.angle += uni.turn_speed;
  } else {
    ag.angle += select(-uni.turn_speed, uni.turn_speed, rng > 0.5);
  }

  ag.pos += vec2f(cos(ag.angle), sin(ag.angle)) * uni.move_speed;

  let w = uni.tex_w;
  let h = uni.tex_h;
  if (ag.pos.x < 0.0)  { ag.pos.x += w; }
  if (ag.pos.x >= w)   { ag.pos.x -= w; }
  if (ag.pos.y < 0.0)  { ag.pos.y += h; }
  if (ag.pos.y >= h)   { ag.pos.y -= h; }

  let px  = u32(clamp(ag.pos.x, 0.0, w - 1.0));
  let py  = u32(clamp(ag.pos.y, 0.0, h - 1.0));
  atomicAdd(&deposit[py * u32(uni.tex_w) + px], 1u);

  agents[i] = ag;
}
