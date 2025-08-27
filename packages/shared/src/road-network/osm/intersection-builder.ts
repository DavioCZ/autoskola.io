import type { OSMNode, OSMWay } from './overpass';
import type { Lane, LaneConnector, Intersection, RightOfWayRule, ControlType, Vec2 } from '../types';

/**
 * Intersection and connector construction
 */
export class IntersectionBuilder {
  
  /**
   * Find intersection candidates from topology (degree >= 3 nodes)
   */
  static findIntersectionNodes(ways: OSMWay[], nodes: Map<number, OSMNode>): OSMNode[] {
    const nodeUsage = new Map<number, number>();
    
    // Count how many ways use each node
    for (const way of ways) {
      for (const nodeId of way.nodes) {
        nodeUsage.set(nodeId, (nodeUsage.get(nodeId) || 0) + 1);
      }
    }
    
    // Nodes used by 3+ ways are intersection candidates
    const intersectionNodes: OSMNode[] = [];
    for (const [nodeId, usage] of nodeUsage) {
      if (usage >= 3) {
        const node = nodes.get(nodeId);
        if (node) {
          intersectionNodes.push(node);
        }
      }
    }
    
    return intersectionNodes;
  }
  
  /**
   * Build intersection model with connectors and rules
   */
  static buildIntersection(
    intersectionNode: OSMNode,
    incomingLanes: Lane[],
    outgoingLanes: Lane[],
    nodes: Map<number, OSMNode>
  ): { intersection: Intersection; connectors: LaneConnector[] } {
    
    const connectors = this.generateConnectors(incomingLanes, outgoingLanes, intersectionNode);
    const control = this.determineControlType(intersectionNode, nodes);
    const rules = this.generateRightOfWayRules(connectors, control);
    
    const intersection: Intersection = {
      id: `intersection_${intersectionNode.id}`,
      incoming: incomingLanes.map(l => l.id),
      outgoing: outgoingLanes.map(l => l.id),
      connectors: connectors.map(c => c.id),
      control,
      rules,
    };
    
    return { intersection, connectors };
  }
  
  /**
   * Generate allowed lane connectors through intersection
   */
  private static generateConnectors(
    incomingLanes: Lane[],
    outgoingLanes: Lane[],
    intersectionNode: OSMNode
  ): LaneConnector[] {
    
    const connectors: LaneConnector[] = [];
    const centerPoint: Vec2 = [intersectionNode.lon, intersectionNode.lat];
    
    for (const inLane of incomingLanes) {
      for (const outLane of outgoingLanes) {
        if (!this.isTurnFeasible(inLane, outLane, centerPoint)) continue;
        
        const path = this.generateConnectorPath(inLane, outLane, centerPoint);
        const allowed = this.isMovementAllowed(inLane, outLane);
        
        connectors.push({
          id: `connector_${inLane.id}_to_${outLane.id}`,
          fromLane: inLane.id,
          toLane: outLane.id,
          path,
          allowed,
        });
      }
    }
    
    return connectors;
  }
  
  /**
   * Check if turn between lanes is geometrically feasible
   */
  private static isTurnFeasible(inLane: Lane, outLane: Lane, centerPoint: Vec2): boolean {
    // Get lane end/start vectors
    const inEnd = inLane.poly[inLane.poly.length - 1];
    const inSecondLast = inLane.poly[inLane.poly.length - 2];
    const outStart = outLane.poly[0];
    const outSecond = outLane.poly[1];
    
    if (!inSecondLast || !outSecond) return false;
    
    // Calculate approach and departure angles
    const approachAngle = Math.atan2(inEnd[1] - inSecondLast[1], inEnd[0] - inSecondLast[0]);
    const departureAngle = Math.atan2(outSecond[1] - outStart[1], outSecond[0] - outStart[0]);
    
    // Angle difference (-π to π)
    let angleDiff = departureAngle - approachAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Allow turns within reasonable range (not U-turns)
    const maxTurnAngle = Math.PI * 0.75; // 135 degrees
    return Math.abs(angleDiff) <= maxTurnAngle;
  }
  
  /**
   * Generate smooth path through intersection
   */
  private static generateConnectorPath(inLane: Lane, outLane: Lane, centerPoint: Vec2): Vec2[] {
    const inEnd = inLane.poly[inLane.poly.length - 1];
    const outStart = outLane.poly[0];
    
    // Simple straight line for now - could be improved with bezier curves
    return [inEnd, centerPoint, outStart];
  }
  
  /**
   * Check movement restrictions from OSM turn: tags
   */
  private static isMovementAllowed(inLane: Lane, outLane: Lane): boolean {
    // Check turn hint compatibility
    if (inLane.turnHint) {
      const turnAngle = this.calculateTurnAngle(inLane, outLane);
      return this.turnHintMatches(inLane.turnHint, turnAngle);
    }
    
    return true; // Default allow if no restrictions
  }
  
  /**
   * Calculate turn angle between lanes
   */
  private static calculateTurnAngle(inLane: Lane, outLane: Lane): number {
    const inEnd = inLane.poly[inLane.poly.length - 1];
    const inSecondLast = inLane.poly[inLane.poly.length - 2] || inEnd;
    const outStart = outLane.poly[0];
    const outSecond = outLane.poly[1] || outStart;
    
    const inAngle = Math.atan2(inEnd[1] - inSecondLast[1], inEnd[0] - inSecondLast[0]);
    const outAngle = Math.atan2(outSecond[1] - outStart[1], outSecond[0] - outStart[0]);
    
    let diff = outAngle - inAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    
    return diff;
  }
  
  /**
   * Check if turn hint matches calculated angle
   */
  private static turnHintMatches(turnHint: string, turnAngle: number): boolean {
    const angle = Math.abs(turnAngle);
    
    switch (turnHint) {
      case 'left': return turnAngle > Math.PI / 6; // > 30°
      case 'slight_left': return turnAngle > Math.PI / 12 && turnAngle <= Math.PI / 6; // 15°-30°
      case 'through': return angle <= Math.PI / 12; // ± 15°
      case 'slight_right': return turnAngle < -Math.PI / 12 && turnAngle >= -Math.PI / 6; // -15° to -30°
      case 'right': return turnAngle < -Math.PI / 6; // < -30°
      default: return true;
    }
  }
  
  /**
   * Determine intersection control type from OSM tags
   */
  private static determineControlType(intersectionNode: OSMNode, nodes: Map<number, OSMNode>): ControlType {
    const tags = intersectionNode.tags || {};
    
    if (tags.highway === 'traffic_signals') return 'signals';
    if (tags.highway === 'stop') return 'stop';
    if (tags.highway === 'give_way') return 'give_way';
    if (tags.junction === 'roundabout') return 'roundabout';
    
    // Check for priority road indicators
    if (tags.priority_road === 'designated') return 'priority';
    
    return 'uncontrolled'; // Default Czech "right-hand rule"
  }
  
  /**
   * Generate right-of-way rules for intersection
   */
  private static generateRightOfWayRules(connectors: LaneConnector[], control: ControlType): RightOfWayRule[] {
    const rules: RightOfWayRule[] = [];
    
    if (control === 'signals') {
      // Traffic signals - rules managed by signal controller
      return rules;
    }
    
    // Generate conflict pairs
    for (let i = 0; i < connectors.length; i++) {
      for (let j = i + 1; j < connectors.length; j++) {
        const connA = connectors[i];
        const connB = connectors[j];
        
        if (this.connectorsConflict(connA, connB)) {
          const priority = this.determinePriority(connA, connB, control);
          
          rules.push({
            connectorA: connA.id,
            connectorB: connB.id,
            hasPriority: priority
          });
        }
      }
    }
    
    return rules;
  }
  
  /**
   * Check if two connectors have conflicting paths
   */
  private static connectorsConflict(connA: LaneConnector, connB: LaneConnector): boolean {
    // Simplified: different entry/exit combinations usually conflict
    // Real implementation would check path intersection
    return connA.fromLane !== connB.fromLane || connA.toLane !== connB.toLane;
  }
  
  /**
   * Determine priority between conflicting movements
   */
  private static determinePriority(
    connA: LaneConnector,
    connB: LaneConnector,
    control: ControlType
  ): 'A' | 'B' | 'yield' | 'signal' {
    
    switch (control) {
      case 'stop':
      case 'give_way':
        return 'yield'; // Both must yield to main road
        
      case 'roundabout':
        return 'A'; // Vehicles in roundabout have priority
        
      case 'priority':
        // Priority road logic would go here
        return 'A';
        
      case 'uncontrolled':
      default:
        // Czech right-hand rule: vehicle from right has priority
        return this.applyRightHandRule(connA, connB);
    }
  }
  
  /**
   * Apply Czech right-hand rule for priority
   */
  private static applyRightHandRule(connA: LaneConnector, connB: LaneConnector): 'A' | 'B' | 'yield' {
    // Simplified right-hand rule implementation
    // Real version would calculate relative positions
    return Math.random() > 0.5 ? 'A' : 'B'; // Placeholder
  }
}