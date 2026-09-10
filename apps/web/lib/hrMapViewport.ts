export type MapCoordinate = { latitude: number | null | undefined; longitude: number | null | undefined };

const TILE_SIZE = 256;
const DEFAULT_CENTER = { latitude: 4.711, longitude: -74.0721 };

export function bogotaCalendarDate(value: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function hasMapCoordinates(point: MapCoordinate): point is { latitude: number; longitude: number } {
  return typeof point.latitude === "number"
    && typeof point.longitude === "number"
    && Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -85.05112878
    && point.latitude <= 85.05112878
    && point.longitude >= -180
    && point.longitude <= 180;
}

function project(latitude: number, longitude: number) {
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * TILE_SIZE,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE
  };
}

function unproject(x: number, y: number) {
  const longitude = (x / TILE_SIZE) * 360 - 180;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / TILE_SIZE)));
  return { latitude, longitude };
}

export function historicalMapViewport(points: MapCoordinate[], width = 1000, height = 650) {
  const valid = points.filter(hasMapCoordinates);
  if (!valid.length) return { center: DEFAULT_CENTER, zoom: 13 };
  if (valid.length === 1) return { center: { latitude: valid[0].latitude, longitude: valid[0].longitude }, zoom: 16 };
  const projected = valid.map((point) => project(point.latitude, point.longitude));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const padding = 96;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scaleX = (maxX - minX) > 0 ? availableWidth / (maxX - minX) : Number.POSITIVE_INFINITY;
  const scaleY = (maxY - minY) > 0 ? availableHeight / (maxY - minY) : Number.POSITIVE_INFINITY;
  const zoom = Math.max(8, Math.min(18, Math.floor(Math.log2(Math.min(scaleX, scaleY)))));
  return { center: unproject((minX + maxX) / 2, (minY + maxY) / 2), zoom };
}
