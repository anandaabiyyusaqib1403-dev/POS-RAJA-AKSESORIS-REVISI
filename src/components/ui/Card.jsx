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
  <div className={`mb-4 ${className}`}>{children}</div>
);

const CardTitle = ({ children, className = "" }) => (
  <h3 className={`text-lg font-semibold text-slate-950 ${className}`}>{children}</h3>
);

const CardContent = ({ children, className = "" }) => (
  <div className={`${className}`}>{children}</div>
);

export { Card, CardHeader, CardTitle, CardContent };
export default Card;
