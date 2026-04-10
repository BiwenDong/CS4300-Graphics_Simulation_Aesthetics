import { Pane } from "https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js";

const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

context.configure({ device, format });

const size = canvas.width * canvas.height * 2;
let state = new Float32Array(size);

for(let y=0;y<canvas.height;y++){
  for(let x=0;x<canvas.width;x++){
    let i=(y*canvas.width+x)*2;
    state[i]=1.0;
    state[i+1]=0.0;
    if(Math.random()<0.02){
      state[i]=0.0;
      state[i+1]=1.0;
    }
  }
}

const stateA = device.createBuffer({
  size: state.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const stateB = device.createBuffer({
  size: state.byteLength,
  usage: GPUBufferUsage.STORAGE,
});
device.queue.writeBuffer(stateA, 0, state);

const resBuffer = device.createBuffer({
  size: 8,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(resBuffer, 0, new Float32Array([canvas.width, canvas.height]));

const paramBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const mouseBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const styleMapBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let flip = false;

const params = { feed:0.036, kill:0.065, diffA:1.0, diffB:0.5 };
const styleMap = { feedOffTop:-0.045, feedOffBottom:0.045, killOffLeft:-0.0125, killOffRight:0.0125 };
const derived  = { feedTop:0, feedBottom:0, killLeft:0, killRight:0 };

const pane = new Pane();
pane.addBinding(params,"feed",  {min:0,   max:0.1, label:"feed"});
pane.addBinding(params,"kill",  {min:0,   max:0.1, label:"kill"});
pane.addBinding(params,"diffA", {min:0,   max:2,   label:"diffA"});
pane.addBinding(params,"diffB", {min:0,   max:2,   label:"diffB"});

const smf = pane.addFolder({title:"Style Map"});
smf.addBinding(styleMap,"feedOffTop",    {min:-0.05, max:0.05, label:"Feed Offset Top"});
smf.addBinding(styleMap,"feedOffBottom", {min:-0.05, max:0.05, label:"Feed Offset Bottom"});
smf.addBinding(styleMap,"killOffLeft",   {min:-0.02, max:0.02, label:"Kill Offset Left"});
smf.addBinding(styleMap,"killOffRight",  {min:-0.02, max:0.02, label:"Kill Offset Right"});
smf.addBlade({view:"separator"});
smf.addBinding(derived,"feedTop",    {readonly:true, label:"Feed at top"});
smf.addBinding(derived,"feedBottom", {readonly:true, label:"Feed at bottom"});
smf.addBinding(derived,"killLeft",   {readonly:true, label:"Kill at left"});
smf.addBinding(derived,"killRight",  {readonly:true, label:"Kill at right"});

let mouse=[0,0,0];
canvas.onmousedown=()=>mouse[2]=1;
canvas.onmouseup=()=>mouse[2]=0;
canvas.onmousemove=e=>{ mouse[0]=e.offsetX; mouse[1]=e.offsetY; };

const computeCode = await fetch("compute.wgsl").then(r=>r.text());
const fragCode    = await fetch("frag.wgsl").then(r=>r.text());

const computeModule = device.createShaderModule({ code: computeCode });
const fragModule    = device.createShaderModule({ code: fragCode });

const vertModule = device.createShaderModule({ code: `
@vertex fn vs(@builtin(vertex_index) vi:u32) -> @builtin(position) vec4f {
  var p = array<vec2f,6>(
    vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),
    vec2f(-1,1), vec2f(1,-1),vec2f(1,1)
  );
  return vec4f(p[vi],0.0,1.0);
}
`});

const computePipeline = device.createComputePipeline({
  layout: "auto",
  compute: { module: computeModule, entryPoint: "cs" }
});

const renderPipeline = device.createRenderPipeline({
  layout: "auto",
  vertex:   { module: vertModule, entryPoint: "vs" },
  fragment: { module: fragModule, entryPoint: "fs", targets: [{ format }] }
});

function frame(){
  device.queue.writeBuffer(paramBuffer, 0,
    new Float32Array([params.feed, params.kill, params.diffA, params.diffB]));
  device.queue.writeBuffer(mouseBuffer, 0, new Float32Array(mouse));
  device.queue.writeBuffer(styleMapBuffer, 0,
    new Float32Array([styleMap.feedOffTop, styleMap.feedOffBottom, styleMap.killOffLeft, styleMap.killOffRight]));

  // update derived display
  derived.feedTop    = +(params.feed + styleMap.feedOffTop).toFixed(4);
  derived.feedBottom = +(params.feed + styleMap.feedOffBottom).toFixed(4);
  derived.killLeft   = +(params.kill + styleMap.killOffLeft).toFixed(4);
  derived.killRight  = +(params.kill + styleMap.killOffRight).toFixed(4);
  pane.refresh();

  const encoder = device.createCommandEncoder();

  for(let step=0;step<10;step++){
    const cp = encoder.beginComputePass();
    cp.setPipeline(computePipeline);
    cp.setBindGroup(0, device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries:[
        {binding:0, resource:{buffer:resBuffer}},
        {binding:1, resource:{buffer:flip?stateB:stateA}},
        {binding:2, resource:{buffer:flip?stateA:stateB}},
        {binding:3, resource:{buffer:paramBuffer}},
        {binding:4, resource:{buffer:mouseBuffer}},
        {binding:5, resource:{buffer:styleMapBuffer}}
      ]
    }));
    cp.dispatchWorkgroups(Math.ceil(canvas.width/8), Math.ceil(canvas.height/8));
    cp.end();
    flip=!flip;
  }

  const rp = encoder.beginRenderPass({
    colorAttachments:[{
      view: context.getCurrentTexture().createView(),
      clearValue: {r:0,g:0,b:0,a:1},
      loadOp: "clear",
      storeOp: "store"
    }]
  });
  rp.setPipeline(renderPipeline);
  rp.setBindGroup(0, device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries:[
      {binding:0, resource:{buffer:flip?stateA:stateB}},
      {binding:1, resource:{buffer:resBuffer}}
    ]
  }));
  rp.draw(6);
  rp.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

frame();
