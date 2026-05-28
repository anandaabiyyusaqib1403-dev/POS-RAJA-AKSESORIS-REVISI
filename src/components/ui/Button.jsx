const Button = ({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}) => {
  const baseClasses =
    "inline-flex max-w-full items-center justify-center gap-2 text-center font-semibold leading-5 transition duration-200 disabled:cursor-not-allowed disabled:opacity-60";

  const variants = {
    primary:
      "bg-[var(--brand-gold)] text-[#17130a] shadow-[0_8px_18px_rgba(212,175,55,0.18)] hover:bg-[#c9a227]",
    secondary:
      "border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text)] hover:border-[rgba(212,175,55,0.36)] hover:bg-[var(--brand-surface-tint)]",
    accent:
      "bg-[#16a34a] text-white shadow-[0_8px_18px_rgba(22,163,74,0.16)] hover:bg-[#15803d]",
    outline:
      "border border-[var(--brand-border)] bg-transparent text-[var(--brand-text)] hover:bg-[var(--surface-hover)]",
    danger:
      "bg-[var(--danger)] text-white shadow-[0_8px_18px_rgba(220,38,38,0.16)] hover:bg-rose-700",
    warning:
      "bg-[var(--warning)] text-white shadow-[0_8px_18px_rgba(180,83,9,0.16)] hover:bg-amber-800",
    ghost:
      "bg-transparent text-[var(--brand-text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--brand-text)]",
  };

  const sizes = {
    sm: "min-h-[var(--control-height-sm)] rounded-[var(--button-radius-sm)] px-4 py-2.5 text-sm",
    md: "min-h-[var(--control-height-md)] rounded-[var(--button-radius-md)] px-5 py-3 text-sm",
    lg: "min-h-[var(--control-height-lg)] rounded-[var(--button-radius-lg)] px-6 py-3 text-base",
    xl: "min-h-[var(--control-height-lg)] rounded-[var(--button-radius-lg)] px-7 py-3.5 text-lg",
  };

  const widthClass = fullWidth ? "w-full" : "";
  const resolvedVariant = variants[variant] || variants.primary;
  const resolvedSize = sizes[size] || sizes.md;

  return (
    <button
      type={type}
      className={`${baseClasses} ${resolvedVariant} ${resolvedSize} ${widthClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
