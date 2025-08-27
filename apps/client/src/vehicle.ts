import { eventBus } from '@shared/eventBus';
import { Vector2 } from '@shared/types';

// Helpers
const kmh = (ms: number) => ms * 3.6;
const ms = (kmh: number) => kmh / 3.6;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const deg2rad = (d: number) => d * Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

// World scale: 10 pixelů = 1 metr
const WORLD_SCALE = 10;

// Zrychlení (v m/s² - bez world scale)
const MAX_ACCEL   = 2.5;        // m/s^2 plyn (W)
const BRAKE_SOFT  = 4.0;        // m/s^2 jemná (S)
const BRAKE_HARD  = 8.0;        // m/s^2 prudká (Space)
const CRUISE_KP   = 1.2;        // jednoduchý P regulátor

// Tempomat: vypínací práh
const CRUISE_OFF  = ms(10);     // CC se nezapne pod 10 km/h a vypne se, pokud rychlost klesne pod 10

// Rychlosti (bez world scale - v m/s)
const V_MAX_FWD   = ms(135);    // fyzický strop vpřed 135 km/h
const V_MAX_REV   = ms(15);     // strop při couvání 15 km/h
const COAST_DRAG  = 0.30;       // m/s^2 "volnoběh" když nic neděláš
const ZERO_CUTOFF = 0.05;       // m/s -> pod to zastav "na nulu"
const WHEELBASE_M = 2.7;        // m (rozvor)
const WHEELBASE   = WHEELBASE_M * WORLD_SCALE;  // ve world scale

// "mechanika" řízení
const STEER_MECH_MAX        = deg2rad(35);  // víc rejdu pro utažené rohy

// rychlost přetáčení volantu podle rychlosti
const STEER_RATE_LOWSPD     = 5.0;  // rad/s  (do města, manévry)
const STEER_RATE_HISPD      = 3.2;  // rad/s  (vyšší rychlosti, ale stále agilní pro provoz)
const STEER_RETURN_LOWSPD   = 2.2;  // rad/s  (návrat u malých rychlostí)
const STEER_RETURN_HISPD    = 1.6;  // rad/s  (návrat ve vyšších rychlostech, rychlejší)
const A_LAT_LIMIT       = 5.0;          // m/s^2 ≈ 0.51 g (běžná jízda)
const A_LAT_EMERGENCY   = 10.0;         // m/s^2 ≈ 1.02 g (nouzové manévrování - benevolentnější)

// rampování vstupu z kláves
const INPUT_RAMP_UP     = 4.0;          // /s - jak rychle roste |steerInput| při držení
const INPUT_RAMP_RETURN = 2.0;          // /s - jak rychle klesá |steerInput| k nule po puštění

export class Vehicle {
  position: Vector2;
  velocity: Vector2;
  angle: number; // radians
  wheelbase: number;

  acceleration: number;
  braking: number;
  steering: number; // aktuální úhel kol [rad]
  friction: number;
  maxSpeed: number;

  leftBlinker: boolean;
  rightBlinker: boolean;
  cruiseControlSpeed: number | null = null;

  // Měření ujeté vzdálenosti
  totalDistance: number = 0;
  lastPosition: Vector2;

  // Rampovaný vstup řízení
  steerInput: number;     // -1..1

  // Nouzové manévrování
  private hardBrakeTime: number = 0;  // jak dlouho se drží Space

  constructor(x: number, y: number) {
    this.position = new Vector2(x, y);
    this.velocity = new Vector2(0, 0);
    this.angle = 0;

    // SI rozměry
    this.wheelbase = WHEELBASE;

    // "Fyzika" vozu v SI
    this.acceleration = MAX_ACCEL;   // m/s^2
    this.braking = BRAKE_SOFT;       // m/s^2 (čteno z konstant níže)
    this.steering = 0;               // úhel kol [rad]
    this.friction = 0;               // vypnuto, nahrazeno COAST_DRAG
    this.maxSpeed = V_MAX_FWD;       // m/s

    this.leftBlinker = false;
    this.rightBlinker = false;

    // Měření vzdálenosti
    this.totalDistance = 0;
    this.lastPosition = new Vector2(x, y);
    this.steerInput = 0;
    this.hardBrakeTime = 0;
  }

  update(dt: number, input: {
    throttle: number;   // -1..1
    brake: number;      // 0..1
    steer: number;      // -1..1
    leftBlinker: boolean;
    rightBlinker: boolean;
    cruiseControlToggle: boolean;
    hardBrake?: boolean;
  }) {
    // Blinkry
    this.leftBlinker = input.leftBlinker;
    this.rightBlinker = input.rightBlinker;

    // Jednotkový vektor směru
    const fwd = new Vector2(Math.cos(this.angle), Math.sin(this.angle));

    // Podélná rychlost v m/s
    let v = this.velocity.dot(fwd) / WORLD_SCALE;
    const vAbs = Math.abs(v);

    // Sledování času držení hardBrake pro nouzové manévrování
    if (input.hardBrake) {
      this.hardBrakeTime += dt;
    } else {
      this.hardBrakeTime = 0;
    }

    // Rampování vstupu z kláves (digitální A/D -> plynulý -1..1)
    {
      const raw = clamp(input.steer, -1, 1);
      if (raw !== 0) {
        const dir = Math.sign(raw);
        this.steerInput += dir * INPUT_RAMP_UP * dt;
      } else {
        // návrat směrem k nule
        if (this.steerInput > 0) this.steerInput = Math.max(0, this.steerInput - INPUT_RAMP_RETURN * dt);
        else if (this.steerInput < 0) this.steerInput = Math.min(0, this.steerInput + INPUT_RAMP_RETURN * dt);
      }
      this.steerInput = clamp(this.steerInput, -1, 1);
    }

    // 1) Řízení (bicycle) – rychlostní limit kol + speed-adaptivní rate + nouzový režim
    {
      const vAbs = Math.abs(v);

      // Nouzový režim: Space (min 200ms) + řízení = plný mechanický limit pro rychlé vyhnutí
      const emergencyMode = this.hardBrakeTime >= 0.2 && Math.abs(input.steer) > 0.1;

      let deltaMax;
      if (emergencyMode) {
        // Nouzové manévrování: benevolentnější limit podle rychlosti (vyšší A_LAT_EMERGENCY)
        const deltaLatEmergency = vAbs > 0.2
          ? Math.atan((A_LAT_EMERGENCY * WHEELBASE_M) / (vAbs * vAbs))
          : STEER_MECH_MAX;
        deltaMax = Math.min(STEER_MECH_MAX, deltaLatEmergency);
      } else {
        // Běžné řízení: standardní limit úhlu kol podle a_lat
        const deltaLat = vAbs > 0.2
          ? Math.atan((A_LAT_LIMIT * WHEELBASE_M) / (vAbs * vAbs))
          : STEER_MECH_MAX;
        deltaMax = Math.min(STEER_MECH_MAX, deltaLat);
      }

      // rampovaný vstup -> cílový úhel kol
      const target = this.steerInput * deltaMax;

      // rychlost změny rejdu závislá na rychlosti (0…50 km/h)
      const v50 = ms(50);
      const t = clamp(vAbs / v50, 0, 1);
      const steerRate       = lerp(STEER_RATE_LOWSPD,     STEER_RATE_HISPD,     t);
      const steerReturnRate = lerp(STEER_RETURN_LOWSPD,   STEER_RETURN_HISPD,   t);

      // rate limiter: rychlejší návrat do středu
      const sameSignOrZero = (Math.sign(target) === Math.sign(this.steering)) || target === 0;
      const rate = sameSignOrZero ? steerReturnRate : steerRate;
      const step = clamp(target - this.steering, -rate * dt, rate * dt);
      this.steering += step;

      // yawGain: nesahej na poloměr zatáčení, jen potlač kmitání u v≈0
      // nad 0.3 m/s (≈1.1 km/h) je gain = 1 => plná geometrie, ostré rohy půjdou
      const yawGain = vAbs < 0.3 ? (vAbs / 0.3) : 1.0;

      // yaw rate (rad/s)
      const yawRate = v * Math.tan(this.steering) / WHEELBASE_M * yawGain;

      if (vAbs > 0.02) {
        this.angle += yawRate * dt;
      }
    }

    // 2) Tempomat: toggle a úprava cílovky
    if (input.cruiseControlToggle) {
      if (this.cruiseControlSpeed === null) {
        // Zapnout CC na aktuální rychlost, ale jen pokud >= 10 km/h
        const current = Math.abs(v);
        this.cruiseControlSpeed = current >= CRUISE_OFF ? current : null;
      } else {
        // Vypnout CC
        this.cruiseControlSpeed = null;
      }
    }

    // Jemná úprava cílové rychlosti CC přes plyn/brzdu (bez spodní meze)
    if (this.cruiseControlSpeed !== null && (input.brake > 0 || input.throttle !== 0)) {
      const speedChange = input.throttle * 2.8; // ≈10 km/h při plném plynu
      const brakeChange = -input.brake * 2.8;   // ≈10 km/h při plné brzdě
      this.cruiseControlSpeed = this.cruiseControlSpeed + (speedChange + brakeChange) * dt;
      // Horní mez dá rozum, spodní řešíme vypnutím CC
      if (this.cruiseControlSpeed > V_MAX_FWD) this.cruiseControlSpeed = V_MAX_FWD;
      if (this.cruiseControlSpeed < CRUISE_OFF) this.cruiseControlSpeed = null;
    }

    // Prudká brzda CC vypne
    if (input.hardBrake) {
      this.cruiseControlSpeed = null;
    }

    // 3) Podélná akcelerace
    let a = 0;

    if (input.hardBrake) {
      a = -BRAKE_HARD * Math.sign(v || 1);   // prudká brzda ve směru pohybu
    } else if (this.cruiseControlSpeed !== null) {
      // Regulace na cílovou rychlost bez spodní meze
      const target = clamp(this.cruiseControlSpeed, 0, V_MAX_FWD);
      const err = target - Math.abs(v);
      a = clamp(CRUISE_KP * err, -BRAKE_HARD, MAX_ACCEL) * (v >= 0 ? 1 : -1);
    } else if (input.brake > 0) {
      // Jemná brzda – brzdíš ve směru aktuálního pohybu
      const sign = Math.sign(v || 1);
      a = -BRAKE_SOFT * input.brake * sign;
    } else if (input.throttle !== 0) {
      // Plyn vpřed i vzad
      a = MAX_ACCEL * clamp(input.throttle, -1, 1);
    } else if (v !== 0) {
      // Volnoběh – malé zpomalení když nic neděláš
      a = -COAST_DRAG * Math.sign(v);
    }

    // 5) Integrace rychlosti
    let vNext = v + a * dt;

    // Dynamický deadband podle dt (rozumné minimum 0.01 m/s)
    const deadband = Math.max(0.01, 0.5 * MAX_ACCEL * dt);

    // Anti-flip kolem nuly používej jen když už se hýbeš
    if (v !== 0 && (v * vNext < 0) && Math.abs(vNext) < deadband) {
      vNext = 0;
    }

    // Pokud skutečná rychlost spadne pod 10 km/h, CC vypni
    if (this.cruiseControlSpeed !== null && Math.abs(vNext) < CRUISE_OFF) {
      this.cruiseControlSpeed = null;
    }

    // 6) Limity rychlosti vpřed/vzad
    vNext = clamp(vNext, -V_MAX_REV, this.maxSpeed);

    // 7) "Zastav" jen když NEDRŽÍŠ plyn/brzdu ani CC
    const noInput = (input.throttle === 0 && input.brake === 0 && !input.hardBrake && this.cruiseControlSpeed === null);
    if (noInput && Math.abs(vNext) < deadband) {
      vNext = 0;
    }

    // 8) Aktualizace vektoru rychlosti podle nové orientace (převod na world scale)
    const newFwd = new Vector2(Math.cos(this.angle), Math.sin(this.angle));
    this.velocity = newFwd.multiply(vNext * WORLD_SCALE);

    // 9) Pozice (velocity už je ve world scale)
    this.position.add(this.velocity.clone().multiply(dt));

    // 10) Měření ujeté vzdálenosti (převod z world scale pixelů na metry)
    const dx = this.position.x - this.lastPosition.x;
    const dy = this.position.y - this.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy) / WORLD_SCALE;  // metry
    this.totalDistance += distance;
    this.lastPosition = this.position.clone();

    // Telemetrie
    eventBus.emit('vehicleUpdate', {
      speed: kmh(Math.abs(vNext)),
      throttle: input.throttle,
      brake: input.brake,
      steerRaw: input.steer,
      steerInput: this.steerInput,
      steerAngleDeg: this.steering * 180/Math.PI,
      leftBlinker: this.leftBlinker,
      rightBlinker: this.rightBlinker,
      cruiseControl: this.cruiseControlSpeed !== null,
      cruiseTargetKmh: this.cruiseControlSpeed ? kmh(this.cruiseControlSpeed) : null,
      totalDistance: this.totalDistance,
    });
  }

  // Brzdná dráha pro UI
  getStoppingDistance(decel: number = BRAKE_SOFT, reactionSec: number = 1): number {
    const speedMs = Math.abs(this.velocity.dot(new Vector2(Math.cos(this.angle), Math.sin(this.angle)))) / WORLD_SCALE;
    return speedMs * reactionSec + (speedMs * speedMs) / (2 * decel);
  }
}
