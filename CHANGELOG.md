# Changelog

All notable changes to this project will be documented in this file.

## v0.1.0 (2025-08-27)

### Added - Sémantický model silniční sítě
- **Kompletní TypeScript definice** (`packages/shared/src/road-network/types.ts`):
  - `Lane`: Jízdní pruhy s geometrií, šířkou, rychlostním limitem, typem (general/bus/bike/tram)
  - `LaneConnector`: Propojovací hrany mezi pruhy přes křižovatky s cestami a povolenými pohyby
  - `Intersection`: Křižovatky s typy řízení (signals/stop/give_way/roundabout/uncontrolled)
  - `RightOfWayRule`: Pravidla přednosti pro řešení konfliktů na křižovatkách
  - `Crosswalk`: Přechody pro chodce se signály a prioritou
  - `PedNode`, `PedEdge`, `CrossLink`: Síť pro chodce s napojením na přechody
  - `RoadNetwork`: Kompletní model sítě s bounds a metadaty

- **ETL pipeline pro OSM data**:
  - `OverpassClient`: Stahování dat z Overpass API pro Prahu s pokročilým dotazem
    - Silnice (motorway → living_street), semafory, STOP/dej přednost znaky
    - Přechody (highway=crossing), chodníky, kruháče, prioritní cesty
    - Automatický parsing maxspeed tagů (km/h, mph → m/s)
    - Extrakce lanes, oneway, turn:lanes, width tagů
  - `LaneBuilder`: Konstrukce jízdních pruhů s geometrickými offsety
    - Rozdělení cest na forward/backward pruhy podle OSM tagů
    - Kolmé offsety od střednice s správným zpracováním zakřivení
    - Extrakce turn hints z turn:lanes (left/through/right/slight_*)
    - Detekce typu pruhu (general/bus/bike/tram) a výchozích rychlostních limitů
  - `IntersectionBuilder`: Generování křižovatek a propojovacích hran
    - Topologická detekce křižovatek (uzly stupně ≥ 3)
    - Generování lane connectorů s kontrolou úhlové realizovatelnosti
    - Určení typu řízení z OSM tagů (traffic_signals/stop/give_way/roundabout)
    - Automatické generování Right-of-Way pravidel s českou "pravou rukou"
  - `NetworkBuilder`: Hlavní pipeline OSM → RoadNetwork
    - Kompletní zpracování včetně pedestrian network
    - Výpočet geografických bounds pro spatial culling
    - Serializace do JSON s metadaty

- **RoadNetworkManager**: Query systém a prostorové operace
  - `findNearestLane()`: Hledání nejbližšího pruhu k pozici s distance threshold
  - `isMovementAllowed()`: Kontrola povolených průjezdů křižovatkami  
  - `getConflictingMovements()`: Detekce konfliktních pohybů pro gap acceptance
  - Optimalizované distance-to-polyline výpočty pro spatial queries
  - JSON serializace/deserializace s kompletní metadata
  - Support pro spatial bounds a statistiky sítě

### Technical Details
- **Datové struktury**: Založeno na vědecké literatuře (LaneGraph + PedNet + CrossLink)
- **Koordináty**: GPS (lon, lat) tuples pro kompatibilitu s existujícím mapovým systémem  
- **Geometrie**: Polyline representation s support pro offsets a smooth trajectories
- **Konflikty**: Graph-based approach pro intersection conflict detection
- **Pravidla**: Pluggable right-of-way rules s support pro Czech traffic law
- **Export**: Kompletní module exports přes packages/shared/src/index.ts

### Integration
- Přidáno do monorepo struktury jako `packages/shared/src/road-network/`
- Exportováno přes `packages/shared` pro použití v client i server aplikacích
- Připraveno pro integraci s existujícím mapovým systémem (MapLayer)
- Foundation pro AI traffic simulation a rule violation detection

## v0.0.2 (2024-12-26)

### Added
- **Realistický fyzikální model vozidla**: Kompletně přepracovaný fyzikální systém
  - Jednotné SI jednotky (m/s, m/s²) místo míchání různých měřítek
  - Rychlostně závislé omezení úhlu natočení kol pro realistické zatáčení
  - Rate limiter řízení s rychlejším auto-centrováním
  - Dynamický deadband pro stabilní zastavení
- **Vylepšené brzdění**: 
  - Konstantní zpomalení místo exponenciálního "gumového" efektu
  - Jemná brzda (S): 4.0 m/s², prudká brzda (Space): 8.0 m/s²
  - Realistické brzdné dráhy: 50 km/h → ~24m (jemná) / ~12m (prudká)
- **Tempomat**: P regulátor s minimem 20 km/h, automatické vypnutí při manuálním zásahu
- **Coast drag**: Realistické zpomalování při "volnoběhu" místo exponenciálního tření
- **Telemetrie**: Přidán `steerAngleDeg` pro zobrazení skutečného úhlu kol
- **MetaDrive/Bullet řízení**: Implementace ověřené metodiky z driving simulátorů
  - Low-speed gain: potlačuje "otáčení na místě" při nízkých rychlostech
  - Rate limiter volantu: plynulé otáčení s rychlejším návratem do středu
  - Rychlostní omezení úhlu kol podle bočního zrychlení (3.8 m/s²)
- **Debug vizualizace**: Směrové vektory vozidla a kol (klávesa `;`)

### Changed
- **Ovládání**: 
  - Tempomat přesunut z klávesy C na R
  - S klávesa: brzda při jízdě dopředu, couvání při stání
  - Space: pouze brzda (ne couvání)
- **Fyzikální konstanty**:
  - Max rychlost: 135 km/h dopředu, 15 km/h dozadu
  - Wheelbase: 2.7m (reálný rozvor auta)
  - Mechanický limit řízení: 32°
  - Boční zrychlení limit: 3.8 m/s² (~0.39g)
- **Řízení**: 
  - Vysoká rychlost → omezený úhel kol (realistické zatáčky)
  - Nízká rychlost → plný mechanický limit (parkování)
  - Plynulé otáčení volantu: 2.0 rad/s, návrat: 3.0 rad/s

### Fixed
- **Mrtvá zóna při rozjezdu**: Dynamický deadband podle dt, neblokuje rozjezd z nuly
- **Anti-flip logika**: Aplikuje se pouze při pohybu, ne při startu z nuly
- **Input handling**: S klávesa už nefunguje současně jako brzda i couvání
- **Zastavení**: Vozidlo se správně zastaví místo nekonečného poskakování rychlosti
- **Dvojitá inverze řízení**: Odstraněna `SCREEN_Y_DOWN` inverze - volant a vozidlo zatáčí stejným směrem
- **Tempomat priorita**: Opravena logika - tempomat funguje pouze bez manuálního inputu

## v0.0.1 (2025-08-25)

### Added
- Created the initial CHANGELOG.md file to track project changes.

### Changed
- **Vehicle Physics**: Reworked the vehicle steering model to a more realistic "bicycle model".
  - Steering is now dependent on the vehicle's speed and wheelbase, preventing unnatural rotation when stationary.
  - The turning radius is now calculated based on the steering angle, providing a more authentic driving feel.

### Fixed
- **Build Error**: Resolved a critical build failure in `vehicle.ts` caused by a duplicate variable declaration (`currentSpeed`) after refactoring the physics model.
- **Physics Logic**: Corrected the physics calculation to use the new, updated vehicle angle for velocity calculations within the same frame, ensuring consistent movement.
