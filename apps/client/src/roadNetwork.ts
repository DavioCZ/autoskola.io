import { RoadNetworkManager, NetworkBuilder, type RoadNetwork, type Lane } from '@shared/road-network';

/**
 * Road network integration for client app
 */
export class ClientRoadNetwork {
  private manager: RoadNetworkManager | null = null;
  private loading = false;
  private loadError: string | null = null;
  
  /**
   * Load road network for Prague area
   */
  async loadPragueNetwork(): Promise<void> {
    if (this.loading || this.manager) return;
    
    this.loading = true;
    this.loadError = null;
    
    try {
      console.log('🚀 Loading Prague road network...');
      
      const builder = new NetworkBuilder();
      
      // Small area around starting position (Anděl area)
      const network = await builder.buildPragueNetwork({
        south: 50.065,   // Area around Anděl metro station
        west: 14.395, 
        north: 50.075,
        east: 14.405
      });
      
      this.manager = new RoadNetworkManager(network);
      
      const stats = this.manager.getMetadata().stats;
      console.log('✅ Road network loaded:', stats);
      
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to load road network:', this.loadError);
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Find nearest lane to world position
   */
  findNearestLane(worldX: number, worldY: number, mapLayer: any): Lane | null {
    if (!this.manager) return null;
    
    // Convert world coordinates to GPS
    const gps = mapLayer.worldToLonLat(worldX, worldY);
    const nearestLane = this.manager.findNearestLane([gps.lon, gps.lat], 50);
    
    return nearestLane;
  }
  
  /**
   * Get all lanes for rendering
   */
  getAllLanes(): Lane[] {
    if (!this.manager) return [];
    
    const network = (this.manager as any).network as RoadNetwork;
    return Object.values(network.lanes);
  }
  
  /**
   * Get all intersections 
   */
  getAllIntersections() {
    if (!this.manager) return [];
    
    const network = (this.manager as any).network as RoadNetwork;
    return Object.values(network.intersections);
  }
  
  /**
   * Get loading state
   */
  getLoadingState() {
    return {
      isLoading: this.loading,
      isLoaded: !!this.manager,
      error: this.loadError
    };
  }
  
  /**
   * Check if movement is allowed between lanes
   */
  isMovementAllowed(fromLaneId: string, toLaneId: string): boolean {
    if (!this.manager) return false;
    return this.manager.isMovementAllowed(fromLaneId, toLaneId);
  }
}