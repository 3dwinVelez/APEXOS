"use client";

import type { GpsFailureCause } from "@/lib/hrOfflineMarking";

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
};

export type GpsFixFailureCause = Exclude<GpsFailureCause, "UNKNOWN">;

export class GpsFixError extends Error {
  gpsCause: GpsFixFailureCause;

  constructor(cause: GpsFixFailureCause, message: string) {
    super(message);
    this.name = "GpsFixError";
    this.gpsCause = cause;
  }
}

function toFix(position: GeolocationPosition): GpsFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_meters: position.coords.accuracy
  };
}

// La causa debe viajar hasta la pantalla: PERMISSION_DENIED es una decision del usuario y
// sigue bloqueando la marcacion, mientras que TIMEOUT/POSITION_UNAVAILABLE/UNSUPPORTED son
// falta de senal o de hardware y permiten marcar encolando la novedad.
function causeOf(error: GeolocationPositionError): GpsFixFailureCause {
  if (error.code === error.PERMISSION_DENIED) return "PERMISSION_DENIED";
  if (error.code === error.TIMEOUT) return "TIMEOUT";
  return "POSITION_UNAVAILABLE";
}

function messageOf(cause: GpsFixFailureCause) {
  if (cause === "PERMISSION_DENIED") return "Activa el permiso de ubicacion para continuar.";
  if (cause === "UNSUPPORTED") return "GPS no disponible en este dispositivo.";
  if (cause === "TIMEOUT") return "No hubo fix de GPS a tiempo.";
  return "No fue posible obtener la ubicacion en este momento.";
}

export function gpsFixError(cause: GpsFixFailureCause) {
  return new GpsFixError(cause, messageOf(cause));
}

export function getGpsFix(timeout = 8000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(gpsFixError("UNSUPPORTED"));
      return;
    }
    // Fast acquisition: try low accuracy first, upgrade only if needed
    const fastFallback = (error: GeolocationPositionError) => {
      if (error.code === error.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(toFix(position)),
          (retryError) => reject(gpsFixError(causeOf(retryError))),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
        );
      } else {
        reject(gpsFixError(causeOf(error)));
      }
    };
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toFix(position)),
      fastFallback,
      { enableHighAccuracy: true, timeout, maximumAge: 15000 }
    );
  });
}
