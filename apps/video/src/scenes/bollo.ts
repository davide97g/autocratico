// Bollo over the film (the "with Bollo" cut, ?bollo=1): an overlay entry that draws the frame beneath
// and the talking head on top, where the choreography (bollo-choreo.ts) puts him and doing what it
// says, while the rig (_bollo-rig.ts) keeps him alive: lip-sync, springs on the music, eyes.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { drawBolloHead } from './_bollo-head';
import { BolloRig } from './_bollo-rig';
import { Choreo, screamPose } from './_bollo-choreo';
import { CROWDS, CUES } from './bollo-choreo';
import { frameIdx } from '../engine/util';

export default class Bollo extends Scene {
  override handlesTransition = true;
  layer = new Layer2D();
  rig!: BolloRig;
  choreo!: Choreo;

  override init() {
    this.rig = new BolloRig(this.ctx.lyrics, this.ctx.audio);
    this.choreo = new Choreo(CUES, this.ctx.lyrics, this.ctx.audio, CROWDS);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    if (f.under) comp.draw(renderer, f.under, out, { mode: 'replace' });
    else clearRT(renderer, out, [0, 0, 0]);
    const st = this.choreo.at(f.t);
    const crowd = this.choreo.crowdAt(f.t);
    const main = st.alpha > 0.001 && st.s > 0.5;
    if (!main && !crowd.length) return {};
    const life = this.rig.life(st.lifeT, this.ctx.audio.barAt(st.lifeT));
    const L = this.layer, c = L.ctx;
    L.clear();
    // the crowd first (behind him): the same voice, each a little out of step, all screaming at us
    const fi = frameIdx(f.t);
    for (const k of crowd) {
      const lf = this.rig.life(f.t - 0.03 * (k.i % 3), f.bar);
      const p = screamPose({ ...lf.pose, lookX: 0, lookY: 0, turn: Math.sin(k.i * 2.3) * 0.25 }, lf.pose.mouth!, k.k, fi + k.i);
      c.save();
      c.translate(k.x, k.y + (lf.nodY * k.s) / 100);
      c.rotate(k.rot);
      drawBolloHead(c, 0, 0, k.s, { ...p, hardShadow: true });
      c.restore();
    }
    if (main) {
      const pose = st.apply(life.pose, life);
      c.save();
      if (st.clip) { const [x0, y0, x1, y1] = st.clip; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); }
      c.globalAlpha = st.alpha;
      c.translate(st.x, st.y + (life.nodY * st.s) / 100);
      c.rotate(st.rot);
      drawBolloHead(c, 0, 0, st.s, pose);
      c.restore();
    }
    comp.draw(renderer, L.upload(), out, { mode: 'normal' });
    return {};
  }
}
