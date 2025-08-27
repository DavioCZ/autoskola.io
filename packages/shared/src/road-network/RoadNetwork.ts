import type { RoadNetwork, Lane, LaneConnector, Intersection, Vec2 } from './types';

/**
 * Road network query and spatial operations
 */
export class RoadNetworkManager {
  private network: RoadNetwork;
  
  constructor(network: RoadNetwork) {
    this.network = network;
  }
  
  /**
   * Find nearest lane to world position
   */
  findNearestLane(worldPos: Vec2, maxDistance = 50): Lane | null {
    let nearestLane: Lane | null = null;
    let minDistance = maxDistance;
    
    for (const lane of Object.values(this.network.lanes)) {
      const distance = this.distanceToPolyline(worldPos, lane.poly);
      if (distance < minDistance) {
        minDistance = distance;
        nearestLane = lane;
      }
    }
    
    return nearestLane;
  }
  
  /**
   * Get all lane connectors for intersection
   */
  getIntersectionConnectors(intersectionId: string): LaneConnector[] {
    const intersection = this.network.intersections[intersectionId];
    if (!intersection) return [];
    
    return intersection.connectors
      .map(id => this.network.laneConnectors[id])
      .filter(Boolean);
  }
  
  /**
   * Check if movement through intersection is allowed
   */
  isMovementAllowed(fromLaneId: string, toLaneId: string): boolean {
    // Find connector between lanes
    const connector = Object.values(this.network.laneConnectors)
      .find(c => c.fromLane === fromLaneId && c.toLane === toLaneId);
    
    return connector?.allowed ?? false;
  }
  
  /**
   * Get conflicting movements for intersection passage
   */
  getConflictingMovements(connectorId: string): string[] {
    const connector = this.network.laneConnectors[connectorId];
    if (!connector) return [];
    
    // Find intersection containing this connector
    const intersection = Object.values(this.network.intersections)
      .find(i => i.connectors.includes(connectorId));
    
    if (!intersection) return [];
    
    // Find rules where this connector conflicts
    const conflicts: string[] = [];
    for (const rule of intersection.rules) {
      if (rule.connectorA === connectorId) {
        conflicts.push(rule.connectorB);
      } else if (rule.connectorB === connectorId) {
        conflicts.push(rule.connectorA);
      }
    }
    
    return conflicts;
  }
  
  /**
   * Calculate distance from point to polyline
   */
  private distanceToPolyline(point: Vec2, polyline: Vec2[]): number {
    if (polyline.length === 0) return Infinity;
    if (polyline.length === 1) {
      return this.distance(point, polyline[0]);
    }
    
    let minDistance = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const segDistance = this.distanceToSegment(point, polyline[i], polyline[i + 1]);
      minDistance = Math.min(minDistance, segDistance);
    }
    
    return minDistance;
  }
  
  /**
   * Distance from point to line segment
   */
  private distanceToSegment(point: Vec2, segStart: Vec2, segEnd: Vec2): number {
    const [px, py] = point;
    const [x1, y1] = segStart;
    const [x2, y2] = segEnd;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      return this.distance(point, segStart);
    }
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
  }
  
  /**
   * Euclidean distance between two points
   */
  private distance(a: Vec2, b: Vec2): number {
    const [ax, ay] = a;
    const [bx, by] = b;
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }
  
  /**
   * Serialize network to JSON
   */
  toJSON(): string {
    return JSON.stringify(this.network, null, 2);
  }
  
  /**
   * Load network from JSON
   */
  static fromJSON(json: string): RoadNetworkManager {
    const network = JSON.parse(json) as RoadNetwork;
    return new RoadNetworkManager(network);
  }
  
  /**
   * Get network bounds for spatial culling
   */
  getBounds() {
    return this.network.bounds;
  }
  
  /**
   * Get network metadata
   */
  getMetadata() {
    return {
      version: this.network.version,
      generatedAt: this.network.generatedAt,
      source: this.network.source,
      stats: {
        lanes: Object.keys(this.network.lanes).length,
        connectors: Object.keys(this.network.laneConnectors).length,
        intersections: Object.keys(this.network.intersections).length,
        crosswalks: Object.keys(this.network.crosswalks).length,
      }
    };
  }
}