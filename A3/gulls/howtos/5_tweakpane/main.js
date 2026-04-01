import { default as gulls } from '../../gulls.js'
import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

const params = { background: { r:0, g:0, b:0  } }
const pane   = new Pane()

// Object.values() creates an array out all the values
// in a javascript dictionary and ignores the keys
const color = sg.uniform( Object.values( params.background ) )
const speed = sg.uniform( 20 )
const res = sg.uniform( [window.innerWidth, window.innerHeight] )

pane
  .addBinding( params, 'background', { color: { type:'float' } })
  .on( 'change', v => color.value = Object.values( params.background ) )

pane.addBinding( speed, 'value', { min:4, max:100, label:'frequency' })

const render = await sg.render({
  shader,
  data: [ color, speed, res ]
})

sg.run( render )
