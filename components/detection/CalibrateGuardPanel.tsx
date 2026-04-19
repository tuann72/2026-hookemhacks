"use client";

import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import {
  type HandMetrics,
  type Params,
  type Range,
  RANGES,
  isOff,
} from "@/lib/detection/punch";

// Reusable calibration + tuning UI for the punch detector. Reads shared
// state from usePunchCalibrationStore; consumes detector callbacks + live
// metrics via props. Two layouts:
//   - variant="full"    → punch-test page (sidebar + main panel)
//   - variant="overlay" → world-page debug overlay (compact fixed sidebar)

export type CalibrateGuardPanelProps = {
  onCalibrate: () => void;
  onResetCounts: () => void;
  variant?: "full" | "overlay";
  onClose?: () => void;
};

export function CalibrateGuardPanel({
  onCalibrate,
  onResetCounts,
  variant = "full",
  onClose,
}: CalibrateGuardPanelProps) {
  const pending = usePunchCalibrationStore((s) => s.pending);
  const active = usePunchCalibrationStore((s) => s.active);
  const baseline = usePunchCalibrationStore((s) => s.baseline);
  const countdown = usePunchCalibrationStore((s) => s.countdown);
  const calibrateMsg = usePunchCalibrationStore((s) => s.calibrateMsg);
  const leftCount = usePunchCalibrationStore((s) => s.leftCount);
  const rightCount = usePunchCalibrationStore((s) => s.rightCount);
  const leftMetrics = usePunchCalibrationStore((s) => s.leftMetrics);
  const rightMetrics = usePunchCalibrationStore((s) => s.rightMetrics);
  const setPending = usePunchCalibrationStore((s) => s.setPending);
  const applyPending = usePunchCalibrationStore((s) => s.applyPending);

  const calibratedLeft = !!baseline?.left;
  const calibratedRight = !!baseline?.right;
  const anyCalibrated = calibratedLeft || calibratedRight;
  const inGuard =
    anyCalibrated &&
    (!calibratedLeft || leftMetrics.inGuard) &&
    (!calibratedRight || rightMetrics.inGuard);
  const pendingDirty =
    pending.size !== active.size ||
    pending.rotation !== active.rotation ||
    pending.velocity !== active.velocity ||
    pending.guard !== active.guard ||
    pending.cooldown !== active.cooldown;

  const onDefaults = () => {
    setPending({
      size: 3.5,
      rotation: 0,
      velocity: 0,
      guard: 0.1,
      cooldown: 550,
    });
  };

  const Controls = (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
            Calibration
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-200"
            >
              close
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onCalibrate}
          className={`w-full rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-widest ${
            countdown !== null
              ? "border border-rose-500/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
              : "border border-cyan-500/60 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
          }`}
        >
          {countdown !== null
            ? `Cancel · ${countdown}`
            : anyCalibrated
              ? "Re-calibrate guard"
              : "Calibrate guard"}
        </button>
        <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          {countdown !== null
            ? "Hold your guard — capturing in 3 seconds."
            : anyCalibrated
              ? `Locked: ${[calibratedLeft && "L", calibratedRight && "R"]
                  .filter(Boolean)
                  .join(" + ")}. Press again to re-capture any visible hand.`
              : "Hold your guard, then press. Any visible hand is captured."}
          {calibrateMsg && (
            <div className="mt-1 text-rose-400">{calibrateMsg}</div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          Thresholds · far-left = off
        </div>
        <ParamSlider
          label="Size (knuckle × pinky)"
          value={pending.size}
          onChange={(v) => setPending((p) => ({ ...p, size: v }))}
          range={RANGES.size}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <ParamSlider
          label="Rotation (wrist Δ)"
          value={pending.rotation}
          onChange={(v) => setPending((p) => ({ ...p, rotation: v }))}
          range={RANGES.rotation}
          format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
        <ParamSlider
          label="Velocity (wrist speed)"
          value={pending.velocity}
          onChange={(v) => setPending((p) => ({ ...p, velocity: v }))}
          range={RANGES.velocity}
        />
        <ParamSlider
          label="Guard tolerance"
          value={pending.guard}
          onChange={(v) => setPending((p) => ({ ...p, guard: v }))}
          range={RANGES.guard}
          format={(v) => v.toFixed(3)}
        />
        <ParamSlider
          label="Same-hand cooldown"
          value={pending.cooldown}
          onChange={(v) => setPending((p) => ({ ...p, cooldown: v }))}
          range={RANGES.cooldown}
          format={(v) => `${Math.round(v)} ms`}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={applyPending}
          disabled={!pendingDirty}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest transition ${
            pendingDirty
              ? "border border-emerald-500/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              : "cursor-not-allowed border border-zinc-700 bg-zinc-800/50 text-zinc-500"
          }`}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onDefaults}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800"
        >
          Defaults
        </button>
        <button
          type="button"
          onClick={onResetCounts}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
          Active thresholds
        </div>
        <div>
          size:{" "}
          {isOff(active.size, RANGES.size)
            ? "off"
            : `${active.size.toFixed(2)}×`}
          {"   "}rot:{" "}
          {isOff(active.rotation, RANGES.rotation)
            ? "off"
            : `${Math.round((active.rotation * 180) / Math.PI)}°`}
        </div>
        <div>
          vel:{" "}
          {isOff(active.velocity, RANGES.velocity)
            ? "off"
            : active.velocity.toFixed(2)}
          {"   "}guard: {active.guard.toFixed(3)}
        </div>
        <div>cooldown: {Math.round(active.cooldown)} ms</div>
      </div>
    </div>
  );

  const Counts = (
    <div className="relative flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/80 px-6 py-8">
      {countdown !== null && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
          <div className="text-[11px] uppercase tracking-[0.4em] text-cyan-300">
            Calibrating in
          </div>
          <div className="mt-1 font-mono text-[140px] font-bold leading-none tabular-nums text-white">
            {countdown}
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-[0.3em] text-zinc-400">
            hold your guard
          </div>
        </div>
      )}
      <div className="text-[10px] uppercase tracking-[0.4em] text-zinc-500">
        Total punches
      </div>
      <div className="mt-1 font-mono text-[96px] font-bold leading-none tabular-nums text-white">
        {leftCount + rightCount}
      </div>
      <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400">
            Left
          </div>
          <div className="font-mono text-3xl tabular-nums text-emerald-200">
            {leftCount}
          </div>
        </div>
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-cyan-400">
            Right
          </div>
          <div className="font-mono text-3xl tabular-nums text-cyan-200">
            {rightCount}
          </div>
        </div>
      </div>
      <div
        className={`mt-5 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] transition-opacity ${
          anyCalibrated
            ? inGuard
              ? "bg-emerald-500/20 text-emerald-200 opacity-100"
              : "bg-zinc-800/50 text-zinc-500 opacity-80"
            : "bg-amber-500/20 text-amber-200 opacity-100"
        }`}
      >
        {anyCalibrated
          ? inGuard
            ? "In guard position"
            : "Out of guard"
          : "Calibrate to enable guard tracking"}
      </div>
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="pointer-events-auto absolute left-4 top-16 z-20 flex max-h-[calc(100vh-5rem)] w-[340px] flex-col gap-4 overflow-y-auto text-zinc-100">
        {Controls}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">
              Counts
            </span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              total {leftCount + rightCount}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
              <div className="text-[9px] uppercase tracking-widest text-emerald-400">
                Left
              </div>
              <div className="font-mono text-xl tabular-nums text-emerald-200">
                {leftCount}
              </div>
            </div>
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-2 text-center">
              <div className="text-[9px] uppercase tracking-widest text-cyan-400">
                Right
              </div>
              <div className="font-mono text-xl tabular-nums text-cyan-200">
                {rightCount}
              </div>
            </div>
          </div>
          <div
            className={`mt-3 rounded-full px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.3em] ${
              anyCalibrated
                ? inGuard
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-zinc-800/50 text-zinc-500"
                : "bg-amber-500/20 text-amber-200"
            }`}
          >
            {anyCalibrated
              ? inGuard
                ? "In guard"
                : "Out of guard"
              : "Not calibrated"}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <MetricsCard side="Left" metrics={leftMetrics} active={active} />
          <MetricsCard side="Right" metrics={rightMetrics} active={active} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[360px_1fr]">
      {Controls}
      <div className="flex flex-col gap-6">
        {Counts}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricsCard side="Left" metrics={leftMetrics} active={active} />
          <MetricsCard side="Right" metrics={rightMetrics} active={active} />
        </div>
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  value,
  onChange,
  range,
  suffix,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  range: Range;
  suffix?: string;
  format?: (v: number) => string;
}) {
  const safeValue = Number.isFinite(value) ? value : range.min;
  const off = isOff(safeValue, range);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] uppercase tracking-widest text-zinc-400">
          {label}
        </label>
        <span
          className={`font-mono text-xs tabular-nums ${
            off ? "text-rose-400" : "text-emerald-300"
          }`}
        >
          {off
            ? "OFF"
            : (format ? format(safeValue) : safeValue.toFixed(2)) +
              (suffix ?? "")}
        </span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={safeValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </div>
  );
}

function Bar({
  ratio,
  met,
  label,
}: {
  ratio: number;
  met: boolean;
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`absolute inset-y-0 left-0 transition-[width] duration-75 ease-out ${
            met ? "bg-emerald-400" : "bg-cyan-400/60"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MetricsCard({
  side,
  metrics,
  active,
}: {
  side: string;
  metrics: HandMetrics;
  active: Params;
}) {
  const sizeOff = isOff(active.size, RANGES.size);
  const rotOff = isOff(active.rotation, RANGES.rotation);
  const velOff = isOff(active.velocity, RANGES.velocity);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">
          {side} hand
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
            metrics.detected
              ? metrics.inGuard
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-cyan-500/10 text-cyan-200"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {metrics.detected ? (metrics.inGuard ? "guard" : "tracking") : "no hand"}
        </span>
      </div>
      <div className="space-y-2">
        <Bar
          label="size"
          ratio={sizeOff ? 0 : metrics.sizeRatio}
          met={!sizeOff && metrics.sizeMet}
        />
        <Bar
          label="rot"
          ratio={rotOff ? 0 : metrics.rotRatio}
          met={!rotOff && metrics.rotMet}
        />
        <Bar
          label="vel"
          ratio={velOff ? 0 : metrics.velRatio}
          met={!velOff && metrics.velMet}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] tabular-nums text-zinc-500">
        <span>
          s <span className="text-zinc-300">{metrics.size.toFixed(3)}</span>
        </span>
        <span>
          r{" "}
          <span className="text-zinc-300">
            {((metrics.rotation * 180) / Math.PI).toFixed(0)}°
          </span>
        </span>
        <span>
          v <span className="text-zinc-300">{metrics.velocity.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}
