const GLC = (() => {

function create(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });
  return gl;
}

function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
    throw new Error('Shader compile failed:\n' + log + '\n' + numbered);
  }
  return s;
}

function prog(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  const v = sh(gl, gl.VERTEX_SHADER, vsSrc);
  const f = sh(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  }
  p._cache = {};
  p.u = function(name) {
    if (!(name in this._cache)) this._cache[name] = gl.getUniformLocation(this, name);
    return this._cache[name];
  };
  return p;
}

function texFromCanvas(gl, source, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

function rt(gl, w, h, hdr) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (hdr) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, t, w, h };
}

function delRT(gl, r) {
  if (!r) return;
  gl.deleteFramebuffer(r.fb);
  gl.deleteTexture(r.t);
}

function makeQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const data = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
     1,  1, 1, 1,
    -1, -1, 0, 0,
     1,  1, 1, 1,
    -1,  1, 0, 1
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return {
    vao,
    bind(glRef) { glRef.bindVertexArray(this.vao); },
    draw(glRef) { glRef.bindVertexArray(this.vao); glRef.drawArrays(glRef.TRIANGLES, 0, 6); }
  };
}

function fullscreenTriVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindVertexArray(null);
  return vao;
}

const QUAD_VS_SRC = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
out vec2 vUV;
void main(){ vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`;

return {
  create, sh, prog, texFromCanvas, rt, delRT, makeQuad, fullscreenTriVAO,
  QUAD_VS_SRC
};
})();
