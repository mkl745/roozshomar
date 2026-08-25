const PostFX = (() => {

class PostFX {
  constructor(gl) {
    this.gl = gl;
    this.quad = GLC.makeQuad(gl);
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.pBright = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.BRIGHT_FS);
    this.pDown = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.DOWN_FS);
    this.pUp = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.UP_FS);
    this.pComposite = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.COMPOSITE_FS);
    this.w = 0; this.h = 0;
  }

  resize(w, h) {
    const gl = this.gl;
    if (w === this.w && h === this.h) return;
    this.destroyTargets();
    this.w = w; this.h = h;
    this.scene = GLC.rt(gl, w, h, this.hdr);
    this.levels = [];
    let lw = Math.max(16, w >> 1), lh = Math.max(16, h >> 1);
    for (let i = 0; i < 5; i++) {
      this.levels.push({
        a: GLC.rt(gl, lw, lh, false),
        b: GLC.rt(gl, lw, lh, false),
        w: lw, h: lh
      });
      lw = Math.max(8, lw >> 1);
      lh = Math.max(8, lh >> 1);
    }
  }

  destroyTargets() {
    const gl = this.gl;
    GLC.delRT(gl, this.scene);
    (this.levels || []).forEach(l => { GLC.delRT(gl, l.a); GLC.delRT(gl, l.b); });
    this.levels = null;
  }

  beginScene() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.w, this.h);
  }

  blit(prog, target, setup) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
    }
    gl.useProgram(prog);
    setup(prog);
    this.quad.draw(gl);
  }

  compose(p) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);

    this.blit(this.pBright, this.levels[0].a, pr => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.t);
      gl.uniform1i(pr.u('uT0'), 0);
      gl.uniform1f(pr.u('uThresh'), p.threshold);
    });

    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1], dst = this.levels[i];
      this.blit(this.pDown, dst.a, pr => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.a.t);
        gl.uniform1i(pr.u('uT0'), 0);
        gl.uniform2f(pr.u('uTexel'), 1 / src.w, 1 / src.h);
      });
    }

    let acc = this.levels[this.levels.length - 1].a;
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const dst = this.levels[i];
      const srcAcc = acc, detail = dst.a;
      this.blit(this.pUp, dst.b, pr => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcAcc.t);
        gl.uniform1i(pr.u('uA'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, detail.t);
        gl.uniform1i(pr.u('uB'), 1);
        gl.uniform2f(pr.u('uTexel'), 1 / srcAcc.w, 1 / srcAcc.h);
      });
      acc = dst.b;
    }

    this.blit(this.pComposite, null, pr => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.t);
      gl.uniform1i(pr.u('uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, acc.t);
      gl.uniform1i(pr.u('uBloom'), 1);
      gl.uniform2f(pr.u('uRes'), this.w, this.h);
      gl.uniform1f(pr.u('uTime'), p.time);
      gl.uniform2f(pr.u('uSunUV'), p.sunUV[0], p.sunUV[1]);
      gl.uniform1f(pr.u('uRay'), p.ray);
      gl.uniform1f(pr.u('uBloomAmt'), p.grade.bloom);
      gl.uniform1f(pr.u('uExposure'), p.grade.exposure);
      gl.uniform3f(pr.u('uLift'), p.grade.lift[0], p.grade.lift[1], p.grade.lift[2]);
      gl.uniform3f(pr.u('uGain'), p.grade.gain[0], p.grade.gain[1], p.grade.gain[2]);
      gl.uniform1f(pr.u('uSat'), p.grade.sat);
      gl.uniform1f(pr.u('uVig'), p.grade.vig);
      gl.uniform1f(pr.u('uCA'), p.grade.ca * 0.01);
      gl.uniform1f(pr.u('uGrain'), p.grade.grain);
      gl.uniform1f(pr.u('uLetter'), p.letterbox);
      gl.uniform1f(pr.u('uFW'), p.fadeWhite);
      gl.uniform1f(pr.u('uFB'), p.fadeBlack);
      gl.uniform1f(pr.u('uUnder'), p.under || 0);
    });
  }
}

return PostFX;
})();
