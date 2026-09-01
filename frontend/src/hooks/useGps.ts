import { useState, useCallback, useEffect, useRef } from "react";
import { reverseGeocode } from "../api/geocoding";

interface UseGpsOptions {
  userSetStartRef: React.MutableRefObject<boolean>;
  onGpsStart: (lat: number, lon: number) => void;
}

export function useGps({ userSetStartRef, onGpsStart }: UseGpsOptions) {
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStartAddress, setGpsStartAddress] = useState<string | null>(null);
  const gpsStartSetRef = useRef(false);

  // First-fix: set start waypoint + reverse geocode the address for the From field.
  // gpsStartSetRef prevents re-firing on every subsequent position update.
  useEffect(() => {
    if (!gpsEnabled) {
      gpsStartSetRef.current = false;
      setGpsStartAddress(null);
      return;
    }
    if (!gpsPosition || gpsStartSetRef.current) return;
    gpsStartSetRef.current = true;
    const { lat, lon } = gpsPosition;
    onGpsStart(lat, lon);
    reverseGeocode(lat, lon)
      .then((addr) => {
        // userSetStartRef.current is read lazily — no need in effect deps
        if (!userSetStartRef.current) setGpsStartAddress(addr);
      })
      .catch(() => {
        if (!userSetStartRef.current) setGpsStartAddress("Current Location");
      });
  }, [gpsPosition, gpsEnabled, onGpsStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGpsPosition = useCallback((lat: number, lon: number) => {
    setGpsError(null);
    setGpsPosition({ lat, lon });
  }, []);

  const handleGpsError = useCallback((msg: string) => {
    setGpsError(msg);
  }, []);

  const toggleGps = useCallback(() => {
    setGpsEnabled((prev) => !prev);
    setGpsError(null);
    setGpsPosition(null);
  }, []);

  return {
    gpsEnabled,
    gpsError,
    gpsStartAddress,
    handleGpsPosition,
    handleGpsError,
    toggleGps,
  };
}
