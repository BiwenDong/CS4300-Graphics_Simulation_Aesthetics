import { default as gulls } from '../../gulls.js'
import { default as Mouse    } from '../../helpers/mouse.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

Mouse.init()

const mouse_u = sg.uniform( [0,0,0] )

// four floats per pixel (rgba)
const back = new Float32Array( gulls.width * gulls.height * 4 )
const feedback_t = sg.texture( back ) 

const render = await sg.render({
  shader,

  data: [ 
    sg.uniform( [ window.innerWidth, window.innerHeight ] ), 
    mouse_u, 
    sg.sampler(), 
    feedback_t
  ],

  copy: feedback_t,

  onframe() { mouse_u.value = Mouse.values }
})

sg.run( render )
