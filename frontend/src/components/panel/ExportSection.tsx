import { useState } from "react";
import { Download, ExternalLink, Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RouteStats } from "../../types";

interface ExportSectionProps {
  routeStats: RouteStats | null;
  loading: boolean;
  error: string | null;
  onExportGPX: () => void;
  googleMapsUrl: string | null;
  onSaveRoute: (name: string) => void;
}

export function ExportSection({
  routeStats, loading, error, onExportGPX, googleMapsUrl, onSaveRoute,
}: ExportSectionProps) {
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveFeedback, setSaveFeedback] = useState(false);

  function doSave(name: string) {
    onSaveRoute(name.trim() || `Route ${new Date().toLocaleDateString()}`);
    setSaving(false);
    setSaveName("");
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  }

  return (
    <div className={cn(
      "overflow-hidden transition-all duration-300 ease-in-out border-t border-border",
      (routeStats && !loading && !error) ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0 border-t-0"
    )}>
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs border-border text-muted-foreground hover:text-foreground gap-1.5"
            onClick={onExportGPX}
          >
            <Download className="h-3.5 w-3.5" />
            GPX (exact)
          </Button>
          {googleMapsUrl && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs border-border text-muted-foreground hover:text-foreground gap-1.5"
              asChild
            >
              <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Maps ↗
              </a>
            </Button>
          )}
        </div>

        {saveFeedback ? (
          <p className="text-xs text-primary text-center py-1">Route saved!</p>
        ) : saving ? (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => { e.preventDefault(); doSave(saveName); }}
          >
            <Input
              className="h-8 text-xs bg-input border-border"
              placeholder="Route name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm" className="h-8 text-xs px-3">Save</Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => { setSaving(false); setSaveName(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setSaving(true)}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Save Route
          </Button>
        )}

        <p className="text-xs text-muted-foreground/50 leading-relaxed">
          GPX imports exact route into Strava, Garmin, MapMyRun. Maps link approximates via 10 waypoints.
        </p>
      </div>
    </div>
  );
}
