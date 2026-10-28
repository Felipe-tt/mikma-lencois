'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { OnPathnameChange } from '@/components/ui/Pathname';

interface NavigationCtx {
  navigating: boolean;
  startNavigation: () => void;
}

const NavigationContext = createContext<NavigationCtx>({
  navigating: false,
  startNavigation: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [navigating, setNavigating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // When pathname actually changes -> the new page is rendering -> fade it in
  const onPathnameChange = useCallback(() => {
    clearTimeout(timerRef.current);
    // Small delay so the new page DOM is painted before we remove the overlay
    timerRef.current = setTimeout(() => setNavigating(false), 50);
  }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const startNavigation = useCallback(() => {
    clearTimeout(timerRef.current);
    setNavigating(true);
  }, []);

  return (
    <NavigationContext.Provider value={{ navigating, startNavigation }}>
      <OnPathnameChange onChange={onPathnameChange} />
      {children}
    </NavigationContext.Provider>
  );
}
