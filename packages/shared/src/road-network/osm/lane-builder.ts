import type { OSMWay, OSMNode } from './overpass';
import type { Lane, Vec2, TurnType, LaneType } from '../types';

/**
 * Lane construction utilities
 */
export class LaneBuilder {
  private static readonly DEFAULT_LANE_WIDTH = 3.25; // meters
  
  /**
   * Generate lanes from OSM way with proper offsets
   */
  static buildLanesFromWay(
    way: OSMWay,
    nodes: Map<number, OSMNode>,
    laneInfo: {
      lanesForward: number;
      lanesBackward: number;
      isOneway: boolean;
      turnLanes?: string[];
      maxSpeed?: number;
      width?: number;
    }
  ): Lane[] {
    const centerline = this.wayToPolyline(way, nodes);
    if (centerline.length < 2) return [];
    
    const lanes: Lane[] = [];
    const laneWidth = laneInfo.width ? laneInfo.width / (laneInfo.lanesForward + laneInfo.lanesBackward) : this.DEFAULT_LANE_WIDTH;
    const maxSpeed = laneInfo.maxSpeed || this.getDefaultMaxSpeed(way.tags?.highway || 'unclassified');
    const laneType = this.getLaneType(way.tags || {});
    
    // Forward lanes (traffic direction = +1)
    const forwardOffsets = this.calculateLaneOffsets(laneInfo.lanesForward, laneWidth, 1);
    for (let i = 0; i < laneInfo.lanesForward; i++) {
      const poly = this.offsetPolyline(centerline, forwardOffsets[i]);
      const turnHint = this.extractTurnHint(laneInfo.turnLanes, i);
      
      lanes.push({
        id: `way_${way.id}_fwd_${i}`,
        poly,
        width: laneWidth,
        maxSpeed,
        dir: 1,
        type: laneType,
        fromNode: `node_${way.nodes[0]}`,
        toNode: `node_${way.nodes[way.nodes.length - 1]}`,
        turnHint,
      });
    }
    
    // Backward lanes (traffic direction = -1)
    if (!laneInfo.isOneway) {
      const backwardOffsets = this.calculateLaneOffsets(laneInfo.lanesBackward, laneWidth, -1);
      for (let i = 0; i < laneInfo.lanesBackward; i++) {
        const poly = this.offsetPolyline(centerline, backwardOffsets[i]).reverse();
        
        lanes.push({
          id: `way_${way.id}_bwd_${i}`,
          poly,
          width: laneWidth,
          maxSpeed,
          dir: -1,
          type: laneType,
          fromNode: `node_${way.nodes[way.nodes.length - 1]}`,
          toNode: `node_${way.nodes[0]}`,
        });
      }
    }
    
    return lanes;
  }
  
  /**
   * Convert OSM way to polyline coordinates
   */
  private static wayToPolyline(way: OSMWay, nodes: Map<number, OSMNode>): Vec2[] {
    const polyline: Vec2[] = [];
    
    for (const nodeId of way.nodes) {
      const node = nodes.get(nodeId);
      if (node) {
        polyline.push([node.lon, node.lat]);
      }
    }
    
    return polyline;
  }
  
  /**
   * Calculate lane offset positions from centerline
   */
  private static calculateLaneOffsets(laneCount: number, laneWidth: number, direction: 1 | -1): number[] {
    const offsets: number[] = [];
    
    if (laneCount === 1) {
      offsets.push(direction * laneWidth * 0.5);
    } else {
      const startOffset = direction * laneWidth * 0.5;
      for (let i = 0; i < laneCount; i++) {
        offsets.push(startOffset + direction * i * laneWidth);
      }
    }
    
    return offsets;
  }
  
  /**
   * Offset polyline perpendicular to segments
   */
  private static offsetPolyline(polyline: Vec2[], offset: number): Vec2[] {
    if (polyline.length < 2) return polyline;
    
    const offsetPoly: Vec2[] = [];
    
    for (let i = 0; i < polyline.length; i++) {
      let normal: Vec2;
      
      if (i === 0) {
        // First point - use first segment normal
        normal = this.getSegmentNormal(polyline[0], polyline[1]);
      } else if (i === polyline.length - 1) {
        // Last point - use last segment normal
        normal = this.getSegmentNormal(polyline[i - 1], polyline[i]);
      } else {
        // Middle point - average of adjacent normals
        const normal1 = this.getSegmentNormal(polyline[i - 1], polyline[i]);
        const normal2 = this.getSegmentNormal(polyline[i], polyline[i + 1]);
        normal = [(normal1[0] + normal2[0]) / 2, (normal1[1] + normal2[1]) / 2];
        
        // Normalize
        const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
        if (length > 0) {
          normal = [normal[0] / length, normal[1] / length];
        }
      }
      
      offsetPoly.push([
        polyline[i][0] + normal[0] * offset,
        polyline[i][1] + normal[1] * offset
      ]);
    }
    
    return offsetPoly;
  }
  
  /**
   * Get perpendicular normal vector to line segment (pointing right)
   */
  private static getSegmentNormal(start: Vec2, end: Vec2): Vec2 {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return [0, 1];
    
    // Perpendicular: rotate 90° clockwise
    return [dy / length, -dx / length];
  }
  
  /**
   * Extract turn hint from turn:lanes tag
   */
  private static extractTurnHint(turnLanes: string[] | undefined, laneIndex: number): TurnType | undefined {
    if (!turnLanes || laneIndex >= turnLanes.length) return undefined;
    
    const turns = turnLanes[laneIndex].split(';');
    const primaryTurn = turns[0];
    
    switch (primaryTurn) {
      case 'left': return 'left';
      case 'slight_left': return 'slight_left';
      case 'through': return 'through';
      case 'slight_right': return 'slight_right';
      case 'right': return 'right';
      default: return undefined;
    }
  }
  
  /**
   * Determine lane type from OSM tags
   */
  private static getLaneType(tags: Record<string, string>): LaneType {
    if (tags.busway || tags['vehicle:lanes']?.includes('bus')) return 'bus';
    if (tags.cycleway || tags.highway === 'cycleway') return 'bike';
    if (tags.railway === 'tram') return 'tram';
    return 'general';
  }
  
  /**
   * Get default max speed based on highway type
   */
  private static getDefaultMaxSpeed(highway: string): number {
    const speeds: Record<string, number> = {
      motorway: 36.11,        // 130 km/h
      trunk: 25.0,            // 90 km/h
      primary: 13.89,         // 50 km/h
      secondary: 13.89,       // 50 km/h
      tertiary: 13.89,        // 50 km/h
      unclassified: 13.89,    // 50 km/h
      residential: 8.33,      // 30 km/h
      living_street: 2.78,    // 10 km/h
      service: 5.56,          // 20 km/h
    };
    
    return speeds[highway] || 13.89; // Default 50 km/h
  }
}