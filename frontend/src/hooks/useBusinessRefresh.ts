import { useEffect } from "react";

export function useBusinessRefresh(module: string, refresh: () => void) {
  useEffect(() => {
    const onUpdated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === module) refresh();
    };
    window.addEventListener("oasis:business-updated", onUpdated);
    return () => window.removeEventListener("oasis:business-updated", onUpdated);
  }, [module, refresh]);
}
