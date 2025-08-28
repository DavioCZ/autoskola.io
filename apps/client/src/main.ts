import { DebugOverlay } from './debug';
import { eventBus } from '@shared/eventBus';
import { InputManager } from './input';
import { Vehicle } from './vehicle';
import { Camera } from './camera';
import { MapLayer } from './mapLayer';
import { HUD } from './hud';
// TODO: Uncomment when build is fixed
// import { ClientRoadNetwork } from './roadNetwork';
// import { RoadNetworkRenderer } from './roadNetworkRenderer';

// --------- Zoom nastavení (omezené a plynulé) ----------
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 1.1;      // jeden "cvak" kolečka
const ZOOM_SMOOTH = 10;     // jak rychle se skutečný zoom blíží k cíli

let zoom = 1;               // aktuální vizuální zoom
let targetZoom = 1;         // cílový zoom po kolečku

// Pevný tile zoom (pro konzistentní šířky ulic)
const BASE_MAP_ZOOM = 19;   // vyšší = víc detailů, ale větší dlaždice

// --- Blinkery: společný timer a auto-cancel parametry ---
const BLINK_HZ = 1.5;        // cca 90/min
let blinkTimer = 0;
let blinkOn = false;

const deg2rad = (d:number)=> d*Math.PI/180;
const angleDiff = (a:number,b:number)=>{
  let d=a-b; while(d> Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI; return d;
};

// Auto-cancel: co považujeme za "hotovou" zatáčku
const AUTO_TURN_MIN_ANGLE = deg2rad(45); // min změna směru
const AUTO_TURN_MIN_DIST  = 10;          // min ujetá vzdálenost v metrech
const ARM_STEER           = deg2rad(12); // kdy "ozbrojit" (výrazně vytočené)
const RETURN_STEER        = deg2rad(8);  // vypnout, když se vrátí k rovně
const ARM_SPEED_MS        = 0.5;         // min rychlost pro armování (m/s)

// Stav automatiky blinkrů
type Side = 'left'|'right'|null;
const signalAuto = {
  side: null as Side,
  armed: false,
  armAngle: 0,
  armPos: {x:0,y:0},
};
// -------------------------------------------------------

const debugOverlay = new DebugOverlay();
const inputManager = new InputManager();

// Canvas - fullscreen
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

// Fullscreen canvas
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.zIndex = '0';

// Set canvas size to window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Handle window resize
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// Remove body margins/padding
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';

// World scale: 10 px = 1 m (souhlas s vehicle.ts a mapLayer.ts)
const WORLD_SCALE = 10;

// Start GPS
const START_LAT = 50.07125563788479;
const START_LON = 14.39957382125998;

const mapLayer = new MapLayer({
  worldScalePxPerMeter: WORLD_SCALE,
  zoom: BASE_MAP_ZOOM,
  anchorLat: START_LAT,
  anchorLon: START_LON,
});

// Spawn hráče na GPS
const startWorld = mapLayer.lonLatToWorld(START_LON, START_LAT);
const player = new Vehicle(startWorld.x, startWorld.y);
const camera = new Camera(player);

// TODO: Re-enable when road network build is fixed
// const roadNetwork = new ClientRoadNetwork();
// const roadNetworkRenderer = new RoadNetworkRenderer(roadNetwork);
// roadNetwork.loadPragueNetwork().catch(err => console.error('Failed to load road network:', err));

// HUD with mini-map
const hud = new HUD({
  enableMiniMap: true,
  mapLayer,
  getPlayer: () => ({ position: player.position, angle: player.angle }),
  worldScalePxPerMeter: WORLD_SCALE,
  metersAcross: 600,
  miniRangeMin: 200,
  miniRangeMax: 3000,
  courseUp: true,
  showNorthIndicator: false,
  trailEnabled: true
});

const entities = [player];
let lastTime = 0;

// Wheel zoom handler (omezený, kolem středu obrazovky)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  // Cíl zoomu
  const factor = e.deltaY < 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
  targetZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom * factor));
}, { passive: false });

// TODO: Re-enable when road network is fixed
// window.addEventListener('keydown', (e) => {
//   if (e.code === 'KeyL') { roadNetworkRenderer.toggleLanes(); console.log('🛣️ Lanes visibility toggled'); }
//   if (e.code === 'KeyI') { roadNetworkRenderer.toggleIntersections(); console.log('🚦 Intersections visibility toggled'); }
//   if (e.code === 'KeyC') { roadNetworkRenderer.toggleCurrentLane(); console.log('💛 Current lane highlight toggled'); }
// });

// ---- GAME LOOP ----
function gameLoop(timestamp: number) {
  const dt = (timestamp - lastTime) / 1000 || 0;
  lastTime = timestamp;

  // Aktualizace blinkeru – jednotná fáze pro všechno
  blinkTimer += dt;
  blinkOn = (Math.floor(blinkTimer * BLINK_HZ) % 2) === 0;
  eventBus.emit('blinkPhase', blinkOn);

  // Plynulý zoom
  zoom += (targetZoom - zoom) * ZOOM_SMOOTH * dt;

  // Input
  const forward = inputManager.isPressed('KeyW') ? 1 : 0;
  const backward = inputManager.isPressed('KeyS') ? 1 : 0;
  const throttle = forward - backward;          // W=+1, S=-1 (reverse)
  const brake = 0;                               // Space je hardBrake, S už ne
  const steer = inputManager.getAxis('KeyD', 'KeyA');
  const hardBrake = inputManager.isPressed('Space');

  // Update
  player.update(dt, {
    throttle,
    brake,
    steer,
    leftBlinker: inputManager.leftBlinker,
    rightBlinker: inputManager.rightBlinker,
    cruiseControlToggle: inputManager.cruiseControlToggle,
    hardBrake,
  });

  if (inputManager.cruiseControlToggle) inputManager.cruiseControlToggle = false;

  // Kamera sleduje hráče (žádné offsety – zoom je kolem středu)
  camera.update();

  // Auto-cancel logika blinkrů
  {
    // Urči aktivní stranu (neřešíme "výstražná" obě najednou)
    const left = inputManager.leftBlinker;
    const right = inputManager.rightBlinker;
    const active: Side = left && !right ? 'left' : (right && !left ? 'right' : null);

    // Rychlost (m/s) a vzdálenosti z world px
    const speedMs = Math.hypot(player.velocity.x, player.velocity.y) / WORLD_SCALE;

    // 1) Start/stop monitoringu podle změny stavu
    if (active !== signalAuto.side) {
      // Stav se změnil: reset/nové armování
      signalAuto.side = active;
      signalAuto.armed = false;
      if (active) {
        signalAuto.armAngle = player.angle;
        signalAuto.armPos = { x: player.position.x, y: player.position.y };
      }
    }

    // 2) Armování: začneme "počit" odbočku až když volant fakt vytočíš
    if (signalAuto.side && !signalAuto.armed) {
      const steer = (player as any).steering; // [rad], kladné = doprava (ve tvém modelu)
      const correctSign = signalAuto.side === 'left' ? (steer < 0) : (steer > 0);
      if (speedMs > ARM_SPEED_MS && correctSign && Math.abs(steer) > ARM_STEER) {
        signalAuto.armed = true;
        signalAuto.armAngle = player.angle;
        signalAuto.armPos = { x: player.position.x, y: player.position.y };
      }
    }

    // 3) Auto-cancel: splní-li se úhel, vzdálenost a návrat volantu, vypni
    if (signalAuto.side && signalAuto.armed) {
      const dx = (player.position.x - signalAuto.armPos.x) / WORLD_SCALE;
      const dy = (player.position.y - signalAuto.armPos.y) / WORLD_SCALE;
      const dist = Math.hypot(dx, dy);

      // Směrová změna se hodnotí "ve prospěch" zvolené strany
      const rawDelta = angleDiff(player.angle, signalAuto.armAngle);
      const signedDelta = signalAuto.side === 'left' ? -rawDelta : rawDelta; // tvůj steering je vlevo záporný
      const deltaOk = signedDelta >= AUTO_TURN_MIN_ANGLE;
      const distOk = dist >= AUTO_TURN_MIN_DIST;
      const returned = Math.abs((player as any).steering) <= RETURN_STEER;

      if (deltaOk && distOk && returned) {
        if (signalAuto.side === 'left') inputManager.leftBlinker = false;
        if (signalAuto.side === 'right') inputManager.rightBlinker = false;
        signalAuto.side = null;
        signalAuto.armed = false;
      }
    }
  }

  // Tile zoom je už zamčený v MapLayer, nepřepínáme ho

  // Draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Transform pořadí: přesun na střed, scale, pak posun o kameru
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.position.x, -camera.position.y);

  // 1) OSM podklad v "world" souřadnicích
  mapLayer.draw(ctx, canvas.width / zoom, canvas.height / zoom, camera.position.x, camera.position.y);

  // TODO: Re-enable when road network is fixed
  // roadNetworkRenderer.draw(ctx, mapLayer, zoom);
  // const currentLane = roadNetwork.findNearestLane(player.position.x, player.position.y, mapLayer);
  // roadNetworkRenderer.drawCurrentLane(ctx, currentLane, mapLayer, zoom);

  // 2) Mřížka pouze v debug módu
  if (debugOverlay.showDirectionVectors) {
    drawGrid(ctx);
  }

  // 3) Auto
  ctx.save();
  ctx.translate(player.position.x, player.position.y);
  ctx.rotate(player.angle);
  
  // Tělo vozidla
  ctx.fillStyle = 'red';
  ctx.fillRect(-25, -15, 50, 30);  // 5m × 3m (10 px = 1 m)
  
  // Blinkry na vozidle: outline + fill + glow, vždy čitelné
  {
    const showLeft  = !!inputManager.leftBlinker;
    const showRight = !!inputManager.rightBlinker;

    if ((showLeft || showRight) && blinkOn) {
      const halfL = 25; // půlka délky
      const halfW = 15; // půlka šířky
      const r = 5;      // poloměr lampy (px)

      // Lokální souřadnice rohů (po rotate je to "ve směru jízdy")
      const FL: [number, number] = [ +halfL, -halfW ];
      const FR: [number, number] = [ +halfL, +halfW ];
      const RL: [number, number] = [ -halfL, -halfW ];
      const RR: [number, number] = [ -halfL, +halfW ];

      const drawLamp = (x:number, y:number)=>{
        // tlustý tmavý obrys podle zoomu
        ctx.save();
        ctx.lineWidth = Math.max(2, 2/zoom);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.fillStyle = '#FFC400'; // amber

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        // jemná záře, která se prosadí i na světlém podkladu
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(x, y, r*0.3, x, y, r*2.2);
        g.addColorStop(0, 'rgba(255, 200, 50, 0.75)');
        g.addColorStop(1, 'rgba(255, 200, 50, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r*2.2, 0, Math.PI*2);
        ctx.fill();
        ctx.globalCompositeOperation = prevOp;

        ctx.restore();
      };

      if (showLeft)  { drawLamp(FL[0], FL[1]); drawLamp(RL[0], RL[1]); }
      if (showRight) { drawLamp(FR[0], FR[1]); drawLamp(RR[0], RR[1]); }
    }
  }
  
  ctx.restore();

  // Debug směrové vektory
  if (debugOverlay.showDirectionVectors) {
    drawDirectionVectors(ctx, player);
  }

  ctx.restore();

  // Debug overlay (po restore, takže není zoomovaný)
  eventBus.emit('update', dt);
  eventBus.emit('entityCount', entities.length);
  
  // TODO: Re-enable when road network is fixed
  // if (currentLane) {
  //   eventBus.emit('currentLane', `${currentLane.type} | ${(currentLane.maxSpeed * 3.6).toFixed(0)}km/h | ${currentLane.width.toFixed(1)}m`);
  // } else {
    eventBus.emit('currentLane', 'Road network disabled');
  // }
  
  debugOverlay.update();

  requestAnimationFrame(gameLoop);
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1 / zoom; // ať je čitelná při zoomu
  const gridSize = 50; // 5 m (protože 10 px = 1 m)
  for (let x = -4000; x < 4000; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, -4000);
    ctx.lineTo(x, 4000);
    ctx.stroke();
  }
  for (let y = -4000; y < 4000; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(-4000, y);
    ctx.lineTo(4000, y);
    ctx.stroke();
  }
}

function drawDirectionVectors(ctx: CanvasRenderingContext2D, vehicle: Vehicle) {
  const lineLength = 80;   // 8 m
  const wheelOffset = 13.5; // 1.35 m (polovina wheelbase 2.7 m) * 10 px/m

  ctx.save();
  ctx.translate(vehicle.position.x, vehicle.position.y);

  // směr vozidla (červeně)
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 3 / zoom; // ať je čára čitelná i při zoomu
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(lineLength * Math.cos(vehicle.angle), lineLength * Math.sin(vehicle.angle));
  ctx.stroke();

  // směr předních kol (zeleně)
  const frontWheelDirection = vehicle.angle + (vehicle as any).steering;
  const frontAxleX = wheelOffset * Math.cos(vehicle.angle);
  const frontAxleY = wheelOffset * Math.sin(vehicle.angle);

  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2 / zoom;
  ctx.beginPath();
  ctx.moveTo(frontAxleX, frontAxleY);
  ctx.lineTo(
    frontAxleX + lineLength * Math.cos(frontWheelDirection),
    frontAxleY + lineLength * Math.sin(frontWheelDirection)
  );
  ctx.stroke();

  ctx.restore();
}

requestAnimationFrame(gameLoop);
