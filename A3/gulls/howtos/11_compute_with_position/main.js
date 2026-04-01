import { default as gulls } from '../../gulls.js'

const sg      = await gulls.init(),
      frag    = await gulls.import( './frag.wgsl' ),
      compute = await gulls.import( './compute.wgsl' ),
      render  = gulls.constants.vertex + frag,
      size    = window.innerWidth * window.innerHeight,
      state   = new Float32Array( size )

for( let i = 0; i < size; i++ ) {
  state[ i ] = Math.random()
}

const dispatch_size = Math.ceil( size / 64 )  
const statebuffer   = sg.buffer( state )

const renderPass = await sg.render({
  shader: render,
  data: [
    sg.uniform([ window.innerWidth, window.innerHeight ]),
    statebuffer
  ]
})

const computePass = sg.compute({
  shader: compute,
  data: [ statebuffer ],
  dispatchCount: [dispatch_size,1,1]
})

sg.run( computePass, renderPass )
