import { useLayoutEffect, useRef } from "react";

export function useStickToBottom(trigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  function pin() {
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  useLayoutEffect(() => {
    if (!stick.current) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [trigger]);

  return { ref, onScroll, pin };
}
