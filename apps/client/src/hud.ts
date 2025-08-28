// hud.ts – minimalistické HUD napojené na eventBus
import { eventBus } from '@shared/eventBus';

type HUDOptions = {
  attachTo?: HTMLElement;
  enableMiniMap?: boolean;
  mapLayer?: any;
  camera?: any;
  getPlayer?: () => { position: {x:number,y:number}, angle:number };
  // NOVÉ:
  worldScalePxPerMeter?: number;  // např. 10
  metersAcross?: number;          // šířka okna v metrech (např. 280)
  courseUp?: boolean;             // true = nahoru směr jízdy
  showNorthIndicator?: boolean; // NOVÉ: výchozí false

  // NOVÉ (volitelné)
  trailEnabled?: boolean;         // výchozí true
  trailMaxMeters?: number;        // výchozí 1200 m
  trailSampleMinMeters?: number;  // výchozí 1.5 m
  miniRangeMin?: number;          // min oddálení (m) – výchozí 160
  miniRangeMax?: number;          // max oddálení (m) – výčozí 900
};

export class HUD {
  private root: HTMLDivElement;
  private speedEl: HTMLSpanElement;
  private unitEl: HTMLSpanElement;
  private ccEl: HTMLDivElement;
  private blLeft: SVGElement;
  private blRight: SVGElement;

  private miniWrap?: HTMLDivElement;
  private mini?: HTMLCanvasElement;
  private miniCtx?: CanvasRenderingContext2D | null;
  private miniState = {
    wpm: 10,
    metersAcross: 420,
    minAcross: 160,
    maxAcross: 1200,
    courseUp: true,
    follow: true,
    center: { x: 0, y: 0 },    // free režim
    dragging: false,
    lastMouse: { x: 0, y: 0 },
    showN: false,
  };

  private blinking = false;
  private blinkerTimer = 0;
  private blinkerHz = 1.5; // ~90/min
  private lastSpeedKmh = 0;
  private cruiseOn = false;
  private cruiseTargetKmh: number | null = null;

  // trail stav:
  private trail: Array<{x:number,y:number}> = [];
  private trailMaxMeters = 1200;
  private trailSampleMinMeters = 1.5;

  constructor(opts: HUDOptions = {}) {
    const parent = opts.attachTo ?? document.body;

    // Initialize minimap state from constructor arguments
    this.miniState.wpm = opts.worldScalePxPerMeter ?? 10;
    this.miniState.metersAcross = opts.metersAcross ?? 500;
    this.miniState.minAcross = opts.miniRangeMin ?? 160;
    this.miniState.maxAcross = opts.miniRangeMax ?? 1200;
    this.miniState.courseUp = opts.courseUp ?? true;
    this.miniState.showN = opts.showNorthIndicator ?? false;

    this.trailMaxMeters = opts.trailMaxMeters ?? 1200;
    this.trailSampleMinMeters = opts.trailSampleMinMeters ?? 1.5;
    const trailEnabled = opts.trailEnabled ?? true;

    // Inject minimalistický CSS
    this.injectCSS();

    // Root
    this.root = document.createElement('div');
    this.root.id = 'hud';
    parent.appendChild(this.root);

    // Rychloměr
    const speedBox = document.createElement('div');
    speedBox.className = 'hud-speed';
    this.speedEl = document.createElement('span');
    this.speedEl.className = 'hud-speed-num';
    this.speedEl.textContent = '0';
    this.unitEl = document.createElement('span');
    this.unitEl.className = 'hud-speed-unit';
    this.unitEl.textContent = 'km/h';
    speedBox.appendChild(this.speedEl);
    speedBox.appendChild(this.unitEl);
    this.root.appendChild(speedBox);

    // Blinkry
    const blinkBox = document.createElement('div');
    blinkBox.className = 'hud-blinkers';
    this.blLeft = this.makeArrow('left');
    this.blRight = this.makeArrow('right');
    blinkBox.appendChild(this.blLeft);
    blinkBox.appendChild(this.blRight);
    this.root.appendChild(blinkBox);

    // Tempomat indikátor (jako kontrolka na palubce) 
    this.ccEl = document.createElement('div');
    this.ccEl.className = 'hud-cc-indicator';
    this.ccEl.innerHTML = this.makeCruiseControlIcon();
    speedBox.appendChild(this.ccEl);

    // Mini-mapa (volitelně)
    if (opts.enableMiniMap && opts.mapLayer && opts.getPlayer) {
      this.miniWrap = document.createElement('div');
      this.miniWrap.className = 'hud-minimap';
      this.mini = document.createElement('canvas');

      const DPR = devicePixelRatio || 1;
      const CSS_SIZE = 200; // px v rohu UI
      this.mini.width = CSS_SIZE * DPR;
      this.mini.height = CSS_SIZE * DPR;
      this.mini.style.width = CSS_SIZE + 'px';
      this.mini.style.height = CSS_SIZE + 'px';
      this.miniCtx = this.mini.getContext('2d');
      this.miniWrap.appendChild(this.mini);
      this.root.appendChild(this.miniWrap);

      // UI kontroly
      const controls = document.createElement('div');
      controls.style.position = 'absolute';
      controls.style.right = '8px';
      controls.style.top = '8px';
      controls.style.display = 'flex';
      controls.style.gap = '6px';
      controls.style.pointerEvents = 'auto';

      const btnFollow = document.createElement('button');
      btnFollow.textContent = 'Follow';
      btnFollow.title = 'Zpět na vozidlo';
      this.styleBtn(btnFollow);

      this.miniWrap!.appendChild(controls);
      controls.appendChild(btnFollow);

      btnFollow.onclick = () => { this.miniState.follow = true; };

      // myš: wheel/drag/dblclick
      this.mini!.addEventListener('wheel', (e) => {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1/1.12 : 1.12;
        const next = this.miniState.metersAcross * f;
        this.miniState.metersAcross = Math.min(this.miniState.maxAcross, Math.max(this.miniState.minAcross, next));
      }, { passive: false });

      this.mini!.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.miniState.dragging = true;
        this.miniState.follow = false;
        this.miniState.lastMouse = { x: e.offsetX * (devicePixelRatio||1), y: e.offsetY * (devicePixelRatio||1) };
      });
      window.addEventListener('mouseup', ()=> this.miniState.dragging = false);
      this.mini!.addEventListener('mousemove', (e) => {
        if (!this.miniState.dragging) return;
        const DPR = devicePixelRatio || 1;
        const mx = e.offsetX * DPR, my = e.offsetY * DPR;
        const dx = mx - this.miniState.lastMouse.x;
        const dy = my - this.miniState.lastMouse.y;
        this.miniState.lastMouse = { x: mx, y: my };

        // přepočet posunu obrazovky → world posun (repektuje rotaci course-up)
        const W = this.mini!.width;
        const scale = W / (this.miniState.metersAcross * this.miniState.wpm);
        let vx = dx / scale, vy = dy / scale;  // v "world pixelech"
        if (this.miniState.courseUp) {
          const player = opts.getPlayer!();
          const theta = player.angle + Math.PI/2; // mapa rotuje o -(theta)
          const c = Math.cos(theta), s = Math.sin(theta);
          // otoč posun do světových os
          const wx =  c*vx - s*vy;
          const wy =  s*vx + c*vy;
          vx = wx; vy = wy;
        }
        this.miniState.center.x -= vx;
        this.miniState.center.y -= vy;
      });

      this.mini!.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.miniState.follow = true; // zpět na auto
      });

      const drawMini = () => {
        const ctx = this.miniCtx!;
        const DPR = devicePixelRatio || 1;
        const W = this.mini!.width, H = this.mini!.height;

        // kolik canvas px připadá na 1 world px
        const scale = W / (this.miniState.metersAcross * this.miniState.wpm);

        // Data hráče
        const player = opts.getPlayer!();
        const px = player.position.x;
        const py = player.position.y;

        // centrum
        if (this.miniState.follow) {
          this.miniState.center.x = px;
          this.miniState.center.y = py;
        }
        const cx = this.miniState.center.x, cy = this.miniState.center.y;

        // TRASA – sběr bodu a ořez
        if (trailEnabled) {
          // pokud „teleport" (> 200 m), trail smaž a začni znovu
          const jumpMeters = 200;
          const last = this.trail[this.trail.length - 1];
          if (last && (Math.hypot(px - last.x, py - last.y) > jumpMeters * this.miniState.wpm)) {
            this.trail = [];
          }
          this.pushTrailPoint(px, py);
          this.trimTrailByMeters();
        }

        // pozadí + clip
        ctx.save();
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle = '#0f1114'; ctx.fillRect(0,0,W,H);
        const r = 12*DPR; this.roundRect(ctx,0,0,W,H,r); ctx.clip();

        // transformace mapy
        ctx.translate(W/2, H/2);
        ctx.scale(scale, scale);
        if (this.miniState.courseUp) ctx.rotate(-(player.angle + Math.PI/2));
        ctx.translate(-cx, -cy);

        // ostré dlaždice: spočítáme tile zoom bias podle rozsahu
        const baseAcross = 420; // referenční „ostrost"
        const bias = Math.max(-4, Math.min(4, Math.round(Math.log2(baseAcross / this.miniState.metersAcross))));

        // overscan, grayscale atd.
        const overscan = Math.SQRT2;
        const viewW = (W/scale)*overscan, viewH = (H/scale)*overscan;

        ctx.save();
        ctx.globalAlpha = 0.40;
        try { (ctx as any).filter = 'grayscale(100%) brightness(1.08) contrast(0.95)'; } catch {}
        opts.mapLayer.draw(ctx, viewW, viewH, cx, cy, { tileZoomBias: bias });
        try { (ctx as any).filter = 'none'; } catch {}
        ctx.restore();

        // VYKRESLENÍ TRAILU (v mapové transformaci, tedy rotuje s mapou)
        if (trailEnabled && this.trail.length >= 2) {
          ctx.save();
          // tloušťka v pixelech bez ohledu na zoom
          ctx.lineWidth = Math.max(2, 2 / scale);
          // jemná záře pro čitelnost
          ctx.shadowColor = 'rgba(30, 200, 255, 0.35)';
          ctx.shadowBlur = 6 / scale;

          // fade: projdi segmenty a snižuj alfa ke starším bodům
          const n = this.trail.length;
          for (let i = 1; i < n; i++) {
            const a = this.trail[i-1], b = this.trail[i];
            const t = i / n;                         // 0..1
            const alpha = 0.15 + 0.55 * t;           // slabší u začátku, silnější u konce
            ctx.strokeStyle = `rgba(60, 210, 255, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.restore();
        }

        // reset transformace pro marker
        ctx.setTransform(1,0,0,1,0,0);

        // scale bar (metricky rozumný)
        this.drawScaleBar(ctx, W, H, this.miniState.metersAcross, DPR);

        // --- MARKER AUTA: promítnutí world -> UI, aby se při panu neposouval střed ---
        {
          const DPR = devicePixelRatio || 1;
          const W = this.mini!.width, H = this.mini!.height;

          // Kolik canvas px připadá na 1 world px
          const scale = W / (this.miniState.metersAcross * this.miniState.wpm);

          // Vektor hráče vůči aktuálnímu centru minimapy (ve world px)
          let dx = player.position.x - this.miniState.center.x;
          let dy = player.position.y - this.miniState.center.y;

          // Course-up: minimapa rotuje o -(angle+π/2), takže aplikuj STEJNOU rotaci na vektor
          if (this.miniState.courseUp) {
            const theta = -(player.angle + Math.PI / 2);
            const c = Math.cos(theta), s = Math.sin(theta);
            const rx = c*dx - s*dy;
            const ry = s*dx + c*dy;
            dx = rx; dy = ry;
          }

          // Převod do UI px
          let px = W/2 + dx * scale;
          let py = H/2 + dy * scale;

          // „Forward bias" jen když follow == true (v „free" režimu je to matoucí)
          if (this.miniState.follow) {
            const forwardBiasPx = 10 * DPR;
            py += forwardBiasPx;
          }

          // Kresba šipky (v UI souřadnicích, šipka míří NAHORU)
          const s = 24 * DPR;
          const ctx2 = this.miniCtx!;
          ctx2.save();
          ctx2.setTransform(1, 0, 0, 1, 0, 0);
          ctx2.translate(px, py);
          ctx2.fillStyle = '#ff3355';
          ctx2.strokeStyle = 'rgba(0,0,0,.7)';
          ctx2.lineWidth = Math.max(2, 2*DPR/2);
          ctx2.beginPath();
          ctx2.moveTo(0, -0.60*s);
          ctx2.lineTo( 0.36*s, 0.50*s);
          ctx2.lineTo( 0,      0.22*s);
          ctx2.lineTo(-0.36*s, 0.50*s);
          ctx2.closePath();
          ctx2.fill();
          ctx2.stroke();
          ctx2.restore();
        }

        // Kompas N
        if (this.miniState.courseUp && this.miniState.showN) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = 0.85;
          ctx.font = `${12*DPR}px system-ui`;
          ctx.fillText('N', W - 20*DPR, 18*DPR);
        }

        // rámeček
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 2*DPR; this.roundRect(ctx,0,0,W,H,r); ctx.stroke();

        ctx.restore();
        requestAnimationFrame(drawMini);
      };
      requestAnimationFrame(drawMini);
    }

    // Subscriby
    eventBus.on('vehicleUpdate', (data: any) => {
      // očekávané vlastnosti z tvého kódu:
      // speed (km/h), leftBlinker, rightBlinker, cruiseControl (bool), cruiseTargetKmh? (volitelné)
      this.lastSpeedKmh = Math.round(data?.speed ?? 0);
      this.speedEl.textContent = String(this.lastSpeedKmh);

      const left = !!data?.leftBlinker;
      const right = !!data?.rightBlinker;
      this.blLeft.classList.toggle('active', left);
      this.blRight.classList.toggle('active', right);
      this.blinking = left || right;

      this.cruiseOn = !!data?.cruiseControl;
      // podporuj obě varianty: posíláš-li cílovku v m/s, převedeme
      const targetKmh =
        typeof data?.cruiseTargetKmh === 'number'
          ? data.cruiseTargetKmh
          : (typeof data?.cruiseControlSpeed === 'number' ? Math.round(data.cruiseControlSpeed * 3.6) : null);

      this.cruiseTargetKmh = this.cruiseOn ? (targetKmh ?? this.lastSpeedKmh) : null;
      
      // Tempomat kontrolka - jen zapnuto/vypnuto
      this.ccEl.classList.toggle('on', this.cruiseOn);
    });

    // Blikání (jednotná fáze z game loopu)
    eventBus.on('blinkPhase', (on: boolean) => {
      if (!this.blinking) {
        this.blLeft.classList.remove('blink');
        this.blRight.classList.remove('blink');
        return;
      }
      // Použij fázi z hlavního loopu – sjednocené blikání
      this.blLeft.classList.toggle('blink', !on && this.blLeft.classList.contains('active'));
      this.blRight.classList.toggle('blink', !on && this.blRight.classList.contains('active'));
    });
  }

  private pushTrailPoint(px:number, py:number) {
    const last = this.trail[this.trail.length - 1];
    const dx = last ? px - last.x : 0;
    const dy = last ? py - last.y : 0;
    const minWorld = this.trailSampleMinMeters * this.miniState.wpm; // v „world px"
    if (!last || Math.hypot(dx, dy) >= minWorld) {
      this.trail.push({ x: px, y: py });
    }
  }

  private trimTrailByMeters() {
    if (this.trail.length < 2) return;
    const maxWorld = this.trailMaxMeters * this.miniState.wpm;
    // dopočítej kumulovanou délku od konce směrem dozadu a ořízni
    let acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i], b = this.trail[i-1];
      acc += Math.hypot(a.x - b.x, a.y - b.y);
      if (acc > maxWorld) {
        this.trail = this.trail.slice(i); // ponech konec
        break;
      }
    }
  }

  private styleBtn(b: HTMLButtonElement) {
    b.style.pointerEvents = 'auto';
    b.style.font = '600 12px system-ui';
    b.style.padding = '4px 8px';
    b.style.borderRadius = '8px';
    b.style.border = '1px solid rgba(255,255,255,.35)';
    b.style.background = 'rgba(0,0,0,.35)';
    b.style.color = '#fff';
    b.style.backdropFilter = 'blur(6px)';
    b.style.cursor = 'pointer';
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D, W:number, H:number, metersAcross:number, DPR:number){
    // vyber hezký krok (10,20,50,100,200,500,1000...)
    const steps = [10,20,50,100,200,500,1000,2000,5000];
    let targetPx = 60*DPR; // chceme ~60–120 px
    let best = steps[0], bestDiff = Infinity;
    for (const s of steps){
      const px = (s / metersAcross) * W;
      const d = Math.abs(px - targetPx);
      if (d < bestDiff) { bestDiff = d; best = s; }
    }
    const barPx = (best / metersAcross) * W;

    const x = 10*DPR, y = H - 14*DPR;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x-4*DPR, y-10*DPR, barPx+8*DPR, 14*DPR);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y-6*DPR, barPx, 4*DPR);
    ctx.font = `${10*DPR}px system-ui`;
    ctx.textBaseline = 'bottom';
    const label = best >= 1000 ? `${(best/1000).toFixed(best%1000?1:0)} km` : `${best} m`;
    ctx.fillText(label, x, y-8*DPR);
    ctx.restore();
  }

  // Helper function to draw rounded rectangles
  private roundRect(ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  private makeArrow(dir: 'left' | 'right') {
    const svgNS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.classList.add('hud-blinker-arrow', dir);
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', dir === 'left'
      ? 'M14 6 L6 12 L14 18 L14 13 L22 13 L22 11 L14 11 Z'
      : 'M10 6 L18 12 L10 18 L10 13 L2 13 L2 11 L10 11 Z'
    );
    s.appendChild(p);
    return s;
  }

  private makeCruiseControlIcon() {
    // SVG ikonka tempomatu (čistý tachometr bez textu)
    return `
      <svg viewBox="0 0 24 24" class="hud-cc-icon">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 12 L10 12 M14 12 L16 12" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
      </svg>
    `;
  }

  private injectCSS() {
    if (document.getElementById('hud-css')) return;
    const style = document.createElement('style');
    style.id = 'hud-css';
    style.textContent = `
#hud {
  position: fixed; inset: 0; pointer-events: none;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
  color: #fff;
}
.hud-speed {
  position: fixed; left: 24px; bottom: 24px;
  padding: 8px 12px; border-radius: 10px;
  background: rgba(0,0,0,.35); backdrop-filter: blur(4px);
  display: flex; align-items: baseline; gap: 8px;
}
.hud-speed-num {
  font-size: 56px; font-weight: 800; letter-spacing: -0.02em;
  text-shadow: 0 1px 2px rgba(0,0,0,.3);
}
.hud-speed-unit {
  margin-left: 6px; font-size: 14px; opacity: .8; font-weight: 600;
}

.hud-blinkers {
  position: fixed; left: 24px; bottom: 85px; display: flex; gap: 12px;
  color: rgba(255,255,255,.5);
}
.hud-blinker-arrow { width: 28px; height: 28px; opacity: .25; }
.hud-blinker-arrow.active { opacity: .9; color: #7CFF6B; }
.hud-blinker-arrow.blink { opacity: .2; }
.hud-blinker-arrow.left { transform: translateY(0px); }
.hud-blinker-arrow.right { transform: translateY(0px); }

/* Tempomat kontrolka vedle rychloměru */
.hud-cc-indicator {
  display: flex; align-items: center;
  opacity: 0.3; transition: opacity 0.2s ease;
}
.hud-cc-indicator.on {
  opacity: 1.0; color: #7CFF6B; /* zelená když aktivní */
}
.hud-cc-icon {
  width: 24px; height: 24px;
}

/* Zvětšená minimapa s decentním pozadím */
.hud-minimap {
  position: fixed; right: 24px; top: 24px;
  width: 200px; height: 200px; /* Zvětšeno na 200px */
  border-radius: 12px; overflow: hidden;
  background: rgba(0,0,0,.25);
  box-shadow: 0 2px 12px rgba(0,0,0,.35); /* Změněn stín */
  pointer-events: auto;             /* ← umožní wheel */
}
`;
    document.head.appendChild(style);
  }
}