// Core types for semantic road network model
// Based on LaneGraph + PedNet + CrossLink architecture

export type Vec2 = [number, number];

export type LaneType = 'general' | 'bus' | 'bike' | 'tram';
export type TurnType = 'left' | 'right' | 'through' | 'slight_left' | 'slight_right';
export type ControlType = 'signals' | 'priority' | 'stop' | 'give_way' | 'roundabout' | 'uncontrolled';

/**
 * Single driving lane with geometry and traffic rules
 */
export interface Lane {
  id: string;
  poly: Vec2[];             // centerline of lane
  width: number;            // meters
  maxSpeed: number;         // m/s
  dir: 1 | -1;              // direction along poly
  type: LaneType;
  fromNode: string;
  toNode: string;
  turnHint?: TurnType;      // from turn:lanes OSM tag
  stopLine?: [Vec2, Vec2];  // stop line segment
  signalGroupId?: string;   // traffic signal group
}

/**
 * Connection between lanes through intersection
 */
export interface LaneConnector {
  id: string;
  fromLane: string;         // incoming lane
  toLane: string;           // outgoing lane  
  path: Vec2[];             // bezier curve through intersection
  allowed: boolean;         // after turn restrictions
}

/**
 * Intersection with traffic control rules
 */
export interface Intersection {
  id: string;
  polygon?: Vec2[];         // intersection area boundary
  incoming: string[];       // Lane.id array
  outgoing: string[];       // Lane.id array
  connectors: string[];     // LaneConnector.id array
  control: ControlType;
  rules: RightOfWayRule[];  // conflict resolution
}

/**
 * Right-of-way rule for intersection conflicts
 */
export interface RightOfWayRule {
  connectorA: string;       // movement A (fromLane->toLane)
  connectorB: string;       // movement B (conflict with A)
  hasPriority: 'A' | 'B' | 'yield' | 'signal'; // who goes first
}

/**
 * Pedestrian crosswalk
 */
export interface Crosswalk {
  id: string;
  segment: [Vec2, Vec2];    // crosswalk line
  hasSignals: boolean;
  priority: 'ped_over_cars' | 'cars_over_ped' | 'signal';
  nearIntersection?: string; // Intersection.id
}

/**
 * Pedestrian network edge (sidewalk, path)
 */
export interface PedEdge {
  id: string;
  poly: Vec2[];
  kind: 'sidewalk' | 'footpath' | 'island';
  width?: number;           // meters
  fromNode: string;
  toNode: string;
}

/**
 * Pedestrian network node
 */
export interface PedNode {
  id: string;
  p: Vec2;
}

/**
 * Link between pedestrian network and crosswalks
 */
export interface CrossLink {
  id: string;
  from: { kind: 'pedNode' | 'pedEdge', ref: string };
  to:   { kind: 'crosswalk' | 'island' | 'stopRefuge', ref: string };
  crossing?: string; // Crosswalk.id
}

/**
 * Complete road network model
 */
export interface RoadNetwork {
  // Lane graph
  lanes: Record<string, Lane>;
  laneConnectors: Record<string, LaneConnector>;
  intersections: Record<string, Intersection>;
  
  // Pedestrian network
  pedNodes: Record<string, PedNode>;
  pedEdges: Record<string, PedEdge>;
  crosswalks: Record<string, Crosswalk>;
  crossLinks: Record<string, CrossLink>;
  
  // Spatial bounds for rendering/culling
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  
  // Metadata
  version: string;
  generatedAt: string;
  source: 'osm' | 'custom';
}