@group(0) @binding(0) var<uniform> color : vec3f;
@group(0) @binding(1) var<uniform> speed : f32;
@group(0) @binding(2) var<uniform> res   : vec2f;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  var p = pos.xy / res;
  p.x += sin( p.y * speed );
  return vec4f( color+p.x, 1. );
}
