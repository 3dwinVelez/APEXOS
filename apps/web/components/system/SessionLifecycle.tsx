"use client";

import { keepSessionAlive, touchSession } from "@/lib/sessionSecurity";
import { useEffect } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll"];

export function SessionLifecycle() {
  useEffect(() => {
    const handleActivity = () => touchSession();
    const handleKeepAlive = () => {
      keepSessionAlive().catch(() => undefined);
    };

    for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName, handleActivity, { passive: true });
    document.addEventListener("visibilitychange", handleActivity);
    handleKeepAlive();
    const interval = window.setInterval(handleKeepAlive, 60000);
    return () => {
      for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName, handleActivity);
      document.removeEventListener("visibilitychange", handleActivity);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
