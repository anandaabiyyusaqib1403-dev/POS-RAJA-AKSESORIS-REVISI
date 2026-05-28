import LoadingMotion from "./LoadingMotion";

const LoadingStack = ({ messages = ["Memproses..."], size = 120 }) => {
  const label = messages.filter(Boolean).join(" ");

  return (
    <div className="flex items-center gap-6" role="status" aria-label={label || "Memproses..."}>
      <LoadingMotion size={size} />

      <div className="flex flex-col">
        {messages.map((m, i) => (
          <p key={i} className="text-sm text-slate-700">
            {m}
          </p>
        ))}
      </div>
    </div>
  );
};

export default LoadingStack;
