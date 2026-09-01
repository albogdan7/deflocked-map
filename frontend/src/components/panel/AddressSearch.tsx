import { useState, useRef, useEffect } from "react";
import { nominatim, formatLabel, type NominatimResult } from "../../api/geocoding";
import { Input } from "@/components/ui/input";

interface AddressSearchProps {
  label: string;
  placeholder: string;
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
  viewbox: string | null;
  syncValue?: string | null;
  onValueChange?: (value: string) => void;
}

export function AddressSearch({
  label, placeholder, onSelect, disabled, viewbox, syncValue, onValueChange,
}: AddressSearchProps) {
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
