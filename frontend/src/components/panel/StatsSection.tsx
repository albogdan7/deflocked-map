import { cn } from "@/lib/utils";
import type { RouteStats } from "../../types";

const PACE_MIN_MI: Record<string, number> = { walk: 18, bike: 5 };

function estTime(miles: number, mode: string): string | null {
  if (!miles) return null;
  const min = Math.round(miles * (PACE_MIN_MI[mode] ?? 18));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

interface StatsSectionProps {
  loading: boolean;
  error: string | null;
  routeStats: RouteStats | null;
  targetMiles: number;
  mode: string;
}

export function StatsSection({ loading, error, routeStats, targetMiles, mode }: StatsSectionProps) {
  const actualMiles = routeStats?.length ?? 0;
  const pct = targetMiles > 0 ? Math.min(100, (actualMiles / targetMiles) * 100) : 0;

  return (
    <div className={cn(
      "overflow-hidden transition-all duration-300 ease-in-out border-t border-border",
      (loading || error || routeStats) ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0 border-t-0"
    )}>
      <div className="px-4 py-3">
        {loading && <p className="text-xs text-muted-foreground py-1">Routing…</p>}
        {error && !loading && <p className="text-xs text-destructive py-1">{error}</p>}
        {routeStats && !loading && !error && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums">{actualMiles.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">mi</span>
              {estTime(actualMiles, mode) && (
                <span className="text-sm text-muted-foreground ml-auto">{estTime(actualMiles, mode)}</span>
              )}
            </div>
            {targetMiles > 0 && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pct.toFixed(0)}% of {targetMiles} mi</span>
              <span className={routeStats.camerasOnRoute === 0 ? "text-primary" : "text-yellow-400"}>
                {routeStats.camerasOnRoute === 0
                  ? `${routeStats.camerasNearby} cameras avoided`
                  : `${routeStats.camerasOnRoute} on path`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
