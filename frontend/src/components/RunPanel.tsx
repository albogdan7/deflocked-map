import { useState, useRef, useEffect } from "react";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { ChevronLeft, ArrowUpDown, ChevronDown, ChevronUp, Download, ExternalLink, Bookmark, Trash2, X } from "lucide-react";
import { LOOP_COLORS } from "./MapView";
import type { LoopOption, RouteStats, SavedRoute } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PACE_MIN_MI: Record<string, number> = { walk: 18, bike: 5 };

function estTime(miles: number, mode: string): string | null {
  if (!miles) return null;
  const min = Math.round(miles * (PACE_MIN_MI[mode] ?? 18));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

interface NominatimResult {
  place_id: string;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    name?: string;
  };
}

function formatLabel(s: NominatimResult): { primary: string; secondary: string } {
  const a = s.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const locality = a.city || a.town || a.village || a.suburb || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  const primary = street || a.name || s.display_name.split(",")[0];
  const secondary = [locality, state, zip].filter(Boolean).join(", ");
  return { primary, secondary };
}

async function nominatim(q: string, viewbox: string | null, bounded: boolean, limit = 5): Promise<NominatimResult[]> {
  const p = new URLSearchParams({ q, format: "json", limit: String(limit), countrycodes: "us", addressdetails: "1" });
  if (viewbox) {
    p.set("viewbox", viewbox);
    if (bounded) p.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { "Accept-Language": "en" } });
  return res.json() as Promise<NominatimResult[]>;
}

interface AddressSearchProps {
  label: string;
  placeholder: string;
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
  viewbox: string | null;
  syncValue?: string | null;
  onValueChange?: (value: string) => void;
}

function AddressSearch({ label, placeholder, onSelect, disabled, viewbox, syncValue, onValueChange }: AddressSearchProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (syncValue != null) { setValue(syncValue); setSuggestions([]); }
  }, [syncValue]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    onValueChange?.(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        let data = await nominatim(q, viewbox, true);
        if (!data.length) data = await nominatim(q, viewbox, false);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }

  function pick(s: NominatimResult) {
    const { primary, secondary } = formatLabel(s);
    const text = secondary ? `${primary}, ${secondary}` : primary;
    setValue(text);
    onValueChange?.(text);
    setSuggestions([]);
    onSelect(parseFloat(s.lat), parseFloat(s.lon));
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setSuggestions([]); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) { pick(suggestions[0]); return; }
      const q = value.trim();
      if (!q) return;
      try {
        let data = await nominatim(q, viewbox, true, 1);
        if (!data.length) data = await nominatim(q, viewbox, false, 1);
        if (data.length) pick(data[0]);
      } catch {}
    }
  }

  function handleBlur() { setTimeout(() => setSuggestions([]), 150); }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground w-7 shrink-0 text-right">{label}</span>
        <Input
          className="h-9 bg-input border-border text-sm font-normal placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/50"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="ml-9 bg-popover border border-border rounded-lg overflow-hidden shadow-lg">
          {suggestions.map((s) => {
            const { primary, secondary } = formatLabel(s);
            return (
              <button
                key={s.place_id}
                className="block w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              >
                <span className="block text-sm font-medium text-foreground leading-snug">{primary}</span>
                {secondary && <span className="block text-xs text-muted-foreground mt-0.5">{secondary}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface RunPanelProps {
  mode: string;
  setMode: (mode: string) => void;
  avoidCameras: boolean;
  setAvoidCameras: (avoid: boolean) => void;
  targetMiles: number;
  setTargetMiles: (miles: number) => void;
  waypointCount: number;
  loopOptions: LoopOption[];
  activeLoopIdx: number;
  loading: boolean;
  error: string | null;
  routeStats: RouteStats | null;
  mapBounds: string | null;
  onSetStart: (lat: number, lon: number) => void;
  onSetEnd: (lat: number, lon: number) => void;
  onClear: () => void;
  onCloseLoop: () => void;
  onGenerateLoop: () => void;
  onSelectLoop: (idx: number) => void;
  onExportGPX: () => void;
  googleMapsUrl: string | null;
  savedRoutes: SavedRoute[];
  onSaveRoute: (name: string) => void;
  onLoadSavedRoute: (route: SavedRoute) => void;
  onDeleteSavedRoute: (id: number | string) => void;
  onCollapse: () => void;
  soloRoute: boolean;
  setSoloRoute: React.Dispatch<React.SetStateAction<boolean>>;
  gpsStartAddress: string | null;
  onSwap: () => void;
  isSignedIn: boolean;
}

export default function RunPanel({
  mode, setMode,
  avoidCameras, setAvoidCameras,
  targetMiles, setTargetMiles,
  waypointCount,
  loopOptions, activeLoopIdx,
  loading, error, routeStats,
  mapBounds,
  onSetStart, onSetEnd, onClear, onCloseLoop, onGenerateLoop, onSelectLoop,
  onExportGPX, googleMapsUrl,
  savedRoutes, onSaveRoute, onLoadSavedRoute, onDeleteSavedRoute,
  onCollapse,
  soloRoute, setSoloRoute,
  gpsStartAddress, onSwap,
  isSignedIn,
}: RunPanelProps) {
  const busy = loading;
  const actualMiles = routeStats?.length ?? 0;
  const pct = targetMiles > 0 ? Math.min(100, (actualMiles / targetMiles) * 100) : 0;

  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");

  useEffect(() => {
    if (gpsStartAddress) setStartText(gpsStartAddress);
  }, [gpsStartAddress]);

  function handleSwap() {
    const tmp = startText;
    setStartText(endText);
    setEndText(tmp);
    onSwap();
  }

  function doSave(name: string) {
    onSaveRoute(name.trim() || `Route ${new Date().toLocaleDateString()}`);
    setSaving(false);
    setSaveName("");
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  }

  return (
    <div
      className="absolute top-3.5 left-3.5 z-[1000] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      style={{ width: "var(--panel-w)" }}
    >
    <div className="flex flex-col w-full" style={{ maxHeight: "calc(100vh - 28px)", overflowY: "auto", overflowX: "hidden" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3.5 flex flex-col gap-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h1 className="text-base font-semibold tracking-tight leading-tight">
              <span className="text-primary">Deflock</span>Fitness
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Avoid ALPR cameras on your route</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] border-border text-muted-foreground hover:text-foreground">
                  Sign in
                </Button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onCollapse}
              title="Minimize panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {!isSignedIn && savedRoutes.length === 0 && (
          <p className="text-[11px] text-muted-foreground/70 text-center">Sign in to sync routes across devices</p>
        )}
      </div>

      <Separator className="bg-border" />

      {/* Address search */}
      <div className="px-5 py-3.5 flex flex-col gap-2">
        <AddressSearch
          label="From"
          placeholder="Start address or place…"
          onSelect={onSetStart}
          disabled={busy}
          viewbox={mapBounds}
          syncValue={startText}
          onValueChange={setStartText}
        />
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleSwap}
            title="Swap start and destination"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <AddressSearch
          label="To"
          placeholder="End address or place…"
          onSelect={onSetEnd}
          disabled={busy}
          viewbox={mapBounds}
          syncValue={endText}
          onValueChange={setEndText}
        />
      </div>

      <Separator className="bg-border" />

      {/* Distance + mode + avoid */}
      <div className="px-5 py-3.5 flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Target distance</span>
            <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
              {targetMiles}
            </span>
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
          <button
            type="button"
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
              mode === "walk"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("walk")}
          >
            Walk / Run
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
              mode === "bike"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("bike")}
          >
            Bike
          </button>
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

      <Separator className="bg-border" />

      {/* Actions */}
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

        <Button
          className="w-full font-medium"
          onClick={onGenerateLoop}
          disabled={waypointCount < 1 || busy}
        >
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

      {/* Loop options */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        loopOptions.length > 1 ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <Separator className="bg-border" />
        <div className="px-5 py-3.5 flex flex-col gap-2.5">
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
          <div className="flex flex-col gap-1.5">
            {loopOptions.map((opt, idx) => (
              <button
                key={idx}
                className={cn(
                  "flex items-center gap-2.5 bg-background border rounded-lg px-3 py-2.5 text-left w-full transition-colors",
                  idx === activeLoopIdx
                    ? "border-[--opt-color]"
                    : "border-border hover:bg-accent/30"
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

      {/* Stats */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        (loading || error || routeStats) ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <Separator className="bg-border" />
        <div className="px-5 py-3.5">
          {loading && <p className="text-xs text-muted-foreground py-1">Routing…</p>}
          {error && !loading && <p className="text-xs text-destructive py-1">{error}</p>}
          {routeStats && !loading && !error && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums">{actualMiles.toFixed(2)}</span>
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

      {/* Export + Save */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        (routeStats && !loading && !error) ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <Separator className="bg-border" />
        <div className="px-5 py-3.5 flex flex-col gap-2">
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

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            GPX imports exact route into Strava, Garmin, MapMyRun. Maps link approximates via 10 waypoints.
          </p>
        </div>
      </div>

      {/* Saved routes */}
      {savedRoutes && savedRoutes.length > 0 && (
        <>
          <Separator className="bg-border" />
          <div className="px-5 py-3.5 flex flex-col gap-2.5">
            <button
              className="flex justify-between items-center w-full"
              onClick={() => setShowSaved((s) => !s)}
            >
              <span className="text-xs font-medium text-muted-foreground">
                Saved Routes ({savedRoutes.length})
              </span>
              {showSaved
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              }
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
      )}

      {/* Attribution */}
      <Separator className="bg-border" />
      <div className="px-5 py-3 text-[10px] text-muted-foreground/60 leading-relaxed">
        Camera data:{" "}
        <a href="https://deflock.org" target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary underline-offset-2 hover:underline">
          DeFlock / OSM
        </a>
        {" · "}Routing: Valhalla
        {" · "}Right-click marker to remove · Drag route to reshape
      </div>
    </div>
    </div>
  );
}
