// Langton's Ants – main.js
// Grid: 256 × 256 u32 storage buffer (0 = empty, 1/2/3 = pheromone by type)
// Ants: up to MAX_ANTS, each stored as 4 × u32 {x, y, dir, type}

const GRID_W   = 256;
const GRID_H   = 256;
const MAX_ANTS = 16;

async function init() {
  if (!navigator.gpu) {
    alert("WebGPU is not supported in this browser.");
    return;
  }

  const canvas = document.querySelector("canvas");
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

  // ── Load shaders ────────────────────────────────────────────────────────────
  const [computeCode, renderCode] = await Promise.all([
    fetch("compute.wgsl").then(r => r.text()),
    fetch("frag.wgsl").then(r => r.text()),
  ]);
  const computeModule = device.createShaderModule({ code: computeCode });
  const renderModule  = device.createShaderModule({ code: renderCode  });

  // ── Buffers ─────────────────────────────────────────────────────────────────
  // Grid: GRID_W × GRID_H u32 values
  const gridBuffer = device.createBuffer({
    size:  GRID_W * GRID_H * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Ants: MAX_ANTS × 4 u32s  (x, y, dir, type)  = 16 bytes per ant
  const antBuffer = device.createBuffer({
    size:  MAX_ANTS * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Uniforms: grid_w, grid_h, ant_count, _pad
  const uniformBuffer = device.createBuffer({
    size:  16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Bind group layouts ───────────────────────────────────────────────────────
  const computeBGLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage"           } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage"           } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform"           } },
    ],
  });

  const renderBGLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform"           } },
    ],
  });

  // ── Bind groups ──────────────────────────────────────────────────────────────
  const computeBG = device.createBindGroup({
    layout:  computeBGLayout,
    entries: [
      { binding: 0, resource: { buffer: gridBuffer    } },
      { binding: 1, resource: { buffer: antBuffer     } },
      { binding: 2, resource: { buffer: uniformBuffer } },
    ],
  });

  const renderBG = device.createBindGroup({
    layout:  renderBGLayout,
    entries: [
      { binding: 0, resource: { buffer: gridBuffer    } },
      { binding: 1, resource: { buffer: antBuffer     } },
      { binding: 2, resource: { buffer: uniformBuffer } },
    ],
  });

  // ── Pipelines ────────────────────────────────────────────────────────────────
  const computePipeline = device.createComputePipeline({
    layout:  device.createPipelineLayout({ bindGroupLayouts: [computeBGLayout] }),
    compute: { module: computeModule, entryPoint: "cs_main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout:   device.createPipelineLayout({ bindGroupLayouts: [renderBGLayout] }),
    vertex:   { module: renderModule, entryPoint: "vs_main" },
    fragment: { module: renderModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // ── UI ───────────────────────────────────────────────────────────────────────
  const resetBtn       = document.getElementById("resetBtn");
  const speedSlider    = document.getElementById("speedSlider");
  const speedVal       = document.getElementById("speedVal");
  const antCountSlider = document.getElementById("antCountSlider");
  const antCountVal    = document.getElementById("antCountVal");
  const stepCountEl    = document.getElementById("stepCount");

  speedSlider.addEventListener("input", () => {
    speedVal.textContent = speedSlider.value;
  });
  antCountSlider.addEventListener("input", () => {
    antCountVal.textContent = antCountSlider.value;
  });

  let stepCount = 0;
  let antCount  = parseInt(antCountSlider.value);

  function reset() {
    antCount  = parseInt(antCountSlider.value);
    stepCount = 0;

    // Clear grid
    device.queue.writeBuffer(gridBuffer, 0, new Uint32Array(GRID_W * GRID_H));

    // Place ants symmetrically around center, each with a unique direction
    const antData = new Uint32Array(MAX_ANTS * 4);
    const cx      = Math.floor(GRID_W / 2);
    const cy      = Math.floor(GRID_H / 2);
    const spacing = 16;

    for (let i = 0; i < antCount; i++) {
      const base   = i * 4;
      const offset = i - Math.floor(antCount / 2);
      const x      = Math.max(0, Math.min(GRID_W - 1, cx + offset * spacing));
      antData[base + 0] = x;
      antData[base + 1] = cy;
      antData[base + 2] = i % 4;   // direction spread: 0=up 1=right 2=down 3=left
      antData[base + 3] = i % 3;   // type cycling: 0=classic 1=reverse 2=builder
    }
    device.queue.writeBuffer(antBuffer, 0, antData);

    // Update uniforms
    device.queue.writeBuffer(
      uniformBuffer, 0,
      new Uint32Array([GRID_W, GRID_H, antCount, 0])
    );
  }

  resetBtn.addEventListener("click", reset);
  reset(); // initial state

  // ── Frame loop ───────────────────────────────────────────────────────────────
  function frame() {
    resizeCanvas();

    const steps = parseInt(speedSlider.value);
    stepCount  += steps;
    stepCountEl.textContent = `Steps: ${stepCount.toLocaleString()}`;

    const encoder = device.createCommandEncoder();

    // Run N compute steps per frame
    for (let s = 0; s < steps; s++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBG);
      pass.dispatchWorkgroups(1);   // 64 threads; only ant_count threads do work
      pass.end();
    }

    // Full-screen render
    const view       = context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0.04, g: 0.04, b: 0.10, a: 1 },
        loadOp:     "clear",
        storeOp:    "store",
      }],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBG);
    renderPass.draw(6);   // 6 vertices = 2 triangles = full-screen quad
    renderPass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch(err => console.error("Initialization failed:", err));
