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
  miniRangeMax?: number;          // max oddálení (m) – výchozí 900
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
  private miniOptions = {
    wpm: 10,
    metersAcross: 280,
    courseUp: true,
    showN: false,
    miniRangeMin: 160,
    miniRangeMax: 900
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

    // Initialize minimap options from constructor arguments
    this.miniOptions.wpm = opts.worldScalePxPerMeter ?? 10;
    this.miniOptions.metersAcross = opts.metersAcross ?? 420; // víc oddálené jako default
    this.miniOptions.courseUp = opts.courseUp ?? true;
    this.miniOptions.showN = opts.showNorthIndicator ?? false;
    this.miniOptions.miniRangeMin = opts.miniRangeMin ?? 160;
    this.miniOptions.miniRangeMax = opts.miniRangeMax ?? 900;

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

      // Wheel zoom jen pro minimapu (nezávislý na hlavním světě)
      this.mini.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1/1.1 : 1.1; // nahoru přiblíží, dolů oddálí
        const next = this.miniOptions.metersAcross * factor;
        this.miniOptions.metersAcross = Math.min(this.miniOptions.miniRangeMax, Math.max(this.miniOptions.miniRangeMin, next));
      }, { passive: false });

      const drawMini = () => {
        const ctx = this.miniCtx!;
        const DPR = devicePixelRatio || 1;
        const W = this.mini!.width, H = this.mini!.height;

        // Výpočet měřítka: chceme, aby přes šířku okna bylo N metrů
        const metersAcross = this.miniOptions.metersAcross;
        const worldPxAcross = metersAcross * this.miniOptions.wpm;

        // Kolik canvas px připadá na 1 world px
        const scale = W / worldPxAcross;

        // Data hráče
        const player = opts.getPlayer!();
        const px = player.position.x;
        const py = player.position.y;

        // TRASA – sběr bodu a ořez
        if (trailEnabled) {
          // pokud „teleport" (> 200 m), trail smaž a začni znovu
          const jumpMeters = 200;
          const last = this.trail[this.trail.length - 1];
          if (last && (Math.hypot(px - last.x, py - last.y) > jumpMeters * this.miniOptions.wpm)) {
            this.trail = [];
          }
          this.pushTrailPoint(px, py);
          this.trimTrailByMeters();
        }

        // Podklad UI
        ctx.save();
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle = '#0f1114';
        ctx.fillRect(0,0,W,H);

        // Zaoblený klip
        const r = 16 * DPR;
        this.roundRect(ctx, 0,0,W,H,r); ctx.clip();

        // Transformace: střed → hráč, měřítko, course-up
        ctx.translate(W/2, H/2);
        ctx.scale(scale, scale);
        if (this.miniOptions.courseUp) {
          // SPRÁVNĚ (nahoru = směr jízdy): přičteme π/2 k úhlu hráče
          ctx.rotate(-(player.angle + Math.PI / 2));
        }
        ctx.translate(-px, -py);

        // OVERSCAN: dlaždice kresli přes větší AABB, aby rotace neusekla rohy
        const overscan = Math.SQRT2;                 // ~1.414 pokryje libovolný úhel
        const viewW = (W / scale) * overscan;        // world px
        const viewH = (H / scale) * overscan;        // world px

        // Odbarvený raster podkladu
        ctx.save();
        ctx.globalAlpha = 0.38;
        // některé prohlížeče filter nemají; když ne, nic se nestane
        try { (ctx as any).filter = 'grayscale(100%) brightness(1.12) contrast(0.92)'; } catch {}
        opts.mapLayer.draw(ctx, viewW, viewH, px, py);
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

// --- MARKER AUTA: kreslit v UI souřadnicích (ne v otočené mapě) ---
{
  // reset transformace -> kreslíme v pixelech canvasu
  ctx.setTransform(1,0,0,1,0,0);

  const DPR = devicePixelRatio || 1;
  const W = this.mini!.width, H = this.mini!.height;

  // Mírný posun „dopředu", jako v navigacích (volitelné)
  const forwardBiasPx = 10 * DPR;     // posuň marker o pár px nahoru v okně
  const cx = W / 2;
  const cy = H / 2 + forwardBiasPx;

  // pevná velikost v pixelech, nezávislá na měřítku minimapy
  const s = 24 * DPR;

  ctx.save();
  ctx.translate(cx, cy);
  // Šipka vždy míří NAHORU (course-up), proto žádná rotace tady!
  ctx.fillStyle = '#ff3355';
  ctx.strokeStyle = 'rgba(0,0,0,.7)';
  ctx.lineWidth = Math.max(1.5*DPR, 2);
  ctx.beginPath();
  ctx.moveTo(0, -0.60 * s);          // špička
  ctx.lineTo( 0.36 * s, 0.50 * s);   // pravý spodek
  ctx.lineTo( 0,        0.22 * s);   // střed spodku
  ctx.lineTo(-0.36 * s, 0.50 * s);   // levý spodek
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

        // Kompas N
        if (this.miniOptions.courseUp && this.miniOptions.showN) { // Přidána podmínka pro showN
          ctx.setTransform(1,0,0,1,0,0);
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = 0.85;
          ctx.font = `${12*DPR}px system-ui`;
          ctx.fillText('N', W - 20*DPR, 18*DPR);
        }

        // Rámeček
        ctx.setTransform(1,0,0,1,0,0);
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 2*DPR;
        this.roundRect(ctx, 0,0,W,H,r); ctx.stroke();

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
    const minWorld = this.trailSampleMinMeters * this.miniOptions.wpm; // v „world px"
    if (!last || Math.hypot(dx, dy) >= minWorld) {
      this.trail.push({ x: px, y: py });
    }
  }

  private trimTrailByMeters() {
    if (this.trail.length < 2) return;
    const maxWorld = this.trailMaxMeters * this.miniOptions.wpm;
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