(() => {
  'use strict';
  const canvas = document.querySelector('#helix-canvas');
  const scene = canvas.closest('.scene');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let savedMotion;
  try { savedMotion = localStorage.getItem('helix-motion'); } catch {}
  let moving = savedMotion === null || savedMotion === undefined ? !preference.matches : savedMotion === 'on';
  let gl, program, frame = 0, elapsed = 0, previousTime = 0, running = false, frameCount = 0;
  const image = new Image();

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_cover;
    uniform float u_time;
    varying vec2 v_uv;
    void main() {
      vec2 uv = (v_uv - 0.5) * u_cover + 0.5;
      const float floorY = 0.665;
      float reflected = step(floorY, uv.y);
      // Reflection samples the same animation phase at the mirrored height.
      float height = mix(uv.y, 2.0 * floorY - uv.y, reflected);
      float horizontalMask = 1.0 - smoothstep(0.24, 0.43, abs(uv.x - 0.5));
      float verticalMask = smoothstep(0.10, 0.24, height);
      float strength = horizontalMask * verticalMask;
      float phase = u_time * 0.52;
      float orbitX = sin(phase) * 0.015;
      float orbitY = cos(phase) * 0.005;
      float twist = sin(phase + height * 8.0) * 0.007;
      float perspective = cos(phase) * (uv.x - 0.5) * 0.045;
      float groundAnchor = smoothstep(0.0, 0.16, abs(floorY - uv.y));
      vec2 movement = vec2(orbitX + twist + perspective,
                          orbitY * groundAnchor * mix(1.0, -0.72, reflected));
      // The displacement fades before the pillars; architecture stays still.
      vec2 sampleUV = uv + movement * strength;
      // Only the reflected light gets a small water-like surface ripple.
      sampleUV.x += reflected * strength * sin(uv.y * 170.0 - phase * 2.0) * 0.0007;
      vec4 color = texture2D(u_image, clamp(sampleUV, 0.001, 0.999));
      float cyanLight = max(0.0, min(color.g, color.b) - color.r * 0.45);
      color.rgb *= 1.0 + strength * cyanLight * sin(phase * 1.4 + height * 12.0) * 0.035;
      gl_FragColor = color;
    }
  `;

  function shader(type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
    return value;
  }

  function resize() {
    if (!gl || !program) return;
    const width = scene.clientWidth, height = scene.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const imageRatio = image.width / image.height;
    const screenRatio = width / height;
    gl.uniform2f(gl.getUniformLocation(program, 'u_cover'),
      screenRatio < imageRatio ? screenRatio / imageRatio : 1,
      screenRatio > imageRatio ? imageRatio / screenRatio : 1);
    draw();
  }

  function draw() {
    if (!gl || !program) return;
    gl.uniform1f(gl.getUniformLocation(program, 'u_time'), elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.frames = String(++frameCount);
  }

  function animate(time) {
    if (!running) return;
    if (previousTime) elapsed += Math.min((time - previousTime) / 1000, 0.06);
    previousTime = time;
    draw();
    frame = requestAnimationFrame(animate);
  }

  function syncMotion() {
    scene.classList.toggle('is-paused', !moving);
    canvas.dataset.motion = moving ? 'running' : 'paused';
    const shouldRun = moving && !document.hidden && !!program;
    if (shouldRun && !running) {
      running = true;
      previousTime = 0;
      frame = requestAnimationFrame(animate);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  }

  window.helixMotion = {
    get enabled() { return moving; },
    set(enabled) {
      moving = enabled;
      try { localStorage.setItem('helix-motion', enabled ? 'on' : 'off'); } catch {}
      syncMotion();
    }
  };
  preference.addEventListener('change', () => {
    let saved;
    try { saved = localStorage.getItem('helix-motion'); } catch {}
    if (!saved) { moving = !preference.matches; syncMotion(); }
  });
  document.addEventListener('visibilitychange', syncMotion);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
    program = null;
    scene.classList.remove('is-ready');
  });
  canvas.addEventListener('webglcontextrestored', initialize);

  function initialize() {
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
      if (!gl) return;
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
      resize();
      scene.classList.add('is-ready');
      syncMotion();
    } catch (error) {
      program = null;
      scene.classList.remove('is-ready');
      console.warn('HELIX verwendet die alternative Animation.', error);
    }
  }
  new ResizeObserver(resize).observe(scene);
  image.addEventListener('load', initialize);
  image.src = document.querySelector('.scene-fallback').src;
  syncMotion();
})();
