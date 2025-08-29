// utils/prof.ts
export const prof = (() => {
  const bins: Record<string, number> = {};
  let frames = 0, last = performance.now();
  let fpsEma = 60; // exponential moving average FPS

  function begin(name: string) {
    (bins as any)['__' + name] = performance.now();
  }
  function end(name: string) {
    const t0 = (bins as any)['__' + name];
    if (t0 != null) bins[name] = (bins[name] || 0) + (performance.now() - t0);
  }
  function frame() {
    frames++;
    const now = performance.now();
    const dt = now - last;
    
    // Update EMA FPS každý frame (smooth)
    const instantFps = 1000 / dt;
    fpsEma = fpsEma * 0.9 + instantFps * 0.1; // 10% weight na nový sample
    
    if (dt >= 1000) {
      const total = Object.entries(bins).filter(([k]) => !k.startsWith('__'))
        .reduce((a,[,v]) => a+v, 0);
      const out: Record<string, string> = {};
      for (const [k,v] of Object.entries(bins)) {
        if (k.startsWith('__')) continue;
        out[k] = v.toFixed(2) + ' ms';
        bins[k] = 0;
      }
      out.fps = (frames * 1000 / dt).toFixed(1);
      console.table(out);
      frames = 0; 
    }
    last = now;
  }
  
  function getFpsEma() {
    return fpsEma;
  }
  
  return { begin, end, frame, getFpsEma };
})();