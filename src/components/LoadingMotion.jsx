const DOT_COUNT = 10;

export default function LoadingMotion({ size = 160 }) {
  const radius = Math.max(20, Math.round(size * 0.24));
  const baseDotSize = Math.max(5, Math.round(size * 0.05));

  return (
    <div aria-hidden="true" className="relative shrink-0" style={{ width: size, height: size }}>
      {Array.from({ length: DOT_COUNT }).map((_, index) => {
        const angle = Math.round((360 / DOT_COUNT) * index);
        const scale = index % 5 === 0 ? 1.55 : index % 3 === 0 ? 1.18 : 0.9;
        const dotSize = Math.round(baseDotSize * scale);

        return (
          <span
            key={index}
            className="brand-loading-motion-dot"
            style={{
              "--brand-loading-transform": `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px)`,
              animationDelay: `-${(DOT_COUNT - index) * 84}ms`,
              height: dotSize,
              width: dotSize,
            }}
          />
        );
      })}
    </div>
  );
}
