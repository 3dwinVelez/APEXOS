"use client";

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
};

export function getGpsFix(timeout = 8000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS no disponible en este dispositivo."));
      return;
    }
    // Fast acquisition: try low accuracy first, upgrade only if needed
    const fastFallback = (error: GeolocationPositionError) => {
      if (error.code === error.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_meters: position.coords.accuracy
          }),
          () => reject(new Error("Activa el permiso de ubicacion para continuar.")),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
        );
      } else {
        reject(new Error("Activa el permiso de ubicacion para continuar."));
      }
    };
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy
      }),
      fastFallback,
      { enableHighAccuracy: true, timeout, maximumAge: 15000 }
    );
  });
}
