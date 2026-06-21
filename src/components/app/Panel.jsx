export default function Panel({
  children,
  className = "",
  variant = "default",
  as: Component = "section",
  ...props
}) {
  const variants = {
    default: "brand-panel",
    muted: "brand-panel brand-panel-muted",
    strong: "brand-panel brand-panel-strong",
    subtle: "brand-panel brand-panel-muted",
  };

  return (
    <Component className={`${variants[variant] || variants.default} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
