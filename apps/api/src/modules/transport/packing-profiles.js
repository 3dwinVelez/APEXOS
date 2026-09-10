// Catálogo estándar de perfiles de vehículo para cubicaje.
// Dimensiones interiores en metros y carga útil en kg (valores comerciales de referencia).
// No sustituye la ficha maestra del vehículo; es un punto de partida seleccionable.

const STANDARD_PACKING_PROFILES = Object.freeze([
  {
    id: "camioneta",
    name: "Camioneta / Pickup",
    kind: "liviano",
    description: "Caja abierta para entregas urbanas ligeras.",
    vehicle_type: "camioneta",
    container: { length: 2.4, width: 1.5, height: 1.2, max_weight: 750 }
  },
  {
    id: "van-urbana",
    name: "Van urbana",
    kind: "liviano",
    description: "Furgoneta cerrada para paquetería y última milla.",
    vehicle_type: "camioneta",
    container: { length: 2.4, width: 1.35, height: 1.35, max_weight: 1200 }
  },
  {
    id: "furgon-liviano",
    name: "Furgón liviano (NHR/NKR)",
    kind: "furgon",
    description: "Caja cerrada de 3.5 toneladas para distribución.",
    vehicle_type: "furgon",
    container: { length: 3.2, width: 1.85, height: 1.85, max_weight: 3500 }
  },
  {
    id: "turbo",
    name: "Turbo / Furgón 5 t",
    kind: "furgon",
    description: "Caja cerrada de reparto regional de hasta 5 toneladas.",
    vehicle_type: "furgon",
    container: { length: 4.5, width: 2.1, height: 2.1, max_weight: 5000 }
  },
  {
    id: "furgon-sencillo",
    name: "Furgón sencillo",
    kind: "furgon",
    description: "Caja cerrada de 10 toneladas para carga seca.",
    vehicle_type: "furgon",
    container: { length: 6.5, width: 2.4, height: 2.5, max_weight: 10000 }
  },
  {
    id: "estacas",
    name: "Estacas / Cama baja",
    kind: "estacas",
    description: "Plataforma con estacas laterales para carga sobredimensionada.",
    vehicle_type: "camion",
    container: { length: 6.5, width: 2.4, height: 2.5, max_weight: 10000 }
  },
  {
    id: "doble-troque",
    name: "Doble troque",
    kind: "camion",
    description: "Camión rígido de dos ejes traseros para carga pesada.",
    vehicle_type: "camion",
    container: { length: 7.5, width: 2.4, height: 2.5, max_weight: 17000 }
  },
  {
    id: "patineta",
    name: "Patineta / Plataforma",
    kind: "plataforma",
    description: "Remolque de plataforma baja para maquinaria y carga larga.",
    vehicle_type: "camion",
    container: { length: 12, width: 2.5, height: 2.8, max_weight: 30000 }
  },
  {
    id: "tractomula",
    name: "Tractomula 40 pies",
    kind: "tractomula",
    description: "Semirremolque cerrado para tráfico de larga distancia.",
    vehicle_type: "camion",
    container: { length: 12, width: 2.44, height: 2.6, max_weight: 35000 }
  },
  {
    id: "furgon-refrigerado",
    name: "Furgón refrigerado",
    kind: "furgon",
    description: "Caja térmica para cadena de frío.",
    vehicle_type: "furgon",
    container: {
      length: 6.5,
      width: 2.4,
      height: 2.5,
      max_weight: 9000,
      spaces: [{ id: "frio", x: 0, y: 0, z: 0, length: 6.5, width: 2.4, height: 2.5, temperature_min: -18, temperature_max: 5 }]
    }
  }
]);

module.exports = { STANDARD_PACKING_PROFILES };
