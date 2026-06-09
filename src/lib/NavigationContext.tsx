'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // When pathname actually changes -> the new page is rendering -> fade it in
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    clearTimeout(timerRef.current);
    // Small delay so the new page DOM is painted before we remove the overlay
    timerRef.current = setTimeout(() => setNavigating(false), 50);

    return () => clearTimeout(timerRef.current);
  }, [pathname]);

  const startNavigation = useCallback(() => {
    clearTimeout(timerRef.current);
    setNavigating(true);
  }, []);

  return (
    <NavigationContext.Provider value={{ navigating, startNavigation }}>
      {children}
    </NavigationContext.Provider>
  );
}
