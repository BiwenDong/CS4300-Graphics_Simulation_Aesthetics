import { default as gulls } from './gulls/gulls.js'
import { default as Video } from './gulls/helpers/video.js'

const sg = await gulls.init()
await Video.init()

let mouse       = [0.5, 0.5] 
let fbmStrength = 0.18
let rippleStr   = 0.5          
let mode        = 0
let tint        = 0.06
let mixAmount   = 0.10
let time        = 0

const panel = document.createElement('div')
Object.assign(panel.style, {
  position: 'absolute', top: '14px', left: '14px', zIndex: '10',
  display: 'flex', flexDirection: 'column', gap: '10px',
  padding: '14px', background: 'rgba(0,0,0,0.42)',
  backdropFilter: 'blur(8px)', borderRadius: '12px',
  color: '#e8e0d4', fontFamily: 'monospace', fontSize: '11px',
  userSelect: 'none', minWidth: '210px'
})
document.body.appendChild(panel)

function makeRow(labelText, min, max, step, initVal, onInput) {
  const wrap = document.createElement('label')
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '3px' })

  const top = document.createElement('div')
  Object.assign(top.style, { display: 'flex', justifyContent: 'space-between' })
  const lbl = document.createElement('span')
  lbl.textContent = labelText
  const val = document.createElement('span')
  val.textContent = initVal.toFixed(2)
  top.appendChild(lbl); top.appendChild(val)

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = min; slider.max = max; slider.step = step; slider.value = initVal
  Object.assign(slider.style, { width: '100%', accentColor: '#c8a96e' })
  slider.oninput = () => { const v = parseFloat(slider.value); val.textContent = v.toFixed(2); onInput(v, slider) }

  wrap.appendChild(top); wrap.appendChild(slider)
  return { wrap, slider, val }
}

const { wrap: wFbm }  = makeRow('distortion',  0,    0.5,  0.01, fbmStrength, v => { fbmStrength = v })
const { wrap: wMix }  = makeRow('video mix',   0.01, 0.35, 0.01, mixAmount,   v => { mixAmount   = v })
const { wrap: wTint, slider: sTint } = makeRow('tint', 0, 0.3, 0.01, tint,   v => { tint        = v })
panel.appendChild(wFbm); panel.appendChild(wMix); panel.appendChild(wTint)

const modeNames = ['fluid', 'glitch', 'void']
const modeEl = document.createElement('div')
Object.assign(modeEl.style, {
  marginTop: '2px', padding: '5px 8px',
  background: 'rgba(200,169,110,0.18)', borderRadius: '6px',
  textAlign: 'center', letterSpacing: '0.08em'
})
modeEl.textContent = `mode: ${modeNames[mode]}`
panel.appendChild(modeEl)

const rippleEl = document.createElement('div')
rippleEl.style.opacity = '0.65'
rippleEl.textContent = `ripple: ${rippleStr.toFixed(2)}`
panel.appendChild(rippleEl)

const hint = document.createElement('div')
hint.style.cssText = 'opacity:.5;line-height:1.65;margin-top:4px'
hint.innerHTML = 'mouse/touch → ripple origin<br>wheel → ripple strength<br>space / ← → → cycle mode<br>click → tint pulse'
panel.appendChild(hint)

window.addEventListener('mousemove', e => {
  mouse = [e.clientX / window.innerWidth, e.clientY / window.innerHeight]
})
window.addEventListener('touchmove', e => {
  if (e.touches.length > 0)
    mouse = [e.touches[0].clientX / window.innerWidth, e.touches[0].clientY / window.innerHeight]
}, { passive: true })

window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'ArrowRight') {
    mode = (mode + 1) % 3
    modeEl.textContent = `mode: ${modeNames[mode]}`
    e.preventDefault()
  } else if (e.key === 'ArrowLeft') {
    mode = (mode + 2) % 3
    modeEl.textContent = `mode: ${modeNames[mode]}`
    e.preventDefault()
  }
})

window.addEventListener('wheel', e => {
  rippleStr -= e.deltaY * 0.001
  rippleStr = Math.max(0, Math.min(1.0, rippleStr))
  rippleEl.textContent = `ripple: ${rippleStr.toFixed(2)}`
}, { passive: true })

window.addEventListener('click', () => {
  const prev = tint
  tint = Math.min(0.28, tint + 0.06)
  sTint.value = tint
  setTimeout(() => { tint = prev; sTint.value = tint }, 150)
})

const frag   = await gulls.import('./frag.wgsl')
const shader = gulls.constants.vertex + frag

const u_resolution = sg.uniform([sg.width, sg.height])
const u_mouse      = sg.uniform(mouse)
const u_params     = sg.uniform([fbmStrength, mode, tint, mixAmount])
const u_timeData   = sg.uniform([time, rippleStr])

const feedback_t = sg.texture(new Float32Array(sg.width * sg.height * 4))

const render = await sg.render({
  shader,
  data: [
    u_resolution,
    sg.sampler(),
    feedback_t,
    u_mouse,
    u_params,
    u_timeData,
    sg.video(Video.element)
  ],
  copy: feedback_t,
  onframe() {
    time += 0.01
    u_mouse.value    = mouse
    u_params.value   = [fbmStrength, mode, tint, mixAmount]
    u_timeData.value = [time, rippleStr]
  }
})

sg.run(render)
