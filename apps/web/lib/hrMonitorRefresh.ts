export const HR_MONITOR_REFRESH_EVENT = "apexos:hr-monitor-refresh";
const HR_MONITOR_REFRESH_STORAGE_KEY = "apexos_hr_monitor_refresh";

type RefreshDetail = {
  source?: string;
  route_id?: number | string | null;
  date?: string;
};

function safeBroadcast(detail: RefreshDetail) {
  if (typeof window === "undefined") return;
  const payload = { ...detail, emitted_at: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent(HR_MONITOR_REFRESH_EVENT, { detail: payload }));
  try {
    const channel = new BroadcastChannel(HR_MONITOR_REFRESH_EVENT);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel is optional; storage keeps cross-tab refresh working.
  }
  try {
    window.localStorage.setItem(HR_MONITOR_REFRESH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Local storage can be blocked in private contexts.
  }
}

export function publishHrMonitorRefresh(detail: RefreshDetail = {}) {
  safeBroadcast(detail);
}

export function subscribeHrMonitorRefresh(callback: (detail: RefreshDetail) => void) {
  if (typeof window === "undefined") return () => undefined;
  const onEvent = (event: Event) => callback((event as CustomEvent<RefreshDetail>).detail || {});
  const onStorage = (event: StorageEvent) => {
    if (event.key !== HR_MONITOR_REFRESH_STORAGE_KEY || !event.newValue) return;
    try {
      callback(JSON.parse(event.newValue));
    } catch {
      callback({});
    }
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(HR_MONITOR_REFRESH_EVENT);
    channel.onmessage = (event) => callback(event.data || {});
  } catch {
    channel = null;
  }
  window.addEventListener(HR_MONITOR_REFRESH_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(HR_MONITOR_REFRESH_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
