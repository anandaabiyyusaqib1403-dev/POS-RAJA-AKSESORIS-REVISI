const Card = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`brand-panel p-6 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
};

const CardHeader = ({ children, className = "" }) => (
  <div className={`mb-4 border-b border-[var(--brand-border)] pb-4 ${className}`.trim()}>{children}</div>
);

const CardTitle = ({ children, className = "" }) => (
  <h3 className={`font-display text-lg font-bold tracking-tight text-slate-950 ${className}`.trim()}>{children}</h3>
);

const CardContent = ({ children, className = "" }) => (
  <div className={`${className}`}>{children}</div>
);

export { Card, CardHeader, CardTitle, CardContent };
export default Card;
