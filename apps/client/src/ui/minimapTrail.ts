// src/ui/minimapTrail.ts
export type TrailPoint = { x: number; y: number; t: number };

const STEP_MIN_M = 1.5;            // přidej bod po ≥1.5 m
const ANGLE_MIN_RAD = Math.PI/22;  // ~8° změna směru
const MAX_POINTS = 320;            // tvrdý strop
const REBUILD_MS = 120;            // jak často smíme rebuildnout Path2D
const FADE_SEC = 120;              // starší než 2 min klidně zahoď

// pomocné
const hypot = Math.hypot;
const now = () => performance.now();

export class MinimapTrail {
  private pts: TrailPoint[] = [];
  private lastKeepIdx = -1;
  private dirty = false;
  private lastBuild = 0;
  private path: Path2D | null = null;

  add(x: number, y: number, tMs = now()) {
    const n = this.pts.length;
    const p = { x, y, t: tMs };
    if (n === 0) {
      this.pts.push(p);
      this.lastKeepIdx = 0;
      this.dirty = true;
      return;
    }
    const prev = this.pts[n-1];
    const d = hypot(p.x - prev.x, p.y - prev.y);
    
    // přepočet na pixely dle tvého world scale:
    const WORLD_SCALE = 10;  // jestli máš jinde, exportuj si to jako import
    const stepMinPx = STEP_MIN_M * WORLD_SCALE;

    if (d < stepMinPx) return; // neukládej šum

    // úhlová změna proti poslednímu "drženému" bodu
    if (this.lastKeepIdx >= 1) {
      const a = this.pts[this.lastKeepIdx - 1];
      const b = this.pts[this.lastKeepIdx];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = p.x - b.x, v2y = p.y - b.y;
      const dot = (v1x*v2x + v1y*v2y);
      const m1 = hypot(v1x, v1y), m2 = hypot(v2x, v2y);
      const cos = m1 > 0 && m2 > 0 ? dot / (m1*m2) : 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      // když skoro rovně a ještě jsme neujeli „dost", tak jen přepiš poslední bod
      const distFromKeep = hypot(p.x - b.x, p.y - b.y);
      if (ang < ANGLE_MIN_RAD && distFromKeep < 5 * WORLD_SCALE) {
        this.pts[this.lastKeepIdx] = p;
        this.dirty = true;
        this.gcOld();
        return;
      }
    }

    this.pts.push(p);
    this.lastKeepIdx = this.pts.length - 1;
    this.dirty = true;
    this.gcOld();
  }

  private gcOld() {
    // zahodit staré body (časově)
    const tCut = now() - FADE_SEC * 1000;
    let i = 0;
    while (i < this.pts.length && this.pts[i].t < tCut) i++;
    if (i > 0) {
      this.pts.splice(0, i);
      this.lastKeepIdx = Math.max(-1, this.lastKeepIdx - i);
      this.dirty = true;
    }
    // cap počtem
    if (this.pts.length > MAX_POINTS) {
      const drop = this.pts.length - MAX_POINTS;
      this.pts.splice(0, drop);
      this.lastKeepIdx = Math.max(-1, this.lastKeepIdx - drop);
      this.dirty = true;
    }
  }

  /** Přestav Path2D jen když je to potřeba a ne častěji než REBUILD_MS */
  private rebuildIfNeeded() {
    const t = now();
    if (!this.dirty && this.path) return;
    if (t - this.lastBuild < REBUILD_MS) return;

    this.lastBuild = t;
    this.dirty = false;

    const n = this.pts.length;
    if (n < 2) { this.path = null; return; }

    const path = new Path2D();
    path.moveTo(this.pts[0].x, this.pts[0].y);
    for (let i = 1; i < n; i++) {
      const p = this.pts[i];
      path.lineTo(p.x, p.y);
    }
    this.path = path;
  }

  /** Vykresli trail do minimapy. Kontext musí být již nastavený do WORLD transformu. */
  drawInWorld(ctx: CanvasRenderingContext2D, opts?: { linePx?: number, alpha?: number }) {
    this.rebuildIfNeeded();
    if (!this.path) return;

    const line = Math.max(1, Math.min(3, (opts?.linePx ?? 2)));
    const alpha = Math.max(0, Math.min(1, (opts?.alpha ?? 0.9)));

    // kontrastní dvojitý tah pro viditelnost na různém podkladu
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // podklad (světlejší okraj)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = line + 2;
    ctx.stroke(this.path);

    // hlavní čára
    ctx.strokeStyle = '#e83f36'; // decentní červená
    ctx.lineWidth = line;
    ctx.stroke(this.path);

    ctx.restore();
  }

  /** Hard toggle: pro případ, že chceš trail úplně vypnout */
  clear() {
    this.pts = [];
    this.lastKeepIdx = -1;
    this.path = null;
    this.dirty = false;
  }
}