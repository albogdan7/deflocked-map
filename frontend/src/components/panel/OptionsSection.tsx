import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface OptionsSectionProps {
  targetMiles: number;
  setTargetMiles: (miles: number) => void;
  mode: string;
  setMode: (mode: string) => void;
}

export function OptionsSection({
  targetMiles, setTargetMiles, mode, setMode,
}: OptionsSectionProps) {
  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Target distance</span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-foreground w-8 text-right">{targetMiles}</span>
          <span className="text-xs text-muted-foreground">mi</span>
        </div>
        <Slider
          value={[targetMiles]}
          onValueChange={([v]) => setTargetMiles(v)}
          min={0.5}
          max={26.2}
          step={0.5}
          className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary [&_.bg-primary]:bg-primary"
        />
      </div>

      <div className="flex bg-black/20 rounded-[9px] p-[3px] gap-[3px] border border-white/[0.05]">
        {(["walk", "bike"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all duration-200",
              mode === m
                ? "bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.4)] font-semibold"
                : "text-muted-foreground hover:text-foreground/80"
            )}
            onClick={() => setMode(m)}
          >
            {m === "walk" ? "Walk / Run" : "Bike"}
          </button>
        ))}
      </div>
    </div>
  );
}
