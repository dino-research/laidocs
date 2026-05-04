import { useEffect, useState } from "react";
import { waitForSidecar } from "../lib/sidecar";

export type SidecarStatus = "starting" | "ready" | "error";

export function useSidecar() {
  const [status, setStatus] = useState<SidecarStatus>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    waitForSidecar()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error } as const;
}
