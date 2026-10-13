export interface FramebufferObject {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface PingPongFBO {
  read: FramebufferObject;
  write: FramebufferObject;
  swap: () => void;
}

export interface ShaderUniforms {
  [key: string]: WebGLUniformLocation | null;
}

export interface ShaderProgramInfo {
  program: WebGLProgram;
  attribs: {
    position: number;
    texCoord: number;
  };
  uniforms: ShaderUniforms;
}
