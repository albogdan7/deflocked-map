import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface OptionsSectionProps {
  targetMiles: number;
  setTargetMiles: (miles: number) => void;
  mode: string;
  setMode: (mode: string) => void;
  avoidCameras: boolean;
  setAvoidCameras: (avoid: boolean) => void;
}

export function OptionsSection({
  targetMiles, setTargetMiles, mode, setMode, avoidCameras, setAvoidCameras,
}: OptionsSectionProps) {
  return (
    <div className="px-5 py-3.5 flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Target distance</span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{targetMiles}</span>
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

      <div className="flex bg-input rounded-lg p-1 gap-1">
        {(["walk", "bike"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode(m)}
          >
            {m === "walk" ? "Walk / Run" : "Bike"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="avoid-cameras"
          checked={avoidCameras}
          onCheckedChange={(c) => setAvoidCameras(c === true)}
          className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <label htmlFor="avoid-cameras" className="text-sm text-foreground cursor-pointer select-none">
          Avoid ALPR cameras
        </label>
      </div>
    </div>
  );
}
