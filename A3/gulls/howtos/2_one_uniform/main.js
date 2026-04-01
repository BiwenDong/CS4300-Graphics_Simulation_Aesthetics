import { default as gulls } from '../../gulls.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

const frame = sg.uniform(0)

const render = await sg.render({
  shader,
  data: [ frame ],
  onframe() { frame.value++ }
})

sg.run( render )
