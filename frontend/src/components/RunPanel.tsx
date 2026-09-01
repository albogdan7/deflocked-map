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
      className="absolute top-3.5 left-3.5 z-[1000] bg-card border border-border rounded-xl shadow-2xl flex flex-col"
      style={{ width: "var(--panel-w)", maxHeight: "calc(100vh - 28px)" }}
    >
      {/* Header — fixed, never scrolls */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">
          <span className="text-primary">Deflock</span>Fitness
        </h1>
        <div className="flex items-center gap-1.5">
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs border-border text-muted-foreground hover:text-foreground">
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

      <Separator className="bg-border shrink-0" />

      {/* Scrollable content */}
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0">
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

        <div className="px-4 py-3 text-xs text-muted-foreground/50 leading-relaxed border-t border-border">
          Camera data:{" "}
          <a href="https://deflock.org" target="_blank" rel="noreferrer" className="text-primary/60 hover:text-primary underline-offset-2 hover:underline">
            DeFlock / OSM
          </a>
          {" · "}Routing: Valhalla · Right-click marker to remove · Drag route to reshape
        </div>
      </div>
    </div>
  );
}
