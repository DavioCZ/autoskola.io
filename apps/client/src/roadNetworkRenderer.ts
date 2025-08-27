import { ClientRoadNetwork } from './roadNetwork';
import type { Lane, Intersection } from '@shared/road-network';

/**
 * Renders road network overlay on game canvas
 */
export class RoadNetworkRenderer {
  private roadNetwork: ClientRoadNetwork;
  private showLanes = true;
  private showIntersections = true;
  private showCurrentLane = true;
  
  constructor(roadNetwork: ClientRoadNetwork) {
    this.roadNetwork = roadNetwork;
  }
  
  /**
   * Draw road network overlay
   */
  draw(ctx: CanvasRenderingContext2D, mapLayer: any, zoom: number) {
    const state = this.roadNetwork.getLoadingState();
    
    if (state.isLoading) {
      this.drawLoadingIndicator(ctx);
      return;
    }
    
    if (state.error) {
      this.drawError(ctx, state.error);
      return;
    }
    
    if (!state.isLoaded) return;
    
    if (this.showLanes) {
      this.drawLanes(ctx, mapLayer, zoom);
    }
    
    if (this.showIntersections) {
      this.drawIntersections(ctx, mapLayer, zoom);
    }
  }
  
  /**
   * Draw all lanes
   */
  private drawLanes(ctx: CanvasRenderingContext2D, mapLayer: any, zoom: number) {
    const lanes = this.roadNetwork.getAllLanes();
    
    for (const lane of lanes) {
      this.drawLane(ctx, lane, mapLayer, zoom);
    }
  }
  
  /**
   * Draw single lane
   */
  private drawLane(ctx: CanvasRenderingContext2D, lane: Lane, mapLayer: any, zoom: number) {
    if (lane.poly.length < 2) return;
    
    // Convert GPS coordinates to world coordinates
    const worldPoints = lane.poly.map(([lon, lat]) => {
      return mapLayer.lonLatToWorld(lon, lat);
    });
    
    // Lane color based on type
    let color = '#4CAF50'; // Green for general
    let width = 2;
    
    switch (lane.type) {
      case 'bus': color = '#FF9800'; width = 3; break;    // Orange
      case 'bike': color = '#2196F3'; width = 2; break;   // Blue  
      case 'tram': color = '#9C27B0'; width = 4; break;   // Purple
    }
    
    // Draw lane centerline
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width / zoom; // Scale with zoom
    ctx.setLineDash([]);
    
    ctx.beginPath();
    ctx.moveTo(worldPoints[0].x, worldPoints[0].y);
    
    for (let i = 1; i < worldPoints.length; i++) {
      ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
    }
    
    ctx.stroke();
    
    // Draw direction arrow at midpoint
    if (worldPoints.length >= 2) {
      const midIdx = Math.floor(worldPoints.length / 2);
      const p1 = worldPoints[midIdx - 1] || worldPoints[midIdx];
      const p2 = worldPoints[midIdx];
      
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      this.drawArrow(ctx, p2.x, p2.y, angle, 8 / zoom, color);
    }
    
    // Draw stop line if exists
    if (lane.stopLine) {
      const [start, end] = lane.stopLine;
      const startWorld = mapLayer.lonLatToWorld(start[0], start[1]);
      const endWorld = mapLayer.lonLatToWorld(end[0], end[1]);
      
      ctx.strokeStyle = '#F44336'; // Red
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      
      ctx.beginPath();
      ctx.moveTo(startWorld.x, startWorld.y);
      ctx.lineTo(endWorld.x, endWorld.y);
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  /**
   * Draw intersections
   */
  private drawIntersections(ctx: CanvasRenderingContext2D, mapLayer: any, zoom: number) {
    const intersections = this.roadNetwork.getAllIntersections();
    
    for (const intersection of intersections) {
      // Find center point from incoming lanes
      if (intersection.incoming.length === 0) continue;
      
      const lanes = this.roadNetwork.getAllLanes();
      const incomingLanes = lanes.filter(l => intersection.incoming.includes(l.id));
      
      if (incomingLanes.length === 0) continue;
      
      // Use end point of first incoming lane as intersection center
      const firstLane = incomingLanes[0];
      const lastPoint = firstLane.poly[firstLane.poly.length - 1];
      const center = mapLayer.lonLatToWorld(lastPoint[0], lastPoint[1]);
      
      this.drawIntersection(ctx, intersection, center, zoom);
    }
  }
  
  /**
   * Draw single intersection
   */
  private drawIntersection(ctx: CanvasRenderingContext2D, intersection: Intersection, center: {x: number, y: number}, zoom: number) {
    let color = '#757575'; // Gray for uncontrolled
    let radius = 12;
    
    switch (intersection.control) {
      case 'signals': color = '#FF5722'; radius = 16; break;     // Red for traffic lights
      case 'stop': color = '#F44336'; radius = 14; break;        // Red for stop
      case 'give_way': color = '#FF9800'; radius = 12; break;    // Orange for give way
      case 'roundabout': color = '#3F51B5'; radius = 20; break;  // Blue for roundabout
      case 'priority': color = '#4CAF50'; radius = 14; break;    // Green for priority road
    }
    
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2 / zoom;
    
    // Draw circle
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Draw control type indicator
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${8 / zoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let symbol = '?';
    switch (intersection.control) {
      case 'signals': symbol = '🚦'; break;
      case 'stop': symbol = '🛑'; break;
      case 'give_way': symbol = '⚠️'; break;
      case 'roundabout': symbol = '🔄'; break;
      case 'priority': symbol = '📍'; break;
    }
    
    ctx.fillText(symbol, center.x, center.y);
    
    ctx.restore();
  }
  
  /**
   * Draw arrow
   */
  private drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size/2, -size/2);
    ctx.lineTo(-size/2, size/2);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
  
  /**
   * Draw loading indicator
   */
  private drawLoadingIndicator(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 200, 40);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px Arial';
    ctx.fillText('🚀 Loading road network...', 20, 35);
    ctx.restore();
  }
  
  /**
   * Draw error message
   */
  private drawError(ctx: CanvasRenderingContext2D, error: string) {
    ctx.save();
    ctx.fillStyle = 'rgba(244, 67, 54, 0.9)';
    ctx.fillRect(10, 10, 300, 60);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Arial';
    ctx.fillText('❌ Road network error:', 20, 30);
    ctx.fillText(error.substring(0, 35), 20, 50);
    ctx.restore();
  }
  
  /**
   * Highlight current lane
   */
  drawCurrentLane(ctx: CanvasRenderingContext2D, lane: Lane | null, mapLayer: any, zoom: number) {
    if (!lane || !this.showCurrentLane) return;
    
    // Draw highlighted version of current lane
    if (lane.poly.length < 2) return;
    
    const worldPoints = lane.poly.map(([lon, lat]) => {
      return mapLayer.lonLatToWorld(lon, lat);
    });
    
    ctx.save();
    ctx.strokeStyle = '#FFEB3B'; // Bright yellow
    ctx.lineWidth = 6 / zoom;
    ctx.setLineDash([10 / zoom, 5 / zoom]);
    
    ctx.beginPath();
    ctx.moveTo(worldPoints[0].x, worldPoints[0].y);
    
    for (let i = 1; i < worldPoints.length; i++) {
      ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
    }
    
    ctx.stroke();
    ctx.restore();
  }
  
  /**
   * Toggle visibility options
   */
  toggleLanes() { this.showLanes = !this.showLanes; }
  toggleIntersections() { this.showIntersections = !this.showIntersections; }
  toggleCurrentLane() { this.showCurrentLane = !this.showCurrentLane; }
}