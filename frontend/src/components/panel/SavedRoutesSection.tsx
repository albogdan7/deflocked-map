import { useState } from "react";
import { Bike, Footprints, Trash2, Bookmark, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedRoute } from "../../types";

interface SavedRoutesSectionProps {
  savedRoutes: SavedRoute[];
  onLoadSavedRoute: (route: SavedRoute) => void;
  onEditSavedRoute: (route: SavedRoute) => void;
  onDeleteSavedRoute: (id: number | string) => void;
}

export function SavedRoutesSection({ savedRoutes, onLoadSavedRoute, onEditSavedRoute, onDeleteSavedRoute }: SavedRoutesSectionProps) {
  const [confirmId, setConfirmId] = useState<number | string | null>(null);

  if (!savedRoutes.length) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-2.5 text-center">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/[0.03] border border-white/[0.05]">
          <Bookmark className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <p className="text-xs text-muted-foreground/70 max-w-[200px] leading-relaxed">
          No saved routes yet. Build a route and hit <span className="text-foreground/70 font-medium">Save</span> to keep it here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      {savedRoutes.map((r) => {
        const isBike = r.mode === "bike";
        const ModeIcon = isBike ? Bike : Footprints;
        const confirming = confirmId === r.id;

        return (
          <div
            key={r.id}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 transition-all duration-200",
              confirming
                ? "border-destructive/40 bg-destructive/[0.06]"
                : "border-white/[0.05] bg-black/20 hover:border-white/[0.10] hover:bg-black/30"
            )}
          >
            {confirming ? (
              <>
                <span className="flex-1 min-w-0 text-xs text-foreground/80 truncate">
                  Delete <span className="font-semibold text-foreground">{r.name}</span>?
                </span>
                <button
                  type="button"
                  className="shrink-0 h-7 px-2.5 rounded-[7px] text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors duration-150"
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="shrink-0 h-7 px-2.5 rounded-[7px] text-[11px] font-semibold bg-destructive text-white hover:bg-destructive/90 active:scale-[0.97] transition-all duration-150"
                  onClick={() => {
                    onDeleteSavedRoute(r.id);
                    setConfirmId(null);
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                  onClick={() => onLoadSavedRoute(r)}
                >
                  <div className="w-7 h-7 shrink-0 rounded-[8px] flex items-center justify-center bg-primary/[0.10] border border-primary/[0.14]">
                    <ModeIcon className="h-3.5 w-3.5 text-primary/90" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm font-medium truncate leading-tight">{r.name}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      {r.actualMiles.toFixed(1)} mi
                      <span className="text-muted-foreground/40"> · </span>
                      {r.date}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 h-7 w-7 rounded-[7px] flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-primary/[0.10] transition-colors duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onEditSavedRoute(r)}
                  title="Edit route — open in the planner"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="shrink-0 h-7 w-7 rounded-[7px] flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/[0.08] transition-colors duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setConfirmId(r.id)}
                  title="Delete route"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
