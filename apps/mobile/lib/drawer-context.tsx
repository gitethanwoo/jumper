import React, { useMemo, useState } from 'react';
import { hapticTap } from '@/lib/haptics';

type DrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

export function DrawerProvider(props: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<DrawerContextValue>(
    () => ({
      isOpen,
      open: () => {
        hapticTap();
        setIsOpen(true);
      },
      close: () => {
        hapticTap();
        setIsOpen(false);
      },
      toggle: () => {
        hapticTap();
        setIsOpen((prev) => !prev);
      },
    }),
    [isOpen]
  );

  return <DrawerContext.Provider value={value}>{props.children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const context = React.use(DrawerContext);
  if (!context) throw new Error('DrawerProvider missing');
  return context;
}
