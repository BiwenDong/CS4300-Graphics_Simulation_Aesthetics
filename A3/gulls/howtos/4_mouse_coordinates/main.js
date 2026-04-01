import { default as gulls } from '../../gulls.js'
import { default as Mouse    } from '../../helpers/mouse.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

Mouse.init()

const mouse = sg.uniform( Mouse.values )

const render = await sg.render({
  shader,
  data: [ mouse ],
  onframe() { mouse.value = Mouse.values }
})

sg.run( render )
