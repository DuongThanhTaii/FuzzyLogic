import { useState, useEffect, useRef } from "react";

const HEALTH_URL =
  (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "") + "/health";
const POLL_MS = 3000;

export function useBackendHealth() {
  const [online, setOnline] = useState(null); // null=checking, true=online, false=offline
  const timerRef = useRef(null);

  const check = async () => {
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(2000),
      });
      setOnline(res.ok);
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    check();
    timerRef.current = setInterval(check, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  return online;
}
