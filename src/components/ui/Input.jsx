const Input = ({ label, error, size = "sm", className = "", ...props }) => {
  const sizeClass = {
    sm: "",
    md: "brand-input-md",
    lg: "brand-input-lg",
  }[size] || "";

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        className={`brand-input ${sizeClass} ${error ? "border-red-500 focus:border-red-500 focus:shadow-none" : ""} ${className}`.trim()}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default Input;
