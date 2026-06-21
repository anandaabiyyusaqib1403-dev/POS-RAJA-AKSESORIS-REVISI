import logoSrc from "../assets/raja-aksesoris-logo.png";

const sizeClasses = {
  sm: "h-12 w-12",
  md: "h-14 w-14",
  lg: "h-20 w-20",
  xl: "h-28 w-28",
};

export default function BrandMark({ size = "md", className = "" }) {
  const resolvedSize = sizeClasses[size] || sizeClasses.md;

  return (
    <img
      src={logoSrc}
      alt="Logo Raja Aksesoris"
      className={`${resolvedSize} object-contain ${className}`.trim()}
    />
  );
}
