# Testování sémantického modelu

## 🚀 První test

```bash
# 1. Build TypeScript
cd packages/shared && npm run build

# 2. Spusť test
cd ../../ 
node test-semantic-model.js
```

## ✅ Co ověřit

### Úspěšný běh ukáže:
- **Pruhy**: 50-500 (podle hustoty oblasti)
- **Křižovatky**: 5-50 
- **Connectors**: 20-300
- **Přechody**: 0-20

### JSON export obsahuje:
- `lanes` s GPS polylines a rychlostními limity
- `intersections` s control types a rules
- `bounds` s geografickými hranicemi

## 🐛 Debugging

### Chyba: "Cannot resolve module"
```bash
cd packages/shared && npm run build
```

### Chyba: "Overpass API error"
- Zkus menší oblast nebo počkej (rate limiting)
- Overpass je často přetížený kolem 15:00-17:00

### Chyba: Prázdná síť (0 pruhů)
1. Zkontroluj GPS bounds - měly by pokrývat skutečné silnice
2. OSM data pro oblast možná chybějí
3. Příliš přísné filtry v OverpassClient

## 📍 Test oblasti

**Střed Prahy** (Václavské náměstí):
- South: 50.075, West: 14.42
- North: 50.085, East: 14.43
- Očekávané pruhy: ~200

**Menší test** (jen jedna křižovatka):
- South: 50.0805, West: 14.425  
- North: 50.0815, East: 14.427
- Očekávané pruhy: ~20

## 🔧 Další kroky po úspěšném testu

1. **Vizualizace**: Vykreslit pruhy na mapu
2. **Integrace**: Napojit na existující Vehicle system
3. **AI provoz**: Vozidla jezdící po pruzích
4. **Hodnocení**: Detekce porušení pravidel

## 💡 Tip pro debug

```javascript
// Přidej do test scriptu:
const lanes = Object.values(network.lanes);
console.log('První pruh:', lanes[0]);

// Nebo otevři prague-network.json v VS Code
// a prohlédni si strukturu dat
```