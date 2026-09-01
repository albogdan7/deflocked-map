import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedRoute } from "../../types";

interface SavedRoutesSectionProps {
  savedRoutes: SavedRoute[];
  onLoadSavedRoute: (route: SavedRoute) => void;
  onDeleteSavedRoute: (id: number | string) => void;
}

export function SavedRoutesSection({ savedRoutes, onLoadSavedRoute, onDeleteSavedRoute }: SavedRoutesSectionProps) {
  const [showSaved, setShowSaved] = useState(false);

  if (!savedRoutes.length) return null;

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2.5 border-t border-border">
        <button
          className="flex justify-between items-center w-full"
          onClick={() => setShowSaved((s) => !s)}
        >
          <span className="text-xs font-medium text-muted-foreground">
            Saved Routes ({savedRoutes.length})
          </span>
          {showSaved
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {showSaved && (
          <div className="flex flex-col gap-1.5">
            {savedRoutes.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5">
                <button
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-left hover:bg-accent/30 transition-colors min-w-0"
                  onClick={() => onLoadSavedRoute(r)}
                >
                  <span className="block text-sm font-medium truncate">{r.name}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {r.actualMiles.toFixed(1)} mi · {r.mode} · {r.date}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteSavedRoute(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
