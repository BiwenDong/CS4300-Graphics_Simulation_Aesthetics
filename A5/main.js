const PARTICLE_COUNT = 4096;

async function init() {
  if (!navigator.gpu) {
    alert("WebGPU is not supported in this browser.");
    return;
  }

  const canvas = document.querySelector("canvas");
  if (!canvas) {
    console.error("No <canvas> found in the page.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    alert("Failed to get GPU adapter.");
    return;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  resizeCanvas();

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  const [computeCode, renderCode] = await Promise.all([
    fetch("compute.wgsl").then((r) => r.text()),
    fetch("frag.wgsl").then((r) => r.text()),
  ]);

  const computeModule = device.createShaderModule({ code: computeCode });
  const renderModule = device.createShaderModule({ code: renderCode });

  const particleStride = 6 * 4;

  const particleBuffer = device.createBuffer({
    size: PARTICLE_COUNT * particleStride,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.VERTEX |
      GPUBufferUsage.COPY_DST,
  });

  const initialParticles = new Float32Array(PARTICLE_COUNT * 6);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const base = i * 6;
    initialParticles[base + 0] = 0.0;   // pos.x
    initialParticles[base + 1] = 0.0;   // pos.y
    initialParticles[base + 2] = 0.0;   // vel.x
    initialParticles[base + 3] = 0.0;   // vel.y
    initialParticles[base + 4] = -1.0;  // life
    initialParticles[base + 5] = 1.0;   // maxLife
  }
  device.queue.writeBuffer(particleBuffer, 0, initialParticles);

  const simParamBuffer = device.createBuffer({
    size: 12 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const computePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [computeBindGroupLayout],
  });

  const renderPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [renderBindGroupLayout],
  });

  const computeBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: simParamBuffer } },
    ],
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: simParamBuffer } },
    ],
  });


  const computePipeline = device.createComputePipeline({
    layout: computePipelineLayout,
    compute: {
      module: computeModule,
      entryPoint: "cs_main",
    },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: renderPipelineLayout,
    vertex: {
      module: renderModule,
      entryPoint: "vs_main",
    },
    fragment: {
      module: renderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const heightSlider = document.getElementById("heightSlider");
  const heightVal = document.getElementById("heightVal");
  heightSlider.addEventListener("input", () => {
    heightVal.textContent = parseFloat(heightSlider.value).toFixed(2);
  });

  const speedSlider = document.getElementById("speedSlider");
  const speedVal = document.getElementById("speedVal");
  speedSlider.addEventListener("input", () => {
    speedVal.textContent = parseFloat(speedSlider.value).toFixed(2);
  });

  let lastTime = performance.now();

  function frame(now) {
    resizeCanvas();

    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    const aspect = canvas.width / canvas.height;

    const simParams = new Float32Array([
      now * 0.001, dt, 0.8, 0.0,

      0.0, -0.8, parseFloat(heightSlider.value), 1.5,

      0.03, aspect, 0.5, parseFloat(speedSlider.value),
    ]);

    device.queue.writeBuffer(simParamBuffer, 0, simParams);

    const encoder = device.createCommandEncoder();

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBindGroup);
      pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
      pass.end();
    }

    {
      const view = context.getCurrentTexture().createView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBindGroup);
      pass.draw(6, PARTICLE_COUNT);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch((err) => {
  console.error("Initialization failed:", err);
});