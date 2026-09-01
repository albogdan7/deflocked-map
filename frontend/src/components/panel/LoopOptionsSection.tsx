import { LOOP_COLORS } from "../../constants";
import { cn } from "@/lib/utils";
import type { LoopOption } from "../../types";

interface LoopOptionsSectionProps {
  loopOptions: LoopOption[];
  activeLoopIdx: number;
  onSelectLoop: (idx: number) => void;
  soloRoute: boolean;
  setSoloRoute: React.Dispatch<React.SetStateAction<boolean>>;
}

export function LoopOptionsSection({
  loopOptions, activeLoopIdx, onSelectLoop, soloRoute, setSoloRoute,
}: LoopOptionsSectionProps) {
  return (
    <div className={cn(
      "overflow-hidden transition-all duration-300 ease-in-out border-t border-border",
      loopOptions.length > 1 ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0 border-t-0"
    )}>
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Route Options</span>
          <button
            className={cn(
              "text-[10px] font-medium px-2 py-1 rounded border transition-colors",
              soloRoute
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setSoloRoute((s) => !s)}
            title={soloRoute ? "Show all routes" : "Show only selected route"}
          >
            {soloRoute ? "Show all" : "Solo view"}
          </button>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
          {loopOptions.map((opt, idx) => (
            <button
              key={idx}
              className={cn(
                "flex items-center gap-2.5 bg-background border rounded-lg px-3 py-2.5 text-left w-full transition-colors",
                idx === activeLoopIdx ? "border-[--opt-color]" : "border-border hover:bg-accent/30"
              )}
              style={{ "--opt-color": LOOP_COLORS[idx % LOOP_COLORS.length] } as React.CSSProperties}
              onClick={() => onSelectLoop(idx)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: LOOP_COLORS[idx % LOOP_COLORS.length] }}
              />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium">Option {idx + 1}</span>
                <span className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">{opt.actualMiles.toFixed(1)} mi</span>
                  <span className={cn("text-[10px] font-medium", opt.camerasOnRoute.length === 0 ? "text-primary" : "text-yellow-400")}>
                    {opt.camerasOnRoute.length === 0
                      ? "0 cameras"
                      : `${opt.camerasOnRoute.length} cam${opt.camerasOnRoute.length > 1 ? "s" : ""}`}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
