import { Button } from "@/components/ui/button";

interface ActionsSectionProps {
  waypointCount: number;
  loading: boolean;
  onGenerateLoop: () => void;
  onCloseLoop: () => void;
  onClear: () => void;
}

export function ActionsSection({
  waypointCount, loading, onGenerateLoop, onCloseLoop, onClear,
}: ActionsSectionProps) {
  const busy = loading;
  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      {waypointCount === 0 && (
        <p className="text-xs text-muted-foreground/70 text-center py-1">
          Set a start address or click the map to place a point
        </p>
      )}
      {waypointCount === 1 && (
        <p className="text-xs text-muted-foreground/70 text-center py-1">
          Add more waypoints or generate a loop from here
        </p>
      )}

      <Button
        className="w-full font-semibold tracking-[-0.01em] active:scale-[0.98] transition-all duration-200 rounded-[9px] h-9"
        onClick={onGenerateLoop}
        disabled={waypointCount < 1 || busy}
      >
        {busy ? "Routing…" : "Generate loop"}
      </Button>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-xs font-medium border-white/[0.08] bg-transparent text-muted-foreground hover:text-foreground hover:border-white/[0.14] hover:bg-white/[0.04] active:scale-[0.97] transition-all duration-200 rounded-[9px]"
          onClick={onCloseLoop}
          disabled={waypointCount < 2 || busy}
        >
          Close loop
        </Button>
        <Button
          variant="outline"
          className="flex-1 text-xs font-medium border-white/[0.08] bg-transparent text-muted-foreground hover:border-destructive/40 hover:text-destructive hover:bg-destructive/[0.06] active:scale-[0.97] transition-all duration-200 rounded-[9px]"
          onClick={onClear}
          disabled={waypointCount === 0 || busy}
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}
