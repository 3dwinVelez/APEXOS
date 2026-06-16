"use client";

import { loadModuleAccess } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { useEffect, useState } from "react";

type ApexAiAccess = "checking" | "enabled" | "disabled";

export function useApexAiAccess() {
  const [access, setAccess] = useState<ApexAiAccess>("checking");

  useEffect(() => {
    let alive = true;

    loadModuleAccess(MODULES)
      .then((state) => {
        if (alive) setAccess(state.bySlug["apex-ai"] === true ? "enabled" : "disabled");
      })
      .catch(() => {
        if (alive) setAccess("disabled");
      });

    return () => {
      alive = false;
    };
  }, []);

  return access;
}
