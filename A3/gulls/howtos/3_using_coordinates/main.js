import { default as gulls } from '../../gulls.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

const res = sg.uniform( [window.innerWidth, window.innerHeight] )

const render = await sg.render({ shader, data:[ res ] })
  
sg.run( render )
