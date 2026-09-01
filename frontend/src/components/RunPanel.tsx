import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AddressSection } from "./panel/AddressSection";
import { OptionsSection } from "./panel/OptionsSection";
import { ActionsSection } from "./panel/ActionsSection";
import { LoopOptionsSection } from "./panel/LoopOptionsSection";
import { StatsSection } from "./panel/StatsSection";
import { ExportSection } from "./panel/ExportSection";
import { SavedRoutesSection } from "./panel/SavedRoutesSection";
import type { LoopOption, RouteStats, SavedRoute } from "../types";

interface RunPanelProps {
  mode: string;
  setMode: (mode: string) => void;
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

        <AddressSection
          onSetStart={onSetStart}
          onSetEnd={onSetEnd}
          onSwap={onSwap}
          disabled={loading}
          viewbox={mapBounds}
          gpsStartAddress={gpsStartAddress}
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
        />

        <SavedRoutesSection
          savedRoutes={savedRoutes}
          onLoadSavedRoute={onLoadSavedRoute}
          onDeleteSavedRoute={onDeleteSavedRoute}
        />

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
