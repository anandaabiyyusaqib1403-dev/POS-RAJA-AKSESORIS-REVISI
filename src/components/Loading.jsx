import LoadingMotion from "./LoadingMotion";

const Loading = ({ text = "Memproses...", size = 160 }) => {
  return (
    <div className="flex flex-col items-center justify-center" role="status" aria-label={text}>
      <LoadingMotion size={size} />
      <p className="mt-2 text-sm text-gray-600">{text}</p>
    </div>
  );
};

export default Loading;
