import type { RateCard } from "@/app/dashboard/transporte/tarifas/page";
import type { RateCostDraft } from "@/components/transport/RateCostDesigner";

export function rateCostDraftFromSnapshot(rate: RateCard): RateCostDraft {
  const meta = rate.metadata || {};
  const isFleet = meta.applies_to ? meta.applies_to === "flota_propia" : !rate.carrier_id;
  const vehicleId = meta.vehicle_id ? String(meta.vehicle_id) : "";
  const tariffMethod = meta.tariff_method === "por_km" || meta.tariff_method === "por_carga" ? meta.tariff_method
    : Number(rate.price_per_km) > 0 ? "por_km"
      : Number(rate.price_per_kg) > 0 || Number(rate.price_per_m3) > 0 ? "por_carga" : "fijo";
  const sim = meta.simulation || null;
  const draft = {
    code: rate.code, name: rate.name,
    transport_mode: isFleet ? "flota_propia" : "terceros",
    carrier_id: rate.carrier_id ? String(rate.carrier_id) : "",
    vehicle_id: vehicleId,
    destination_department: rate.destination_department || "", destination_city: rate.destination_city || "", destination_municipality: rate.destination_municipality || "",
    service_level: rate.service_level || "", vehicle_type: rate.vehicle_type || "",
    valid_from: rate.valid_from ? rate.valid_from.slice(0, 10) : "", valid_to: rate.valid_to ? rate.valid_to.slice(0, 10) : "",
    currency: rate.currency || "COP",
    base_rate: String(rate.base_rate ?? ""), minimum_charge: String(rate.minimum_charge ?? ""),
    price_per_km: String(rate.price_per_km ?? ""), price_per_kg: String(rate.price_per_kg ?? ""),
    price_per_m3: String(rate.price_per_m3 ?? ""), price_per_stop: String(rate.price_per_stop ?? ""),
    fuel_surcharge_pct: String(rate.fuel_surcharge_pct ?? ""), tolls_flat: meta.costs_enabled?.tolls === false ? "" : String(rate.tolls_flat ?? ""),
    tariff_method: tariffMethod,
    load_unit: meta.load_unit === "m3" ? "m3" : "kg",
    stops_included: meta.costs_enabled?.stops ? String(meta.stops_included || 0) : meta.stops_included ? String(meta.stops_included) : "",
    wait_included_min: meta.costs_enabled?.wait ? String(meta.wait_time_included_min || 0) : meta.wait_time_included_min ? String(meta.wait_time_included_min) : "",
    wait_rate_per_min: meta.wait_time_rate_per_min ? String(meta.wait_time_rate_per_min) : "",
    load_unload_flat: meta.costs_enabled?.load_unload ? String(meta.load_unload_flat || 0) : meta.load_unload_flat ? String(meta.load_unload_flat) : "",
    other_costs_amount: meta.costs_enabled?.other ? String(meta.other_costs_amount || 0) : meta.other_costs_amount ? String(meta.other_costs_amount) : "",
    other_costs_label: meta.other_costs_label || "",
    fuel_mode: meta.fuel_mode === "estimated" ? "estimated" : "surcharge",
    fuel_estimated_cost: meta.fuel_estimated_cost ? String(meta.fuel_estimated_cost) : "",
    billable_km: sim?.distance_km ? String(sim.distance_km) : "",
    km_source: sim?.source === "google" || sim?.source === "osrm" || sim?.source === "estimate" || sim?.source === "manual" ? sim.source : "",
    preview_load: "1000", preview_wait_min: "30",
    fuel_kind: meta.fuel_estimation?.kind === "acpm" ? "acpm" : "gasolina", fuel_rendimiento: meta.fuel_estimation?.rendimiento ? String(meta.fuel_estimation.rendimiento) : "", fuel_precio_litro: meta.fuel_estimation?.price_per_liter ? String(meta.fuel_estimation.price_per_liter) : "", fuel_extra_pct: String(meta.fuel_estimation?.extra_pct || 0),
    sim_round_trip: Boolean(sim?.round_trip),
    sim_stops: (sim?.stops || []).map((stop, index) => ({ id: `sim-${index}`, label: stop.label || `Parada ${index + 1}`, latitude: stop.latitude ?? null, longitude: stop.longitude ?? null })),
    sim_origin_kind: sim?.origin_kind === "sede" && sim.origin_sede_id ? "sede" : sim?.origin_latitude != null ? "custom" : "sede",
    sim_origin_sede_id: sim?.origin_sede_id || "",
    sim_origin_label: sim?.origin_label || "",
    sim_origin_lat: sim?.origin_latitude ?? null,
    sim_origin_lng: sim?.origin_longitude ?? null,
    sim_destination_label: sim?.destination_label || "",
    sim_destination_lat: sim?.destination_latitude ?? null,
    sim_destination_lng: sim?.destination_longitude ?? null,
    sim_manual_km: sim?.source === "manual",
    sim_distance_km: sim?.calculated_distance_km ? String(sim.calculated_distance_km) : sim?.source !== "manual" && sim?.distance_km ? String(sim.distance_km) : "",
    sim_duration_min: sim?.duration_minutes ? String(sim.duration_minutes) : "",
    sim_polyline: null,
    sim_source: sim?.calculated_source === "google" || sim?.calculated_source === "osrm" || sim?.calculated_source === "estimate" ? sim.calculated_source : sim?.source === "google" || sim?.source === "osrm" || sim?.source === "estimate" ? sim.source : ""
  };
  return draft as RateCostDraft;
}
