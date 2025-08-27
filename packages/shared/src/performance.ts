export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private fps = 0;
  private lastFrameTime = 0;
  private frameCount = 0;
  private tickMs = 0;

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startFrame(): void {
    this.lastFrameTime = performance.now();
  }

  public endFrame(): void {
    const now = performance.now();
    this.tickMs = now - this.lastFrameTime;
    this.frameCount++;

    // Vypočítat FPS každou sekundu
    if (now >= this.lastFrameTime + 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  public getFps(): number {
    return this.fps;
  }

  public getTickMs(): number {
    return this.tickMs;
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
