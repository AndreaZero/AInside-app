import { useEffect, useRef, useState } from "react";

export function useTokenRate(text: string, active: boolean): number | null {
  const started = useRef<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      started.current = null;
      setRate(null);
      return;
    }
    if (started.current == null) {
      started.current = Date.now();
    }
    const elapsed = (Date.now() - started.current) / 1000;
    if (elapsed < 0.4 || text.length === 0) return;
    const tokens = text.length / 4;
    setRate(tokens / elapsed);
  }, [text, active]);

  return rate;
}
