import { FramebufferObject, PingPongFBO } from '../../types/webgl';

/**
 * Creates and compiles a WebGL shader
 */
export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create WebGL shader');
  }

  gl.shaderSource(shader, source.trim());
  gl.compileShader(shader);

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}\nSource:\n${source}`);
  }

  return shader;
}

/**
 * Creates and links a WebGL program from vertex and fragment shader sources
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram {
  const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Unable to create WebGL program');
  }

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  return program;
}

/**
 * Sets up a standard full-screen quad (NDC -1 to 1) and UVs (0 to 1)
 */
export function createQuadVAO(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; buffer: WebGLBuffer } {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Unable to create VertexArray');
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to create Buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // Position (x, y) and TexCoord (u, v)
  const quadVertices = new Float32Array([
    -1.0, -1.0,  0.0, 0.0,
     1.0, -1.0,  1.0, 0.0,
    -1.0,  1.0,  0.0, 1.0,

    -1.0,  1.0,  0.0, 1.0,
     1.0, -1.0,  1.0, 0.0,
     1.0,  1.0,  1.0, 1.0,
  ]);

  gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

  // Location 0: position
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);

  // Location 1: texCoord
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, buffer };
}

/**
 * Creates an empty RGBA texture configured for video/framebuffer processing
 */
export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  filter: number = gl.LINEAR
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to create WebGL Texture');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

/**
 * Sets texture filtering mode on an existing texture
 */
export function setTextureFilter(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  filter: number
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Creates a Framebuffer Object with an attached color texture
 */
export function createFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  filter: number = gl.LINEAR
): FramebufferObject {
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Unable to create Framebuffer');

  const texture = createTexture(gl, width, height, filter);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete status: ${status}`);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture, width, height };
}

/**
 * Creates a ping-pong framebuffer pair for temporal accumulation
 */
export function createPingPongFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  filter: number = gl.LINEAR
): PingPongFBO {
  let fboA = createFBO(gl, width, height, filter);
  let fboB = createFBO(gl, width, height, filter);

  return {
    get read() {
      return fboA;
    },
    get write() {
      return fboB;
    },
    swap() {
      const temp = fboA;
      fboA = fboB;
      fboB = temp;
    },
  };
}

/**
 * Cleanly releases FBO and texture resources
 */
export function deleteFBO(gl: WebGL2RenderingContext, fbo: FramebufferObject): void {
  gl.deleteTexture(fbo.texture);
  gl.deleteFramebuffer(fbo.framebuffer);
}
