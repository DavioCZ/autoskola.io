// mapLayer.ts — OSM raster s pevnym tile zoomem + retina @2x
const TILE_BASE = 256;
const EARTH_RADIUS = 6378137; // m
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
const INITIAL_RESOLUTION = (2 * Math.PI * EARTH_RADIUS) / TILE_BASE; // m/px na z=0

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

  draw(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, cameraWorldX: number, cameraWorldY: number) {
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

    const pMin = metersToPixels(minMx, maxMy, this.zoom);
    const pMax = metersToPixels(maxMx, minMy, this.zoom);

    const tMinX = Math.floor(pMin.px / TILE_BASE);
    const tMinY = Math.floor(pMin.py / TILE_BASE);
    const tMaxX = Math.floor(pMax.px / TILE_BASE);
    const tMaxY = Math.floor(pMax.py / TILE_BASE);

    // velikost dlaždice ve světě: (256 px * m/px na tomto z) převedeno do world px
    const tileMeters = TILE_BASE * resolutionMetersPerPixel(this.zoom); // metry
    const tileWorldPx = tileMeters * this.worldScale;                   // world pixely

    for (let ty = tMinY - 1; ty <= tMaxY + 1; ty++) {
      for (let tx = tMinX - 1; tx <= tMaxX + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= Math.pow(2, this.zoom) || ty >= Math.pow(2, this.zoom)) continue;

        const key = `${this.zoom}/${tx}/${ty}@${this.dpr >= 1.5 ? '2x' : '1x'}`;
        let img = this.tileCache.get(key);
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.referrerPolicy = 'no-referrer';
          img.decoding = 'async';
          img.src = this.tileUrl(this.zoom, tx, ty, this.dpr);
          this.tileCache.set(key, img);
        }

        const { minx, maxy } = tileBoundsMeters(tx, ty, this.zoom); // levý-horní roh v metrech
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