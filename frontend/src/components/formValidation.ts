export function focusFirstError(form: HTMLElement, errors: Record<string, unknown>) {
  window.requestAnimationFrame(() => {
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]");
    const first = [...fields].find((field) => errors[field.name] && !field.disabled && field.type !== "hidden" && field.getClientRects().length > 0);
    if (first) first.focus();
    else form.querySelector<HTMLElement>('[role="alert"]')?.focus();
  });
}

export function fieldError(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (!field.willValidate) return "";
  const labelElement = field.labels?.[0];
  const label = (labelElement?.querySelector(".field-label")?.textContent ?? labelElement?.textContent)?.replace(/\s*\*\s*$/, "").trim() || "this field";
  if (field.validity.valueMissing || (field.required && !field.value.trim())) {
    return `${field instanceof HTMLSelectElement ? "Select" : "Enter"} ${label.toLowerCase()}.`;
  }
  if (field.validity.typeMismatch && field.type === "email") return "Enter a valid email address, such as name@example.com.";
  if (field.validity.patternMismatch && field.title) return field.title;
  if (field.validity.rangeUnderflow) return `Enter a value of at least ${"min" in field ? field.min : "the minimum"}.`;
  if (field.validity.rangeOverflow) return `Enter a value no greater than ${"max" in field ? field.max : "the maximum"}.`;
  return field.validity.valid ? "" : field.validationMessage;
}

export function updateVisibleErrors(previous: Record<string, string | undefined>, next: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, key === "form" || key === "attachments" ? value : next[key]]));
}
