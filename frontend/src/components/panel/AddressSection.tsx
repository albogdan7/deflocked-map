import { useState, useEffect } from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressSearch } from "./AddressSearch";

interface AddressSectionProps {
  onSetStart: (lat: number, lon: number) => void;
  onSetEnd: (lat: number, lon: number) => void;
  onSwap: () => void;
  disabled: boolean;
  viewbox: string | null;
  gpsStartAddress: string | null;
}

export function AddressSection({
  onSetStart, onSetEnd, onSwap, disabled, viewbox, gpsStartAddress,
}: AddressSectionProps) {
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

  return (
    <div className="px-5 py-3.5 flex flex-col gap-2">
      <AddressSearch
        label="From"
        placeholder="Start address or place…"
        onSelect={onSetStart}
        disabled={disabled}
        viewbox={viewbox}
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
        disabled={disabled}
        viewbox={viewbox}
        syncValue={endText}
        onValueChange={setEndText}
      />
    </div>
  );
}
