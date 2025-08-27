import { OverpassClient, type OverpassResponse, type OSMWay, type OSMNode } from './overpass';
import { LaneBuilder } from './lane-builder';
import { IntersectionBuilder } from './intersection-builder';
import type { RoadNetwork, Lane, Crosswalk, PedEdge, PedNode } from '../types';

/**
 * Main ETL pipeline for converting OSM data to semantic road network
 */
export class NetworkBuilder {
  private overpass = new OverpassClient();
  
  /**
   * Build complete road network for Prague area
   */
  async buildPragueNetwork(bounds?: {
    south: number;
    west: number; 
    north: number;
    east: number;
  }): Promise<RoadNetwork> {
    
    console.log('Fetching OSM data...');
    const osmData = await this.overpass.fetchPragueRoadNetwork(bounds);
    
    console.log(`Processing ${osmData.elements.length} OSM elements...`);
    const network = this.processOSMData(osmData);
    
    console.log('Network built:', {
      lanes: Object.keys(network.lanes).length,
      intersections: Object.keys(network.intersections).length,
      crosswalks: Object.keys(network.crosswalks).length
    });
    
    return network;
  }
  
  /**
   * Process OSM response into semantic network
   */
  private processOSMData(osmData: OverpassResponse): RoadNetwork {
    const nodes = this.overpass.extractNodesMap(osmData.elements);
    const ways = osmData.elements.filter(el => el.type === 'way') as OSMWay[];
    
    // Step 1: Extract road ways and build lanes
    const roadWays = ways.filter(way => this.overpass.isCarWay(way));
    const allLanes = this.buildAllLanes(roadWays, nodes);
    
    // Step 2: Find intersections from topology  
    const intersectionNodes = IntersectionBuilder.findIntersectionNodes(roadWays, nodes);
    const { intersections, laneConnectors } = this.buildIntersections(intersectionNodes, allLanes, nodes);
    
    // Step 3: Build pedestrian network
    const { pedNodes, pedEdges, crosswalks, crossLinks } = this.buildPedestrianNetwork(osmData.elements, nodes);
    
    // Step 4: Calculate bounds
    const bounds = this.calculateBounds(nodes);
    
    const network: RoadNetwork = {
      lanes: this.arrayToRecord(allLanes, 'id'),
      laneConnectors: this.arrayToRecord(laneConnectors, 'id'),
      intersections: this.arrayToRecord(intersections, 'id'),
      pedNodes: this.arrayToRecord(pedNodes, 'id'),
      pedEdges: this.arrayToRecord(pedEdges, 'id'), 
      crosswalks: this.arrayToRecord(crosswalks, 'id'),
      crossLinks: this.arrayToRecord(crossLinks, 'id'),
      bounds,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      source: 'osm'
    };
    
    return network;
  }
  
  /**
   * Build lanes for all road ways
   */
  private buildAllLanes(roadWays: OSMWay[], nodes: Map<number, OSMNode>): Lane[] {
    const allLanes: Lane[] = [];
    
    for (const way of roadWays) {
      const laneInfo = this.overpass.extractLaneInfo(way);
      const lanes = LaneBuilder.buildLanesFromWay(way, nodes, laneInfo);
      allLanes.push(...lanes);
    }
    
    return allLanes;
  }
  
  /**
   * Build all intersections and their connectors
   */
  private buildIntersections(intersectionNodes: OSMNode[], allLanes: Lane[], nodes: Map<number, OSMNode>) {
    const allIntersections = [];
    const allConnectors = [];
    
    for (const node of intersectionNodes) {
      const nodeId = `node_${node.id}`;
      
      // Find lanes ending/starting at this intersection
      const incomingLanes = allLanes.filter(lane => lane.toNode === nodeId);
      const outgoingLanes = allLanes.filter(lane => lane.fromNode === nodeId);
      
      if (incomingLanes.length > 0 && outgoingLanes.length > 0) {
        const { intersection, connectors } = IntersectionBuilder.buildIntersection(
          node,
          incomingLanes,
          outgoingLanes,
          nodes
        );
        
        allIntersections.push(intersection);
        allConnectors.push(...connectors);
      }
    }
    
    return { intersections: allIntersections, laneConnectors: allConnectors };
  }
  
  /**
   * Build pedestrian network from OSM data
   */
  private buildPedestrianNetwork(elements: any[], nodes: Map<number, OSMNode>) {
    // Simplified pedestrian network - just crosswalks for now
    const crosswalks: Crosswalk[] = [];
    const pedNodes: PedNode[] = [];
    const pedEdges: PedEdge[] = [];
    const crossLinks: any[] = [];
    
    // Extract crosswalk nodes
    for (const element of elements) {
      if (element.type === 'node' && element.tags?.highway === 'crossing') {
        const node = element as OSMNode;
        
        crosswalks.push({
          id: `crosswalk_${node.id}`,
          segment: [[node.lon, node.lat], [node.lon, node.lat]], // Point crosswalk
          hasSignals: node.tags?.crossing === 'traffic_signals',
          priority: node.tags?.crossing === 'uncontrolled' ? 'cars_over_ped' : 'ped_over_cars'
        });
      }
    }
    
    return { pedNodes, pedEdges, crosswalks, crossLinks };
  }
  
  /**
   * Calculate geographic bounds of network
   */
  private calculateBounds(nodes: Map<number, OSMNode>) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    
    for (const node of nodes.values()) {
      minLat = Math.min(minLat, node.lat);
      maxLat = Math.max(maxLat, node.lat);
      minLon = Math.min(minLon, node.lon);
      maxLon = Math.max(maxLon, node.lon);
    }
    
    return { minLat, maxLat, minLon, maxLon };
  }
  
  /**
   * Convert array to record keyed by property
   */
  private arrayToRecord<T extends { [K in keyof T]: any }>(
    array: T[], 
    keyProperty: keyof T
  ): Record<string, T> {
    const record: Record<string, T> = {};
    for (const item of array) {
      record[String(item[keyProperty])] = item;
    }
    return record;
  }
}