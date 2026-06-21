import { useEffect, useRef, useState } from "react";

export default function ConnectionStatusBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOffline = () => {
      wasOffline.current = true;
      setRestored(false);
      setOnline(false);
    };
    const handleOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        setRestored(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!restored) return undefined;
    const timeoutId = window.setTimeout(() => setRestored(false), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [restored]);

  if (!online) {
    return (
      <div className="brand-connection-banner brand-connection-offline" role="alert">
        Koneksi terputus. Penyimpanan transaksi ditahan sampai koneksi kembali aktif.
      </div>
    );
  }

  return restored ? (
    <div className="brand-connection-banner brand-connection-online" role="status">
      Koneksi kembali aktif. Transaksi dapat dilanjutkan.
    </div>
  ) : null;
}
