import { useEffect, useRef, useState } from "react";

export function useStickToBottom() {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const raf = useRef(0);
  const [inner, setInner] = useState<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const scroller = ref.current;
    if (!scroller || !inner) return;

    const follow = () => {
      raf.current = 0;
      if (!stick.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    };

    const ro = new ResizeObserver(() => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(follow);
    });
    ro.observe(inner);
    follow();
    return () => {
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [inner]);

  return { ref, innerRef: setInner, onScroll, pin };
}
