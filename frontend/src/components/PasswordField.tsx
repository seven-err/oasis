import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  label,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}{inputProps.required && <span className="text-red-700"> *</span>}
      </label>
      <div className="relative mt-2">
        <input {...inputProps} id={id} className="input pr-12" type={visible ? "text" : "password"} />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[#1f6ea6] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]"
          onClick={() => setVisible(!visible)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
