import { ArrowLeft } from "lucide-react";
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { confirmLeavingUnsavedForm } from "@/hooks/useUnsavedForm";

type BackAction = { onBack: () => void; disabled: boolean };
type RegisterBack = (action: BackAction) => () => void;

const RegisterBackContext = createContext<RegisterBack | null>(null);
const BackActionContext = createContext<BackAction | null>(null);

export function HeaderBackProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<BackAction | null>(null);
  const register = useCallback<RegisterBack>((next) => {
    setAction(next);
    return () => setAction((current) => current === next ? null : current);
  }, []);

  return (
    <RegisterBackContext.Provider value={register}>
      <BackActionContext.Provider value={action}>{children}</BackActionContext.Provider>
    </RegisterBackContext.Provider>
  );
}

/** Register the current screen's return action with the shared app header. */
export function useHeaderBack(onBack?: () => void, disabled = false) {
  const register = useContext(RegisterBackContext);
  useLayoutEffect(() => {
    if (register && onBack) return register({ onBack, disabled });
  }, [register, onBack, disabled]);
}

export function HeaderBackButton({ fallback }: { fallback: () => void }) {
  const action = useContext(BackActionContext);
  return (
    <button
      type="button"
      onClick={() => { if (confirmLeavingUnsavedForm()) (action?.onBack ?? fallback)(); }}
      disabled={action?.disabled ?? false}
      className="inline-flex min-h-10 items-center gap-2 border-0 bg-transparent px-0 text-sm font-medium text-[#16344d] shadow-none transition-[color,scale] duration-300 ease-out motion-reduce:transition-none hover:text-[#1f6ea6] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Back
    </button>
  );
}
