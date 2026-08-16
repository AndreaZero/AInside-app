import { useHardwareProfile } from "../hooks/useHardwareProfile";
import { useRuntime } from "../hooks/useRuntime";
import { cx } from "../lib/cx";
import { formatGb } from "../lib/format";
import { performanceFill, ramUsedRatio, runtimeActivity } from "../lib/resources";
import { ProgressBar } from "../ui/controls";

export function SystemWidget() {
  const machine = useHardwareProfile();
  const runtime = useRuntime();
  const activity = runtimeActivity(runtime.snapshot?.phase);

  if (machine.status !== "ready") {
    return (
      <div className="sys-card">
        <div className="sys-head">
          <div>
            <p className="sys-kicker">Prestazioni AI</p>
            <p className="sys-score">In lettura</p>
          </div>
          <span className="sys-dot is-warn" />
        </div>
      </div>
    );
  }

  const { hardware, performance, performanceLabel } = machine.profile;
  const ram = ramUsedRatio(hardware.memory.totalBytes, hardware.memory.availableBytes);
  const tone =
    performance === "limited" ? "is-bad" : performance === "fair" ? "is-warn" : undefined;

  return (
    <div className="sys-card">
      <div className="sys-head">
        <div>
          <p className="sys-kicker">Prestazioni AI</p>
          <p className="sys-score">{performanceLabel}</p>
        </div>
        <span className={cx("sys-dot", tone)} />
      </div>
      <div className="sys-meters">
        <MiniMeter
          label="CPU"
          value={Math.max(activity, performanceFill(performance) * 0.35)}
          display={hardware.cpu.cores != null ? `${hardware.cpu.cores}c` : undefined}
        />
        <MiniMeter
          label="GPU"
          value={hardware.gpus[0] ? Math.max(activity, 0.22) : 0.08}
          display={
            hardware.gpus[0]?.vramBytes != null
              ? formatGb(hardware.gpus[0].vramBytes)
              : hardware.gpus[0]
                ? "ok"
                : "—"
          }
          tone="cyan"
        />
        <MiniMeter
          label="RAM"
          value={ram ?? 0}
          display={ram != null ? `${Math.round(ram * 100)}%` : "—"}
          tone="success"
        />
      </div>
    </div>
  );
}

function MiniMeter({
  label,
  value,
  display,
  tone = "accent",
}: {
  label: string;
  value: number;
  display?: string;
  tone?: "accent" | "success" | "cyan";
}) {
  return (
    <div className="ui-meter">
      <div className="ui-meter-row">
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <ProgressBar value={value * 100} tone={tone} />
    </div>
  );
}
