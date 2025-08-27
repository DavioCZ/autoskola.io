// Demo script pro testování sémantického modelu
// Spusť: node test-semantic-model.js

const { NetworkBuilder, RoadNetworkManager } = require('./packages/shared/dist/road-network');

async function testSemanticModel() {
  console.log('🚀 Testování sémantického modelu...\n');
  
  try {
    // 1. Vytvoř builder
    const builder = new NetworkBuilder();
    
    // 2. Stáhni malou oblast Prahy (cca 1km²)
    console.log('📡 Stahuji OSM data pro střed Prahy...');
    const network = await builder.buildPragueNetwork({
      south: 50.075,   // Malá oblast kolem Wenceslas Square  
      west: 14.42,
      north: 50.085,
      east: 14.43
    });
    
    console.log('✅ Síť vytvořena!');
    console.log(`📊 Statistiky:`);
    console.log(`   - Pruhy: ${Object.keys(network.lanes).length}`);
    console.log(`   - Křižovatky: ${Object.keys(network.intersections).length}`);
    console.log(`   - Connectors: ${Object.keys(network.laneConnectors).length}`);
    console.log(`   - Přechody: ${Object.keys(network.crosswalks).length}\n`);
    
    // 3. Otestuj query systém
    const manager = new RoadNetworkManager(network);
    
    // Test pozice v centru oblasti
    const testPos = [14.425, 50.08]; // [lon, lat] 
    console.log('🔍 Testuji prostorové dotazy...');
    
    const nearestLane = manager.findNearestLane(testPos, 100);
    if (nearestLane) {
      console.log(`✅ Nejbližší pruh: ${nearestLane.id}`);
      console.log(`   - Typ: ${nearestLane.type}`);
      console.log(`   - Max rychlost: ${(nearestLane.maxSpeed * 3.6).toFixed(0)} km/h`);
      console.log(`   - Šířka: ${nearestLane.width}m`);
    } else {
      console.log('❌ Žádný pruh poblíž nenalezen');
    }
    
    // 4. Otestuj křižovatky
    const intersectionIds = Object.keys(network.intersections);
    if (intersectionIds.length > 0) {
      const firstIntersection = network.intersections[intersectionIds[0]];
      console.log(`\n🚦 Zkouška křižovatky: ${firstIntersection.id}`);
      console.log(`   - Typ řízení: ${firstIntersection.control}`);
      console.log(`   - Příjezdové pruhy: ${firstIntersection.incoming.length}`);
      console.log(`   - Pravidel přednosti: ${firstIntersection.rules.length}`);
      
      const connectors = manager.getIntersectionConnectors(firstIntersection.id);
      console.log(`   - Možných pohybů: ${connectors.length}`);
    }
    
    // 5. Export do JSON pro debug
    const json = manager.toJSON();
    require('fs').writeFileSync('prague-network.json', json);
    console.log('\n💾 Síť exportována do prague-network.json');
    
    console.log('\n🎉 Test dokončen úspěšně!');
    
  } catch (error) {
    console.error('❌ Chyba:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('\n💡 Tip: Zkontroluj připojení k internetu pro Overpass API');
    }
    if (error.message.includes('Cannot resolve module')) {
      console.log('\n💡 Tip: Spusť "npm run build" v packages/shared/');
    }
  }
}

// Spusť test
testSemanticModel();