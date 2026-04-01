import { default as gulls } from '../../gulls.js'

const W = window.innerWidth, H = window.innerHeight

const render_shader = gulls.constants.vertex + `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let p = pos.xy / vec2f(${W}., ${H}.);

  let fb = textureSample( tex, smp, p );

  return fb; 
}`


const NUM_PROPERTIES = 4
const tex = new Uint8Array( W*H*NUM_PROPERTIES ) 

for( let i = 0; i < W * H * NUM_PROPERTIES; i+= NUM_PROPERTIES ) {
  tex[ i ]   = Math.random() * 255
  tex[ i+1 ] = Math.random() * 255 
  tex[ i+2 ] = Math.random() * 255
  tex[ i+3 ] = 255
}

const sg = await gulls.init()

sg.run( 
  await sg.render({ 
    shader:render_shader, 
    data:[ sg.sampler(), sg.texture( tex ) ] 
  }) 
)
