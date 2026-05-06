// Langton's Ants – vertex + fragment shader
//
// Renders a full-screen quad.  The fragment shader maps each pixel to a grid
// cell, reads the pheromone value, and also checks whether an ant occupies
// that cell so it can be drawn on top.

struct Uniforms {
  grid_w:    u32,
  grid_h:    u32,
  ant_count: u32,
  _pad:      u32,
}

struct Ant {
  x:        u32,
  y:        u32,
  dir:      u32,
  ant_type: u32,
}

@group(0) @binding(0) var<storage, read> grid : array<u32>;
@group(0) @binding(1) var<storage, read> ants : array<Ant>;
@group(0) @binding(2) var<uniform>       uni  : Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0)       uv:  vec2f,
}

// Six vertices form two triangles covering clip space [-1,1]².
const QUAD = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  let p = QUAD[vid];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  // UV: x from left→right, y from top→bottom (matches grid row order)
  out.uv  = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let gx = min(u32(in.uv.x * f32(uni.grid_w)), uni.grid_w - 1u);
  let gy = min(u32(in.uv.y * f32(uni.grid_h)), uni.grid_h - 1u);

  // Draw ants on top of trail
  for (var a = 0u; a < uni.ant_count; a++) {
    if (ants[a].x == gx && ants[a].y == gy) {
      let t = ants[a].ant_type;
      if      (t == 0u) { return vec4f(1.00, 0.25, 0.25, 1.0); }  // red   – classic
      else if (t == 1u) { return vec4f(0.25, 1.00, 0.35, 1.0); }  // green – reverse
      else              { return vec4f(0.45, 0.70, 1.00, 1.0); }  // blue  – builder
    }
  }

  // Draw pheromone trail
  let cell = grid[gy * uni.grid_w + gx];
  if      (cell == 1u) { return vec4f(0.00, 0.85, 0.80, 1.0); }  // cyan   – classic
  else if (cell == 2u) { return vec4f(0.75, 0.25, 1.00, 1.0); }  // violet – reverse
  else if (cell == 3u) { return vec4f(1.00, 0.70, 0.10, 1.0); }  // amber  – builder

  // Background
  return vec4f(0.04, 0.04, 0.10, 1.0);
}
