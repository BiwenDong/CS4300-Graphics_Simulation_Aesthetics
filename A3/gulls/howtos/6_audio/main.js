import { default as gulls } from '../../gulls.js'
import { default as Audio    } from '../../helpers/audio.js'

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

document.body.onclick = e => Audio.start()

const fft = sg.uniform( [0,0,0] )

const render = await sg.render({
  shader,
  data: [ fft ],
  onframe() { fft.value = [Audio.low, Audio.mid, Audio.high] }
})

sg.run( render )
