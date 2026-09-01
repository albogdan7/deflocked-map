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
    <div className="px-5 py-3.5 flex flex-col gap-2.5">
      {waypointCount === 0 && (
        <p className="text-xs text-muted-foreground text-center py-1.5 px-3 rounded-lg bg-muted/40 border border-dashed border-border/60">
          Set a start address or click the map to place a point
        </p>
      )}
      {waypointCount === 1 && (
        <p className="text-xs text-muted-foreground text-center py-1.5 px-3 rounded-lg bg-muted/40 border border-dashed border-border/60">
          Add more waypoints or generate a loop from here
        </p>
      )}

      <Button className="w-full font-medium" onClick={onGenerateLoop} disabled={waypointCount < 1 || busy}>
        {busy ? "Routing…" : "Generate Loop"}
      </Button>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-xs border-border text-muted-foreground hover:text-foreground"
          onClick={onCloseLoop}
          disabled={waypointCount < 2 || busy}
        >
          Close Loop
        </Button>
        <Button
          variant="outline"
          className="flex-1 text-xs border-border text-muted-foreground hover:border-destructive hover:text-destructive"
          onClick={onClear}
          disabled={waypointCount === 0 || busy}
        >
          Clear All
        </Button>
      </div>
    </div>
  );
}
