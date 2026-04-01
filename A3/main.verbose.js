import { default as gulls } from '../../gulls.js'
import { default as Video } from '../../helpers/video.js'

const shader = `${gulls.constants.vertex}

@group(0) @binding(0) var<uniform> resolution: vec2f;
@group(0) @binding(1) var<uniform> mouse: vec2f;
@group(0) @binding(2) var<uniform> strength: f32;

@group(0) @binding(3) var backSampler: sampler;
@group(0) @binding(4) var backBuffer: texture_2d<f32>;
@group(0) @binding(5) var videoSampler: sampler;

@group(1) @binding(0) var videoBuffer: texture_external;

// ===== noise =====
fn random(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898,78.233))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = random(i);
  let b = random(i + vec2f(1.0, 0.0));
  let c = random(i + vec2f(0.0, 1.0));
  let d = random(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) +
         (c - a)* u.y * (1.0 - u.x) +
         (d - b)* u.x * u.y;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = pos.xy / resolution;

  // ===== distortion =====
  let dist = distance(p, mouse);
  let ripple = sin(dist * 20.0) * 0.02 * strength;

  let n = noise(p * 10.0) * 0.03 * strength;

  let uv = p + vec2f(ripple + n, ripple - n);

  let video = textureSampleBaseClampToEdge(videoBuffer, videoSampler, uv);
  let fb = textureSample(backBuffer, backSampler, p);

  let out = video * 0.2 + fb * 0.8;

  return vec4f(out.rgb, 1.0);
}`

const sg = await gulls.init()
await Video.init()

let mouse = [0.5, 0.5]
let strength = 0.3

window.addEventListener('mousemove', (e) => {
  mouse = [e.clientX / window.innerWidth, e.clientY / window.innerHeight]
})

const slider = document.createElement('input')
slider.type = 'range'
slider.min = 0
slider.max = 1
slider.step = 0.01
slider.value = strength
slider.style.position = 'absolute'
slider.style.top = '20px'
slider.style.left = '20px'
document.body.appendChild(slider)

slider.oninput = () => {
  strength = parseFloat(slider.value)
}

const resolution = [window.innerWidth, window.innerHeight]

sg
  .uniforms({
    resolution,
    mouse,
    strength
  })
  .textures([ Video.element ])
  .render(shader)
  .run()