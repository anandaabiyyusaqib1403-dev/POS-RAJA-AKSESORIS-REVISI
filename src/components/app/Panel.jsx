export default function Panel({
  children,
  className = "",
  variant = "default",
  ...props
}) {
  const variants = {
    default: "brand-panel",
    muted: "brand-panel brand-panel-muted",
    strong: "brand-panel brand-panel-strong",
  };

  return (
    <section className={`${variants[variant] || variants.default} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
