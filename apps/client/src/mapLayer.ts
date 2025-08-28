// mapLayer.ts — OSM raster s pevnym tile zoomem + retina @2x
const TILE_BASE = 256;
const EARTH_RADIUS = 6378137; // m
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
const INITIAL_RESOLUTION = (2 * Math.PI * EARTH_RADIUS) / TILE_BASE; // m/px na z=0

type Provider = {
  name: string;
  url: string;                     // {z}/{x}/{y} templata
  sub?: string[];                  // subdomény (a,b,c,d)
  scaleParam?: boolean;            // přidá @2x pro retina
  minZ?: number; maxZ?: number;
};

export const BASEMAPS: Record<string, Provider> = {
  osm:      { name: 'OSM',      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', sub: ['a','b','c'], minZ: 0, maxZ: 19 },
  positron: { name: 'Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{scale}.png', sub: ['a','b','c','d'], scaleParam: true, minZ: 0, maxZ: 20 },
  dark:     { name: 'Dark',     url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{scale}.png',  sub: ['a','b','c','d'], scaleParam: true, minZ: 0, maxZ: 20 },
  wm:       { name: 'WM',       url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', minZ: 0, maxZ: 19 },
};

export type MapLayerOptions = {
  worldScalePxPerMeter: number; // u tebe 10
  zoom: number;                 // Pevně zvolený tile zoom, např. 19 pro detail
  anchorLat: number;
  anchorLon: number;
  tileUrl?: (z: number, x: number, y: number, dpr: number) => string;
};

function lonLatToMeters(lon: number, lat: number) {
  const mx = EARTH_RADIUS * (lon * Math.PI / 180);
  const my = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  return { mx, my };
}

function resolutionMetersPerPixel(zoom: number) {
  return INITIAL_RESOLUTION / Math.pow(2, zoom);
}

function metersToPixels(mx: number, my: number, zoom: number) {
  const res = resolutionMetersPerPixel(zoom);
  const px = (mx + ORIGIN_SHIFT) / res;
  const py = (ORIGIN_SHIFT - my) / res; // Y shora dolů
  return { px, py };
}

function tileBoundsMeters(tx: number, ty: number, zoom: number) {
  const res = resolutionMetersPerPixel(zoom);
  const minx = tx * TILE_BASE * res - ORIGIN_SHIFT;
  const maxy = ORIGIN_SHIFT - ty * TILE_BASE * res;
  const maxx = (tx + 1) * TILE_BASE * res - ORIGIN_SHIFT;
  const miny = ORIGIN_SHIFT - (ty + 1) * TILE_BASE * res;
  return { minx, miny, maxx, maxy };
}

export class MapLayer {
  private zoom: number;
  private worldScale: number;
  private tileUrl: (z: number, x: number, y: number, dpr: number) => string;
  private anchorMeters: { mx0: number; my0: number };
  private mPerWorldPx: number;
  private tileCache = new Map<string, HTMLImageElement>();
  private dpr: number;
  private tileCssSizePx: number; // kolik CSS px má mít dlaždice na plátně
  private tileImagePx: number;   // reálné rozlišení stahované dlaždice
  private providerKey = 'osm';
  private tileZoomBias = 0; // +/- kroky zoomu vůči this.zoom

  constructor(opts: MapLayerOptions) {
    this.worldScale = opts.worldScalePxPerMeter;
    this.zoom = opts.zoom; // pevně zamčený zoom
    this.tileUrl = opts.tileUrl ?? ((z, x, y, dpr) => {
      const suffix = dpr >= 1.5 ? '@2x' : '';
      return `https://tile.openstreetmap.org/${z}/${x}/${y}${suffix}.png`;
    });

    const { mx, my } = lonLatToMeters(opts.anchorLon, opts.anchorLat);
    this.anchorMeters = { mx0: mx, my0: my };
    this.mPerWorldPx = 1 / this.worldScale;

    // Retina podpora: @2x stahujeme, ale vykreslujeme v "fyzické" velikosti
    this.dpr = (globalThis as any).devicePixelRatio || 1;
    this.tileCssSizePx = TILE_BASE;                // 256 CSS px
    this.tileImagePx   = this.dpr >= 1.5 ? 512 : 256; // skutečné px obrázku
  }

  setAnchor(lat: number, lon: number) {
    const { mx, my } = lonLatToMeters(lon, lat);
    this.anchorMeters = { mx0: mx, my0: my };
  }

  setProvider(key: keyof typeof BASEMAPS) {
    if (BASEMAPS[key]) this.providerKey = key;
  }

  setTileZoomBias(bias: number) {
    this.tileZoomBias = Math.round(bias || 0);
  }

  lonLatToWorld(lon: number, lat: number) {
    const { mx, my } = lonLatToMeters(lon, lat);
    const worldX = (mx - this.anchorMeters.mx0) * this.worldScale;
    const worldY = (this.anchorMeters.my0 - my) * this.worldScale; // invert Y
    return { x: worldX, y: worldY };
  }

  worldToLonLat(x: number, y: number) {
    const mx = this.anchorMeters.mx0 + x * this.mPerWorldPx;
    const my = this.anchorMeters.my0 - y * this.mPerWorldPx;
    const lon = (mx / EARTH_RADIUS) * 180 / Math.PI;
    const lat = (2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI;
    return { lon, lat };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    canvasW: number, canvasH: number, cameraWorldX: number, cameraWorldY: number,
    opts?: { tileZoomBias?: number; provider?: keyof typeof BASEMAPS }
  ) {
    const prov = BASEMAPS[opts?.provider ?? this.providerKey];
    const bias = (opts?.tileZoomBias ?? this.tileZoomBias) | 0;
    const z = Math.max(prov.minZ ?? 0, Math.min((prov.maxZ ?? 22), this.zoom + bias));

    // Vypnout rozmazání při zvětšování/změnšování (lepší downsample)
    const prevSmooth = ctx.imageSmoothingEnabled;
    const prevQual = (ctx as any).imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';

    // kamera ve world px -> metry
    const camMetersX = cameraWorldX * this.mPerWorldPx;
    const camMetersY = cameraWorldY * this.mPerWorldPx;

    // absolutní Mercator souřadnice kamery
    const camMx = this.anchorMeters.mx0 + camMetersX;
    const camMy = this.anchorMeters.my0 - camMetersY;

    const halfWm = (canvasW * this.mPerWorldPx) / 2;
    const halfHm = (canvasH * this.mPerWorldPx) / 2;

    const minMx = camMx - halfWm;
    const maxMx = camMx + halfWm;
    const minMy = camMy - halfHm;
    const maxMy = camMy + halfHm;

    const pMin = metersToPixels(minMx, maxMy, z);
    const pMax = metersToPixels(maxMx, minMy, z);

    const tMinX = Math.floor(pMin.px / TILE_BASE);
    const tMinY = Math.floor(pMin.py / TILE_BASE);
    const tMaxX = Math.floor(pMax.px / TILE_BASE);
    const tMaxY = Math.floor(pMax.py / TILE_BASE);

    // URL helper pro provider
    const DPR = (globalThis.devicePixelRatio || 1) >= 1.5 ? 2 : 1;
    const urlFor = (x:number,y:number)=> {
      const s = prov.sub ? prov.sub[(x+y+z) % prov.sub.length] : '';
      const scale = prov.scaleParam && DPR === 2 ? '@2x' : '';
      return prov.url
        .replace('{s}', s)
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
        .replace('{scale}', scale);
    };

    // velikost dlaždice ve světě: (256 px * m/px na tomto z) převedeno do world px
    const tileMeters = TILE_BASE * resolutionMetersPerPixel(z); // metry
    const tileWorldPx = tileMeters * this.worldScale;                   // world pixely

    for (let ty = tMinY - 1; ty <= tMaxY + 1; ty++) {
      for (let tx = tMinX - 1; tx <= tMaxX + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= Math.pow(2, z) || ty >= Math.pow(2, z)) continue;

        const key = `${opts?.provider ?? this.providerKey}:${z}:${tx}:${ty}`;
        let img = this.tileCache.get(key);
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.referrerPolicy = 'no-referrer';
          img.decoding = 'async';
          img.src = urlFor(tx, ty);
          this.tileCache.set(key, img);
        }

        const { minx, maxy } = tileBoundsMeters(tx, ty, z); // levý-horní roh v metrech
        const worldX = (minx - this.anchorMeters.mx0) * this.worldScale;
        const worldY = (this.anchorMeters.my0 - maxy) * this.worldScale;

        // Dlaždici vykreslíme do world velikosti (tileWorldPx), obrázek má 256/512 px
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, worldX, worldY, tileWorldPx, tileWorldPx);
        }
      }
    }

    // vrátit smoothing flagy
    ctx.imageSmoothingEnabled = prevSmooth;
    (ctx as any).imageSmoothingQuality = prevQual;
  }
}