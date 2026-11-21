import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ className = "", id, ...props }: ComponentProps<"input">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <span className={`relative block ${className}`}>
      <input {...props} id={inputId} type={visible ? "text" : "password"} className="input pr-12" />
      <button
        type="button"
        className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded text-[#1f6ea6] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputId}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
