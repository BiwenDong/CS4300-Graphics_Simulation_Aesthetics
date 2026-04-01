@group(0) @binding(0) var<uniform> resolution: vec2f;
@group(0) @binding(1) var videoSampler:   sampler;
@group(1) @binding(2) var videoBuffer:    texture_2d<f32>;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let p = pos.xy / resolution;

  /*let video = textureSampleBaseClampToEdge( videoBuffer, videoSampler, p );*/
  let video = textureSample( videoBuffer, videoSampler, p );


  /*let out = video;*/

  return video;//vec4f(1.0,0.0,0.0,1.0);
}

