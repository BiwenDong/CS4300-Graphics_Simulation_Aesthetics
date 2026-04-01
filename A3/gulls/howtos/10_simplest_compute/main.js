import { default as gulls } from '../../gulls.js'

const sg      = await gulls.init(),
      frag    = await gulls.import( './frag.wgsl' ),
      compute = await gulls.import( './compute.wgsl' ),
      render  = gulls.constants.vertex + frag,
      state   = sg.buffer( new Float32Array([ 0 ]) )

const renderPass  = await sg.render({  shader:render,  data:[ state ] })
const computePass = sg.compute({ shader:compute, data:[ state ], dispatch:[1,1,1] }) 

sg.run( computePass, renderPass )
