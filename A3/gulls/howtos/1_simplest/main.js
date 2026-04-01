import { default as gulls } from '../../gulls.js'

const shader = gulls.constants.vertex + `
@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  return vec4f( 1.,0.,0. , 1. );
}`

const sg = await gulls.init()
      
const render = await sg.render({ shader })

sg.run( render )
