import { default as gulls } from '../../gulls.js'
import { default as Video    } from '../../helpers/video.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

await Video.init()

const back = new Float32Array( gulls.width * gulls.height * 4 )
const feedback_t = sg.texture( back ) 

const render = await sg.render({
  shader,
  data:[
    sg.uniform([ sg.width, sg.height ]),
    sg.sampler(),
    feedback_t,
    sg.video( Video.element )
  ],
  copy: feedback_t
})

sg.run( render )
