import { useRef, type CSSProperties, type MouseEvent } from "react";
import { Mark } from "../assets/Mark";

const DOTS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 47) % 100}%`,
  top: `${(i * 31 + 11) % 100}%`,
  delay: `${((i * 0.37) % 8).toFixed(2)}s`,
  duration: `${10 + (i % 7)}s`,
  size: `${2 + (i % 3)}px`,
  tone: i % 3 === 0 ? "purple" : i % 3 === 1 ? "cyan" : "blue",
}));

export function HeroScene() {
  const root = useRef<HTMLDivElement>(null);

  function onMove(event: MouseEvent<HTMLDivElement>) {
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty("--shift-x", `${(x * 14).toFixed(1)}px`);
    el.style.setProperty("--shift-y", `${(y * 10).toFixed(1)}px`);
  }

  function onLeave() {
    const el = root.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--shift-x", "0px");
    el.style.setProperty("--shift-y", "0px");
  }

  return (
    <div
      ref={root}
      className="hero-scene"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-hidden
    >
      <div className="hero-floor" />
      <div className="hero-orb hero-orb--a" />
      <div className="hero-orb hero-orb--b" />
      <div className="hero-rings">
        <span className="hero-ring hero-ring--a" />
        <span className="hero-ring hero-ring--b" />
      </div>
      <div className="hero-particles">
        {DOTS.map((dot, i) => (
          <span
            key={i}
            className={`hero-dot hero-dot--${dot.tone}`}
            style={
              {
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                animationDelay: dot.delay,
                animationDuration: dot.duration,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="hero-cube">
        <div className="hero-cube-tilt">
          <div className="hero-cube-spin">
            <div className="hero-face hero-face--front">
              <Mark size={56} />
            </div>
            <div className="hero-face hero-face--back">
              <Mark size={40} />
            </div>
            <div className="hero-face hero-face--right">
              <Mark size={40} />
            </div>
            <div className="hero-face hero-face--left">
              <Mark size={40} />
            </div>
            <div className="hero-face hero-face--top" />
            <div className="hero-face hero-face--bottom" />
          </div>
        </div>
      </div>
    </div>
  );
}
