import { default as gulls } from '../../gulls.js'
import { default as Video    } from '../../helpers/video.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

await Video.init()

console.log( Video.element )

const render = sg.render({
  shader,
  data:[
    sg.uniform([ sg.width, sg.height ]),
    sg.sampler(),
    sg.video( Video.element )
  ]
})

sg.run( render )
