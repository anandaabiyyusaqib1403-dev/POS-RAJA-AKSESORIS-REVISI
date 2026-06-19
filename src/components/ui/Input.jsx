const Input = ({ label, error, size = "sm", className = "", ...props }) => {
  const sizeClass = {
    sm: "",
    md: "brand-input-md",
    lg: "brand-input-lg",
  }[size] || "";

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          {label}
        </label>
      )}
      <input
        className={`brand-input ${sizeClass} ${error ? "border-red-500 focus:border-red-500 focus:shadow-none" : ""} ${className}`.trim()}
        {...props}
      />
      {error && <p className="text-xs font-semibold leading-5 text-red-600">{error}</p>}
    </div>
  );
};

export default Input;
