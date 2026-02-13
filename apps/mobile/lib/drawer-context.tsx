import React, { useMemo, useState } from 'react';

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
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
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
