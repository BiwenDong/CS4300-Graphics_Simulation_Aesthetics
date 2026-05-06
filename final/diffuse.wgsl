// Physarum Slime Mold – diffuse + decay compute shader
//
// For each texel:
//   1. Apply a 3×3 box blur to the incoming trail (diffusion)
//   2. Multiply by decay rate (evaporation)
//   3. Atomically read-and-clear the deposit counter, add scaled pheromone
//   4. Optionally inject a Gaussian beacon at the mouse cursor
//   5. Clamp to [0, 1] and write to the output trail texture

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

@group(0) @binding(0) var<storage, read_write> deposit:   array<atomic<u32>>;
@group(0) @binding(1) var<uniform>             uni:       Uniforms;
@group(0) @binding(2) var trail_in:  texture_2d<f32>;
@group(0) @binding(3) var trail_out: texture_storage_2d<r32float, write>;

// Toroidally-wrapped texel read
fn load(x: i32, y: i32) -> f32 {
  let w  = i32(uni.tex_w);
  let h  = i32(uni.tex_h);
  let cx = (x % w + w) % w;
  let cy = (y % h + h) % h;
  return textureLoad(trail_in, vec2i(cx, cy), 0).r;
}

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= i32(uni.tex_w) || y >= i32(uni.tex_h)) { return; }

  // 3×3 box blur (uniform weight)
  var blurred = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      blurred += load(x + dx, y + dy);
    }
  }
  blurred /= 9.0;

  // Read deposit count and atomically clear it for the next frame
  let idx = u32(y) * u32(uni.tex_w) + u32(x);
  let dep = f32(atomicExchange(&deposit[idx], 0u));

  // Each agent visit contributes ~0.04 so one heavily-visited cell saturates
  var val = blurred * uni.decay + dep * 0.04;

  // Mouse: inject a soft pheromone beacon to attract agents
  if (uni.mouse_active > 0.5) {
    let dx = f32(x) - uni.mouse_x;
    let dy = f32(y) - uni.mouse_y;
    val += 0.35 * exp(-(dx * dx + dy * dy) / 320.0);
  }

  textureStore(trail_out, vec2i(x, y), vec4f(clamp(val, 0.0, 1.0), 0.0, 0.0, 1.0));
}
