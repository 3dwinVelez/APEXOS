"use client";

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
};

export function getGpsFix(timeout = 10000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS no disponible en este dispositivo."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy
      }),
      () => reject(new Error("Activa el permiso de ubicacion para continuar.")),
      { enableHighAccuracy: true, timeout, maximumAge: 15000 }
    );
  });
}
