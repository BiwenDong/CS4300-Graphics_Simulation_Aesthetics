@group(0) @binding(0) var<storage> state: array<f32>;
@group(0) @binding(1) var<uniform> res: vec2f;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let x = i32(pos.x);
  let y = i32(pos.y);
  let i = u32((y * i32(res.x) + x) * 2);

  let b = state[i+1u];

  return vec4f(b, b*0.5, 1.0-b, 1.0);
}