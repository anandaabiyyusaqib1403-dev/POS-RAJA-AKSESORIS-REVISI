import Loading from "./Loading";

export default function LoadingState({
  text = "Memuat data...",
  fullScreen = false,
  size = 160,
  variant = "default",
}) {
  const renderSkeleton = () => {
    if (variant === "dashboard") {
      return (
        <div className="space-y-5" role="status" aria-label={text}>
          <span className="sr-only">{text}</span>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="brand-panel p-5">
                <div className="brand-skeleton h-6 w-28" />
                <div className="brand-skeleton mt-7 h-8 w-36" />
                <div className="brand-skeleton mt-4 h-4 w-44" />
              </div>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="brand-panel p-6">
              <div className="brand-skeleton h-7 w-48" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="brand-subtle-block">
                    <div className="brand-skeleton h-36 w-full" />
                    <div className="brand-skeleton mt-4 h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="brand-panel p-6">
              <div className="brand-skeleton h-7 w-40" />
              <div className="mt-6 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="brand-subtle-block">
                    <div className="brand-skeleton h-5 w-40" />
                    <div className="brand-skeleton mt-3 h-4 w-28" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (variant === "cashier") {
      return (
        <div className="space-y-5" role="status" aria-label={text}>
          <span className="sr-only">{text}</span>
          <div className="brand-panel p-5">
            <div className="brand-skeleton h-5 w-32" />
            <div className="brand-skeleton mt-4 h-14 w-full" />
            <div className="mt-5 flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="brand-skeleton h-10 w-28 shrink-0" />
              ))}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="brand-panel p-4">
                <div className="flex justify-between gap-3">
                  <div className="brand-skeleton h-6 w-24" />
                  <div className="brand-skeleton h-6 w-16" />
                </div>
                <div className="brand-skeleton mt-6 h-12 w-full" />
                <div className="brand-skeleton mt-4 h-4 w-28" />
                <div className="brand-skeleton mt-8 h-7 w-32" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const skeleton = renderSkeleton();
  if (skeleton) {
    return skeleton;
  }

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--brand-bg)] px-4">
        <div className="brand-panel px-8 py-8">
          <Loading text={text} size={size} />
        </div>
      </div>
    );
  }

  return (
    <div className="brand-panel flex min-h-[320px] items-center justify-center px-6 py-10">
      <Loading text={text} size={size} />
    </div>
  );
}
