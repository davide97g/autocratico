// A stand-in plate: the entry id, big, on the studio grey (used until a scene module exists).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { display, drawStudio } from './_motifs';

export default class Placeholder extends Scene {
  layer = new Layer2D();
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const c = this.layer.ctx;
    this.layer.clear();
    drawStudio(c);
    display(c, this.ctx.id, 120, 600, 160);
    const l = this.ctx.lyrics.lineAt(f.t);
    if (l) display(c, l.text, 120, 720, 40, { weight: 500 });
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.03, vignette: 0.15 };
  }
}
