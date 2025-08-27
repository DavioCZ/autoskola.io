import { eventBus } from '@shared/eventBus';

export class DebugOverlay {
  private element: HTMLDivElement;
  private fps = 0;
  private entityCount = 0;
  private vehicleData: any = {};
  private currentLane = 'Off road';
  public showDirectionVectors = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.top = '10px';
    this.element.style.left = '10px';
    this.element.style.color = 'white';
    this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.element.style.padding = '5px';
    this.element.style.display = 'none';
    this.element.style.zIndex = '100';
    this.element.style.fontFamily = 'monospace';
    this.element.style.fontSize = '12px';
    document.body.appendChild(this.element);

    window.addEventListener('keydown', (e) => {
      if (e.key === ';') {
        this.toggle();
        this.showDirectionVectors = !this.showDirectionVectors;
      }
    });

    eventBus.on('update', (dt: number) => {
      this.fps = 1 / dt;
    });

    eventBus.on('entityCount', (count: number) => {
      this.entityCount = count;
    });

    eventBus.on('vehicleUpdate', (data: any) => {
        this.vehicleData = data;
    });

    eventBus.on('currentLane', (lane: string) => {
        this.currentLane = lane;
    });
  }

  public update(): void {
    const speedKmh = (this.vehicleData.speed || 0); // Už je v km/h
    const throttle = (this.vehicleData.throttle || 0).toFixed(2);
    const brake = (this.vehicleData.brake || 0).toFixed(2);
    const steerRaw = (this.vehicleData.steerRaw || 0).toFixed(2);
    const steerInput = (this.vehicleData.steerInput || 0).toFixed(2);
    const steerAngleDeg = (this.vehicleData.steerAngleDeg || 0).toFixed(1);
    const totalDistance = (this.vehicleData.totalDistance || 0);
    const leftBlinker = this.vehicleData.leftBlinker ? 'ON' : 'OFF';
    const rightBlinker = this.vehicleData.rightBlinker ? 'ON' : 'OFF';
    const cruiseControl = this.vehicleData.cruiseControl ? 'ON' : 'OFF';
    const directionVectors = this.showDirectionVectors ? 'ON' : 'OFF';

    // Převod vzdálenosti na km pokud > 1000m
    const distanceDisplay = totalDistance >= 1000 
      ? `${(totalDistance / 1000).toFixed(2)} km` 
      : `${totalDistance.toFixed(1)} m`;

    this.element.innerHTML = `
        FPS: ${this.fps.toFixed(1)}<br>
        Entities: ${this.entityCount}<br>
        <br>
        Speed: ${speedKmh.toFixed(1)} km/h<br>
        Distance: ${distanceDisplay}<br>
        Throttle: ${throttle}<br>
        Brake: ${brake}<br>
        Steer Raw: ${steerRaw}<br>
        Steer Input: ${steerInput}<br>
        Wheel Angle: ${steerAngleDeg}°<br>
        Left Blinker: ${leftBlinker}<br>
        Right Blinker: ${rightBlinker}<br>
        Cruise Control: ${cruiseControl}<br>
        Direction Vectors: ${directionVectors}<br>
        <br>
        <strong>Current Lane:</strong><br>
        ${this.currentLane}<br>
        <br>
        <small>Grid: 1 square = 5m</small><br>
        <em>Keys: L=Lanes, I=Intersections, C=Current</em>
    `;
  }

  private toggle(): void {
    this.element.style.display = this.element.style.display === 'none' ? 'block' : 'none';
  }
}
