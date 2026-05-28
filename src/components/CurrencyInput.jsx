import React, { forwardRef, useState } from "react";
import { formatPlainNumber, formatRupiah } from "../utils/format";

const CurrencyInput = forwardRef(function CurrencyInput(
  { value, onChange, className = "", placeholder = "", currency = false, ...props },
  ref
) {
  const [focused, setFocused] = useState(false);

  // Keep a local string value to avoid cursor jumps when plain formatting is inactive.
  const normalized = value === null || value === undefined ? "" : String(value);

  const display = (() => {
    if (normalized === "") return "";
    const num = Number(normalized.replace(/[^0-9.-]+/g, ""));
    if (!Number.isFinite(num)) return normalized;
    if (currency) return formatRupiah(num);
    if (focused) return normalized;
    return formatPlainNumber(num);
  })();

  const handleChange = (e) => {
    const raw = String(e.target.value || "");
    const digits = raw.replace(/\D+/g, "");
    onChange?.(digits);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    />
  );
});

export default CurrencyInput;
