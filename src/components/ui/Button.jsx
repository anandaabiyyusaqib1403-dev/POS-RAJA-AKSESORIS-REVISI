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
    "disabled:cursor-not-allowed disabled:opacity-60";

  const variants = {
    primary: "brand-button-primary",
    secondary: "brand-button-secondary",
    accent: "brand-button-success",
    outline:
      "inline-flex max-w-full items-center justify-center gap-2 rounded-lg border border-[var(--brand-border)] bg-transparent text-center text-sm font-semibold leading-5 text-[var(--brand-text)] transition hover:border-[rgba(212,175,55,0.36)] hover:bg-[var(--surface-hover)]",
    danger: "brand-button-danger",
    warning: "brand-button-warning",
    ghost:
      "inline-flex max-w-full items-center justify-center gap-2 rounded-lg bg-transparent text-center text-sm font-semibold leading-5 text-[var(--brand-text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--brand-text)]",
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
