import type { Vec2 } from '../types';

/**
 * OSM data structures from Overpass API
 */
export interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export interface OSMRelation {
  type: 'relation';
  id: number;
  members: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
  }>;
  tags?: Record<string, string>;
}

export type OSMElement = OSMNode | OSMWay | OSMRelation;

export interface OverpassResponse {
  version: number;
  generator: string;
  elements: OSMElement[];
}

/**
 * Overpass API client for Prague road network data
 */
export class OverpassClient {
  private readonly baseUrl = 'https://overpass-api.de/api/interpreter';
  
  /**
   * Fetch road network data for Prague bounding box
   */
  async fetchPragueRoadNetwork(bounds?: {
    south: number;
    west: number;
    north: number;
    east: number;
  }): Promise<OverpassResponse> {
    // Default to Prague center if no bounds provided
    const bbox = bounds || {
      south: 50.0,
      west: 14.2,
      north: 50.15,
      east: 14.6
    };
    
    const query = this.buildRoadNetworkQuery(bbox);
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`
    });
    
    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Build Overpass QL query for road network data
   */
  private buildRoadNetworkQuery(bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }): string {
    const { south, west, north, east } = bounds;
    
    return `
[out:json][timeout:30];
(
  // Roads and streets
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)$"](${south},${west},${north},${east});
  
  // Traffic signals
  node[highway=traffic_signals](${south},${west},${north},${east});
  
  // Stop signs and give way
  node[highway~"^(stop|give_way)$"](${south},${west},${north},${east});
  
  // Crosswalks
  node[highway=crossing](${south},${west},${north},${east});
  way[highway=footway][footway=crossing](${south},${west},${north},${east});
  
  // Sidewalks and footways
  way[highway=footway](${south},${west},${north},${east});
  way[footway=sidewalk](${south},${west},${north},${east});
  
  // Roundabouts
  way[junction=roundabout](${south},${west},${north},${east});
  
  // Priority roads
  way[priority_road](${south},${west},${north},${east});
);
out geom;
    `.trim();
  }
  
  /**
   * Extract nodes by ID for way geometry
   */
  extractNodesMap(elements: OSMElement[]): Map<number, OSMNode> {
    const nodes = new Map<number, OSMNode>();
    
    for (const element of elements) {
      if (element.type === 'node') {
        nodes.set(element.id, element);
      }
    }
    
    return nodes;
  }
  
  /**
   * Convert OSM way to polyline using node positions
   */
  wayToPolyline(way: OSMWay, nodes: Map<number, OSMNode>): Vec2[] {
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
   * Check if way represents a car-accessible road
   */
  isCarWay(way: OSMWay): boolean {
    const highway = way.tags?.highway;
    if (!highway) return false;
    
    const carHighways = [
      'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
      'unclassified', 'residential', 'service', 'living_street'
    ];
    
    return carHighways.includes(highway);
  }
  
  /**
   * Extract lane configuration from OSM tags
   */
  extractLaneInfo(way: OSMWay): {
    lanes: number;
    lanesForward: number;
    lanesBackward: number;
    isOneway: boolean;
    turnLanes?: string[];
    maxSpeed?: number;
    width?: number;
  } {
    const tags = way.tags || {};
    
    const lanes = parseInt(tags.lanes || '2');
    const isOneway = tags.oneway === 'yes' || tags.oneway === '1';
    
    let lanesForward = lanes;
    let lanesBackward = 0;
    
    if (!isOneway) {
      lanesForward = parseInt(tags['lanes:forward'] || Math.ceil(lanes / 2).toString());
      lanesBackward = parseInt(tags['lanes:backward'] || Math.floor(lanes / 2).toString());
    }
    
    const turnLanes = tags['turn:lanes']?.split('|');
    const maxSpeed = tags.maxspeed ? this.parseMaxSpeed(tags.maxspeed) : undefined;
    const width = tags.width ? parseFloat(tags.width) : undefined;
    
    return {
      lanes,
      lanesForward,
      lanesBackward,
      isOneway,
      turnLanes,
      maxSpeed,
      width
    };
  }
  
  /**
   * Parse maxspeed tag to m/s
   */
  private parseMaxSpeed(maxspeedTag: string): number {
    // Handle "50", "50 kmh", "50 km/h", "30 mph" etc.
    const match = maxspeedTag.match(/(\d+)\s*(kmh|km\/h|mph)?/i);
    if (!match) return 13.89; // Default 50 km/h in m/s
    
    const value = parseInt(match[1]);
    const unit = match[2]?.toLowerCase();
    
    if (unit === 'mph') {
      return value * 0.44704; // mph to m/s
    } else {
      return value * 0.27778; // km/h to m/s (default)
    }
  }
}