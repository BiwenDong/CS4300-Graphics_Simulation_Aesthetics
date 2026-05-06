// Physarum Slime Mold – main.js
//
// Two WebGPU explorations:
//   1) New simulation  – Physarum polycephalum (slime mold) agent model
//   2) Visual effects  – multi-tap bloom / glow post-processing in the render shader
//
// Pipeline per frame:
//   a) Compute: sense-turn-move agents, deposit pheromone into atomic buffer
//   b) Compute: 3×3 blur + decay of trail texture (ping-pong), consume deposits
//   c) Render:  full-screen quad with bioluminescent palette + bloom sampling

const TRAIL_W     = 512;
const TRAIL_H     = 512;
const AGENT_COUNT = 80_000;
const UNI_FLOATS  = 16;           // size of the uniform block in f32s

async function init() {
  if (!navigator.gpu) { alert("WebGPU is not supported in this browser."); return; }

  const canvas  = document.querySelector("canvas");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { alert("Failed to get GPU adapter."); return; }

  const device  = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format  = navigator.gpu.getPreferredCanvasFormat();

  function resizeCanvas() {
    const dpr    = window.devicePixelRatio || 1;
    const rect   = canvas.getBoundingClientRect();
    const width  = Math.max(1, Math.floor(rect.width  * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width  = width;
      canvas.height = height;
    }
  }
  resizeCanvas();
  context.configure({ device, format, alphaMode: "premultiplied" });

  // ── Load shaders ───────────────────────────────────────────────────────────
  const [agentCode, diffuseCode, renderCode] = await Promise.all([
    fetch("agents.wgsl").then(r => r.text()),
    fetch("diffuse.wgsl").then(r => r.text()),
    fetch("render.wgsl").then(r => r.text()),
  ]);
  const agentModule   = device.createShaderModule({ code: agentCode   });
  const diffuseModule = device.createShaderModule({ code: diffuseCode });
  const renderModule  = device.createShaderModule({ code: renderCode  });

  // ── Trail textures (ping-pong A / B) ──────────────────────────────────────
  // r32float: supports storage-texture write-only + texture_2d read via textureLoad
  const trail = [0, 1].map(() =>
    device.createTexture({
      size:   [TRAIL_W, TRAIL_H],
      format: "r32float",
      usage:  GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.STORAGE_BINDING |
              GPUTextureUsage.COPY_DST,
    })
  );

  const clearTrail = () => {
    const zeros = new Float32Array(TRAIL_W * TRAIL_H);
    for (const tex of trail) {
      device.queue.writeTexture(
        { texture: tex },
        zeros,
        { bytesPerRow: TRAIL_W * 4 },
        [TRAIL_W, TRAIL_H]
      );
    }
  };
  clearTrail();

  // ── Buffers ────────────────────────────────────────────────────────────────
  // Agents: pos (vec2f) + angle (f32) + _pad (f32) = 16 bytes each
  const agentBuffer = device.createBuffer({
    size:  AGENT_COUNT * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Deposit: one atomic<u32> per trail texel
  const depositBuffer = device.createBuffer({
    size:  TRAIL_W * TRAIL_H * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Uniforms: 16 × f32 = 64 bytes
  const uniformBuffer = device.createBuffer({
    size:  UNI_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Agent initialisation ───────────────────────────────────────────────────
  function initAgents() {
    const data = new Float32Array(AGENT_COUNT * 4);
    for (let i = 0; i < AGENT_COUNT; i++) {
      const b = i * 4;
      // Place agents in a ring around the centre, facing inward
      const t = (i / AGENT_COUNT) * Math.PI * 2;
      const r = 80 + Math.random() * 60;
      data[b + 0] = TRAIL_W / 2 + Math.cos(t) * r;  // pos.x
      data[b + 1] = TRAIL_H / 2 + Math.sin(t) * r;  // pos.y
      data[b + 2] = t + Math.PI;                     // angle (face inward)
      data[b + 3] = 0;                               // _pad
    }
    device.queue.writeBuffer(agentBuffer, 0, data);
    device.queue.writeBuffer(depositBuffer, 0, new Uint32Array(TRAIL_W * TRAIL_H));
    clearTrail();
  }
  initAgents();

  // ── Bind-group layouts ─────────────────────────────────────────────────────
  const agentBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer:  { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer:  { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer:  { type: "uniform" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
    ],
  });

  const diffuseBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer:         { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer:         { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture:        { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "r32float", viewDimension: "2d" } },
    ],
  });

  const renderBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer:  { type: "uniform" } },
    ],
  });

  // ── Pipelines ──────────────────────────────────────────────────────────────
  const agentPipeline = device.createComputePipeline({
    layout:  device.createPipelineLayout({ bindGroupLayouts: [agentBGL]   }),
    compute: { module: agentModule,   entryPoint: "cs_main" },
  });

  const diffusePipeline = device.createComputePipeline({
    layout:  device.createPipelineLayout({ bindGroupLayouts: [diffuseBGL] }),
    compute: { module: diffuseModule, entryPoint: "cs_main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout:    device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
    vertex:    { module: renderModule, entryPoint: "vs_main" },
    fragment:  { module: renderModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // ── Bind groups (two sets for ping-pong) ───────────────────────────────────
  // pingPong = p:
  //   agents   read  trail[p]
  //   diffuse  read  trail[p]  →  write trail[1-p]
  //   render   read  trail[1-p]  (the freshly-written one)

  const agentBG = [0, 1].map(p =>
    device.createBindGroup({
      layout:  agentBGL,
      entries: [
        { binding: 0, resource: { buffer: agentBuffer   } },
        { binding: 1, resource: { buffer: depositBuffer } },
        { binding: 2, resource: { buffer: uniformBuffer } },
        { binding: 3, resource: trail[p].createView()    },
      ],
    })
  );

  const diffuseBG = [0, 1].map(p =>
    device.createBindGroup({
      layout:  diffuseBGL,
      entries: [
        { binding: 0, resource: { buffer: depositBuffer }   },
        { binding: 1, resource: { buffer: uniformBuffer }   },
        { binding: 2, resource: trail[p].createView()       },
        { binding: 3, resource: trail[1 - p].createView()   },
      ],
    })
  );

  const renderBG = [0, 1].map(p =>
    device.createBindGroup({
      layout:  renderBGL,
      entries: [
        { binding: 0, resource: trail[1 - p].createView() },
        { binding: 1, resource: { buffer: uniformBuffer }  },
      ],
    })
  );

  // ── Mouse tracking ─────────────────────────────────────────────────────────
  let mouseX = -1, mouseY = -1, mouseDown = false;

  function updateMouse(e, down) {
    mouseDown = down;
    if (!down) { mouseX = -1; mouseY = -1; return; }
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width)  * TRAIL_W;
    mouseY = ((e.clientY - rect.top)  / rect.height) * TRAIL_H;
  }

  canvas.addEventListener("mousedown",  e => updateMouse(e, true));
  canvas.addEventListener("mousemove",  e => { if (mouseDown) updateMouse(e, true); });
  canvas.addEventListener("mouseup",    e => updateMouse(e, false));
  canvas.addEventListener("mouseleave", e => updateMouse(e, false));

  // ── UI ─────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const getF = id => parseFloat($(id).value);

  const sliders = [
    ["decaySlider",      "decayVal",      v => v.toFixed(3)],
    ["sensorAngSlider",  "sensorAngVal",  v => v.toFixed(0)],
    ["sensorDistSlider", "sensorDistVal", v => v.toFixed(0)],
    ["turnSpeedSlider",  "turnSpeedVal",  v => v.toFixed(2)],
    ["moveSpeedSlider",  "moveSpeedVal",  v => v.toFixed(1)],
    ["bloomSlider",      "bloomVal",      v => v.toFixed(1)],
  ];
  for (const [sid, vid, fmt] of sliders) {
    $(sid).addEventListener("input", () => { $(vid).textContent = fmt(getF(sid)); });
  }

  $("resetBtn").addEventListener("click", initAgents);

  // ── Frame loop ─────────────────────────────────────────────────────────────
  let pingPong  = 0;
  const t0      = performance.now();

  function frame() {
    resizeCanvas();

    const time  = (performance.now() - t0) * 0.001;
    const decay       = getF("decaySlider");
    const sensorAngle = getF("sensorAngSlider") * (Math.PI / 180);
    const sensorDist  = getF("sensorDistSlider");
    const turnSpeed   = getF("turnSpeedSlider");
    const moveSpeed   = getF("moveSpeedSlider");
    const bloomAmt    = getF("bloomSlider");

    // Layout must exactly match struct Uniforms in all shaders (16 × f32)
    device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
      TRAIL_W, TRAIL_H, AGENT_COUNT, time,
      decay, sensorAngle, sensorDist, turnSpeed,
      moveSpeed, mouseX, mouseY, (mouseDown ? 1.0 : 0.0),
      bloomAmt, 0, 0, 0,
    ]));

    const encoder = device.createCommandEncoder();

    // 1) Agent sense-turn-move + deposit
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(agentPipeline);
      pass.setBindGroup(0, agentBG[pingPong]);
      pass.dispatchWorkgroups(Math.ceil(AGENT_COUNT / 64));
      pass.end();
    }

    // 2) Diffuse + decay trail (reads trail[pp] → writes trail[1-pp])
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(diffusePipeline);
      pass.setBindGroup(0, diffuseBG[pingPong]);
      pass.dispatchWorkgroups(Math.ceil(TRAIL_W / 8), Math.ceil(TRAIL_H / 8));
      pass.end();
    }

    // 3) Render trail[1-pp] with bloom
    {
      const view = context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view,
          clearValue: { r: 0.02, g: 0.02, b: 0.06, a: 1 },
          loadOp:     "clear",
          storeOp:    "store",
        }],
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBG[pingPong]);
      pass.draw(6);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
    pingPong ^= 1;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch(err => console.error("Initialization failed:", err));
