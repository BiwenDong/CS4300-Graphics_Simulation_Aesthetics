 @fragment
fn fs(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  let uv = uvN(pos.xy);
  let bass = audio[0];
  let mid  = audio[1];
  let high = audio[2];
  let rawEnergy = bass * 0.6 + mid * 0.5 + high * 0.4;
  let energy = pow(rawEnergy, 1.5);
  let beat = smoothstep(0.15, 0.35, bass);
  let wave = sin(uv.x * 20.0 + seconds() * 2.0);
  let detail = cos(uv.x * 50.0 + seconds() * 5.0) * 0.2;
  let y = 0.5 
        + wave * energy * (0.10 + beat * 0.08)
        + detail * energy * 0.05;

  let thickness = 0.008 + beat * 0.004;
  let dist = abs(uv.y - y);
  let line = smoothstep(thickness, 0.0, dist);
  let glow = smoothstep(0.03, 0.0, dist);
  let fade = exp(-dist * 20.0);
  let clampEnergy = clamp(energy, 0.0, 1.0); 
  let pulse = fract(seconds());
  let sharp = sign(wave);
  let inv = 1.0 - step(0.5, uv.x);
  let mixed = mix(line, glow, 0.5);
  let t = seconds();
  let r = mixed * (0.6 + bass * 2.0 + 0.3 * sin(t * 2.0));
  let g = mixed * (0.5 + mid  * 1.5 + 0.3 * cos(t * 2.5 + 1.0));
  let b = mixed * (0.8 + high * 2.0 + 0.3 * sin(t * 3.0 + 2.0));
  let modulation =
        (0.9 + 0.1 * pulse)
        *(0.95 + 0.05 * sharp)
        *(0.9 + 0.1 * inv)
        *(0.8 + fade * 0.2)
        *(0.8 + clampEnergy * 0.2); 
  let baseColor = vec3f(r, g, b) * modulation;
  let fb = lastframe(uv);
  let finalColor = baseColor + fb.rgb * 0.08;
  return vec4f(finalColor, 1.0);
}
