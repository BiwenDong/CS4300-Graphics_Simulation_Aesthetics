// Langton's Ants – compute shader
//
// Direction encoding:  0 = up, 1 = right, 2 = down, 3 = left
//
// Ant types:
//   0  Classic  – empty → turn CW  + stamp trail
//              – trail → turn CCW + erase trail
//   1  Reverse  – empty → turn CCW + stamp trail
//              – trail → turn CW  + erase trail
//   2  Builder  – empty → turn CW  + stamp trail
//              – trail → go straight, keep trail (builds denser structures)
//
// Grid cell values:
//   0 = empty
//   1 = classic pheromone
//   2 = reverse pheromone
//   3 = builder pheromone

struct Ant {
  x:        u32,
  y:        u32,
  dir:      u32,
  ant_type: u32,
}

struct Uniforms {
  grid_w:    u32,
  grid_h:    u32,
  ant_count: u32,
  _pad:      u32,
}

@group(0) @binding(0) var<storage, read_write> grid : array<u32>;
@group(0) @binding(1) var<storage, read_write> ants : array<Ant>;
@group(0) @binding(2) var<uniform>             uni  : Uniforms;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= uni.ant_count) { return; }

  var ant    = ants[i];
  let idx    = ant.y * uni.grid_w + ant.x;
  let cell   = grid[idx];
  let has_ph = (cell > 0u);

  var new_dir: u32;

  if (ant.ant_type == 0u) {
    // Classic Langton's Ant
    if (!has_ph) {
      new_dir   = (ant.dir + 1u) % 4u;   // turn right (CW)
      grid[idx] = 1u;
    } else {
      new_dir   = (ant.dir + 3u) % 4u;   // turn left (CCW)
      grid[idx] = 0u;
    }
  } else if (ant.ant_type == 1u) {
    // Reverse Ant
    if (!has_ph) {
      new_dir   = (ant.dir + 3u) % 4u;   // turn left (CCW)
      grid[idx] = 2u;
    } else {
      new_dir   = (ant.dir + 1u) % 4u;   // turn right (CW)
      grid[idx] = 0u;
    }
  } else {
    // Builder Ant
    if (!has_ph) {
      new_dir   = (ant.dir + 1u) % 4u;   // turn right (CW)
      grid[idx] = 3u;
    } else {
      new_dir = ant.dir;                  // go straight, trail persists
    }
  }

  // Move forward one cell
  ant.dir = new_dir;
  var nx = i32(ant.x);
  var ny = i32(ant.y);

  if      (new_dir == 0u) { ny -= 1; }
  else if (new_dir == 1u) { nx += 1; }
  else if (new_dir == 2u) { ny += 1; }
  else                    { nx -= 1; }

  // Wrap at edges
  let gw = i32(uni.grid_w);
  let gh = i32(uni.grid_h);
  nx = ((nx % gw) + gw) % gw;
  ny = ((ny % gh) + gh) % gh;

  ant.x   = u32(nx);
  ant.y   = u32(ny);
  ants[i] = ant;
}
