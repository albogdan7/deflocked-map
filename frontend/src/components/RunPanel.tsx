import { useState } from "react";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AddressSection } from "./panel/AddressSection";
import { OptionsSection } from "./panel/OptionsSection";
import { ActionsSection } from "./panel/ActionsSection";
import { LoopOptionsSection } from "./panel/LoopOptionsSection";
import { StatsSection } from "./panel/StatsSection";
import { ExportSection } from "./panel/ExportSection";
import { SavedRoutesSection } from "./panel/SavedRoutesSection";
import type { GeoPoint } from "../api/geocoding";
import type { LoopOption, RouteStats, SavedRoute } from "../types";

interface RunPanelProps {
  mode: string;
  setMode: (mode: string) => void;
  targetMiles: number;
  setTargetMiles: (miles: number) => void;
  waypointCount: number;
  startPoint: GeoPoint | null;
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
  loadedRouteName: string | null;
  onUpdateRoute: () => void;
  onCollapse: () => void;
  busy?: boolean;
  soloRoute: boolean;
  setSoloRoute: React.Dispatch<React.SetStateAction<boolean>>;
  gpsStartAddress: string | null;
  loadedFromAddress: string | null;
  loadedToAddress: string | null;
  onSwap: () => void;
}

export default function RunPanel({
  mode, setMode,
  targetMiles, setTargetMiles,
  waypointCount, startPoint,
  loopOptions, activeLoopIdx,
  loading, error, routeStats,
  mapBounds,
  onSetStart, onSetEnd, onClear, onCloseLoop, onGenerateLoop, onSelectLoop,
  onExportGPX, googleMapsUrl,
  savedRoutes, onSaveRoute, onLoadSavedRoute, onDeleteSavedRoute,
  loadedRouteName, onUpdateRoute,
  onCollapse,
  soloRoute, setSoloRoute,
  gpsStartAddress, loadedFromAddress, loadedToAddress, onSwap,
  busy = false,
}: RunPanelProps) {
  const [activeTab, setActiveTab] = useState<"plan" | "saved">("plan");
  const hasSaved = savedRoutes.length > 0;
  // Fall back to Plan if the Saved tab empties out (e.g. last route deleted).
  const tab = hasSaved ? activeTab : "plan";

  return (
    /* Double-bezel shell: outer gradient ring → inner card */
    <div
      className="absolute top-3.5 left-3.5 z-[1000] p-[1.5px] rounded-[15px]"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.055)",
      }}
    >
      <div
        className="bg-card rounded-[13.5px] flex flex-col overflow-hidden"
        style={{
          width: "var(--panel-w)",
          maxHeight: "calc(100dvh - 28px)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.65), 0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
      {/* Header — fixed, never scrolls */}
      <div className="px-4 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 bg-primary/[0.14]">
            <span className="text-primary font-bold" style={{ fontSize: 9 }}>D</span>
          </div>
          <h1 className="text-[13px] font-semibold tracking-[-0.015em]">
            <span className="text-primary">Deflock</span>
            <span className="text-foreground/75"> Fitness</span>
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <SignedOut>
            <SignInButton mode="modal">
              <Button
                size="sm"
                className="h-7 px-3 text-[11px] font-semibold tracking-[0.005em] rounded-[7px] bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97] transition-all duration-200 border-0"
              >
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
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:scale-[0.95] transition-all duration-200 rounded-[7px]"
            onClick={onCollapse}
            title="Minimize panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator className="bg-border shrink-0" />

      {/* Global loading bar — route generation, saving, updating */}
      <div className="shrink-0 h-[2px]">{busy && <div className="loader-bar" />}</div>

      {/* Tab bar — only shown once there are saved routes */}
      {hasSaved && (
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="flex bg-black/20 rounded-[9px] p-[3px] gap-[3px] border border-white/[0.05]">
            {([
              { id: "plan", label: "Plan" },
              { id: "saved", label: `Saved (${savedRoutes.length})` },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all duration-200",
                  tab === t.id
                    ? "bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.4)] font-semibold"
                    : "text-muted-foreground hover:text-foreground/80"
                )}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="panel-scroll flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {tab === "saved" ? (
          <SavedRoutesSection
            savedRoutes={savedRoutes}
            onLoadSavedRoute={onLoadSavedRoute}
            onEditSavedRoute={(route) => { onLoadSavedRoute(route); setActiveTab("plan"); }}
            onDeleteSavedRoute={onDeleteSavedRoute}
          />
        ) : (
          <>
        <AddressSection
          onSetStart={onSetStart}
          onSetEnd={onSetEnd}
          onSwap={onSwap}
          disabled={loading}
          viewbox={mapBounds}
          gpsStartAddress={gpsStartAddress}
          startPoint={startPoint}
          startAddress={loadedFromAddress}
          endAddress={loadedToAddress}
        />

        <Separator className="bg-border" />

        <OptionsSection
          targetMiles={targetMiles}
          setTargetMiles={setTargetMiles}
          mode={mode}
          setMode={setMode}
        />

        <Separator className="bg-border" />

        <ActionsSection
          waypointCount={waypointCount}
          loading={loading}
          onGenerateLoop={onGenerateLoop}
          onCloseLoop={onCloseLoop}
          onClear={onClear}
        />

        <LoopOptionsSection
          loopOptions={loopOptions}
          activeLoopIdx={activeLoopIdx}
          onSelectLoop={onSelectLoop}
          soloRoute={soloRoute}
          setSoloRoute={setSoloRoute}
        />

        <StatsSection
          loading={loading}
          error={error}
          routeStats={routeStats}
          targetMiles={targetMiles}
          mode={mode}
        />

        <ExportSection
          routeStats={routeStats}
          loading={loading}
          error={error}
          onExportGPX={onExportGPX}
          googleMapsUrl={googleMapsUrl}
          onSaveRoute={onSaveRoute}
          loadedRouteName={loadedRouteName}
          onUpdateRoute={onUpdateRoute}
        />

        <div className="px-4 py-3 text-xs text-muted-foreground/40 leading-relaxed border-t border-border/50">
          Camera data:{" "}
          <a href="https://deflock.org" target="_blank" rel="noreferrer" className="text-primary/50 hover:text-primary/80 underline-offset-2 hover:underline transition-colors duration-150">
            DeFlock / OSM
          </a>
          {" · "}Routing: Valhalla · Right-click marker to remove · Drag route to reshape
        </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
