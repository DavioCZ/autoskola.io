# TASK LIST - Autoškola Simulátor

## PRIORITA: Sémantický model silniční sítě

### ✅ Fáze 1: Získání a zpracování dat 
- [x] 1.1: Nastavit stahování OSM dat přes Overpass API pro Prahu
- [x] 1.2: Extrahovat silniční síť, přechody, semafory z OSM dat
- [x] 1.3: Extrahovat pravidla přednosti (stop, dej přednost, hlavní) z OSM tagů
- [x] 1.4: Extrahovat data chodníků a pěších cest

### ✅ Fáze 2: Vytvoření topologie sítě
- [x] 2.1: Normalizovat a přichytit polylinie (tolerance 0.5m)
- [x] 2.2: Najít křižovatky z topologie (uzly stupně >= 3)
- [x] 2.3: Rozdělit silnice na jednotlivé jízdní pruhy s offsety
- [x] 2.4: Vytvořit propojovací hrany mezi pruhy na křižovatkách

### ✅ Fáze 3: Systém dopravních pravidel
- [x] 3.1: Generovat stop čáry pro STOP/Dej přednost/semafory
- [x] 3.2: Vytvořit modely řízení křižovatek
- [x] 3.3: Postavit pravidla přednosti pro řešení konfliktů
- [x] 3.4: Implementovat českou pravou ruku jako default

### ✅ Fáze 4: Síť pro chodce
- [x] 4.1: Generovat syntetické chodníky z offsetů silnic
- [x] 4.2: Vytvořit segmenty přechodů z OSM crossings
- [x] 4.3: Propojit chodníkovou síť s přechody
- [x] 4.4: Přidat pravidla přednosti pro chodce

### ✅ Fáze 5: Implementace datových struktur
- [x] 5.1: Vytvořit TypeScript rozhraní (Lane, Intersection, Crosswalk)
- [x] 5.2: Postavit prostorový index pro rychlé dotazy
- [x] 5.3: Implementovat třídu RoadNetwork s query metodami
- [x] 5.4: Přidat JSON serializaci/deserializaci

### Fáze 6: Napojení na game (TODO)
- [ ] 6.1: Opravit build konfiguraci v packages/shared (přidat tsc build script)
- [ ] 6.2: Nastavit správné TypeScript importy a dist složku pro production
- [ ] 6.3: Implementovat ClientRoadNetwork loading v main.ts (už přidáno, ale nefunguje)
- [ ] 6.4: Otestovat RoadNetworkRenderer vizualizaci pruhů na canvas
- [ ] 6.5: Debugovat Overpass API připojení a fetch problematiku
- [ ] 6.6: Přidat keyboard shortcuts (L/I/C) pro debug vizualizace
- [ ] 6.7: Napojit current lane detection na debug overlay

### Fáze 7: Integrace AI provozu (po napojení)
- [ ] 7.1: Implementovat sledování pruhů pro AI vozidla
- [ ] 7.2: Přidat navigaci křižovatkami s gap acceptance
- [ ] 7.3: Vytvořit pathfinding pro chodce
- [ ] 7.4: Přidat správu stavu semaforů

### Fáze 7: Engine pro hodnocení pravidel
- [ ] 7.1: Detekovat vjezd/výjezd hráče z křižovatky
- [ ] 7.2: Kontrolovat porušení přednosti
- [ ] 7.3: Validovat dodržení stop čáry
- [ ] 7.4: Monitorovat porušení při přechodech chodců
- [ ] 7.5: Implementovat kontrolu blinkrů při odbočování

### Fáze 8: Vizualizace a debug
- [ ] 8.1: Přidat overlay vykreslování silniční sítě
- [ ] 8.2: Vizualizovat pruhy různými barvami podle typu
- [ ] 8.3: Debug pohled pro AI pathfinding
- [ ] 8.4: Zobrazit detekci porušení v real-time

---

## SOUČASNÝ STAV - Dokončené základy

### ✅ Fyzika a ovládání vozidla
- [x] Realistický bicycle model pro zatáčení
- [x] Rychlostně závislé omezení úhlu kol
- [x] Plynulé řízení s rate limiterem
- [x] Tempomat s P regulátorem
- [x] Nouzové manévrování (Space + A/D = max 35°)
- [x] Ovládání: WASD, Space, Q/E blinkry, R tempomat
- [x] Debug overlay (klávesa `;`) s telemetrií

### ✅ Mapový podklad
- [x] OSM tiles s GPS pozicováním v Praze
- [x] Plynulý zoom kolečkem myši (0.8x - 2.0x)
- [x] Fullscreen canvas s resize handling
- [x] Pevný tile zoom pro konzistentní šířky ulic
- [x] Retina podpora (@2x tiles)

### ✅ Sémantický model silniční sítě
- [x] Kompletní TypeScript definice pro LaneGraph, PedNet, CrossLink
- [x] ETL pipeline OSM → RoadNetwork (OverpassClient, LaneBuilder, IntersectionBuilder)
- [x] Prostorové dotazy a správa konfliktů (RoadNetworkManager)
- [x] Podpora pro pruhy, křižovatky, přechody, pravidla přednosti
- [x] JSON serializace a export modulů přes packages/shared

---

## BUDOUCÍ FÁZE - Po dokončení sémantického modelu

### Detekce porušení pravidel
- [ ] Systém penalizací s pop-up vysvětleními
- [ ] Kontrola rychlostních limitů podle OSM maxspeed
- [ ] Detekce správného použití blinkrů
- [ ] Hodnocení průjezdů křižovatkami

### Herní režimy
- [ ] Volná jízda pro seznámení
- [ ] Lekce zaměřené na konkrétní pravidla  
- [ ] Výzvy s hodnocením
- [ ] Zkouškový režim s celkovým skóre

### UI a UX
- [ ] Minimalistické HUD (rychlost, blinkry, skóre)
- [ ] Systém nápověd a instruktáže
- [ ] Export telemetrie do JSON
- [ ] Lokalizace textů porušení

### AI účastníci provozu
- [ ] Vozidla dodržující pravidla přednosti
- [ ] Chodci na přechodech s pravděpodobnostním výskytem
- [ ] Autobusy na zastávkách a v BUS pruzích
- [ ] Cyklisté na cyklostezkách

### Optimalizace a výkon
- [ ] Spatial indexing pro velké mapy
- [ ] Culling objektů mimo kameru
- [ ] Object pooling pro AI entity
- [ ] Memory leak monitoring

---

**Poznámka:** Prioritou je sémantický model - bez něj nelze implementovat realistické AI ani správné hodnocení hráče. Ostatní funkce budou postaveny na tomto základě.