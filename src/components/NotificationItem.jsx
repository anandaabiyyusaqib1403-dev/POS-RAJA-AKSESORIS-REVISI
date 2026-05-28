import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";

const EXIT_DURATION = 300;

const typeConfigMap = {
  success: {
    title: "Selesai",
    accentClass: "border-emerald-500",
    iconWrapperClass: "border-emerald-100 bg-emerald-50",
    iconClass: "text-emerald-600",
    Icon: CheckCircle2,
  },
  error: {
    title: "Belum Berhasil",
    accentClass: "border-red-500",
    iconWrapperClass: "border-red-100 bg-red-50",
    iconClass: "text-red-600",
    Icon: XCircle,
  },
  warning: {
    title: "Perlu Dicek",
    accentClass: "border-[#D4AF37]",
    iconWrapperClass: "border-[#F1E0A6] bg-[#FFF8E1]",
    iconClass: "text-[#B8921F]",
    Icon: AlertTriangle,
  },
  info: {
    title: "Info",
    accentClass: "border-slate-400",
    iconWrapperClass: "border-slate-200 bg-slate-100",
    iconClass: "text-slate-500",
    Icon: Info,
  },
};

export default function NotificationItem({ notification, onRemove }) {
  const [isVisible, setIsVisible] = useState(false);
  const hasDismissedRef = useRef(false);
  const removalTimeoutRef = useRef(null);

  const config = useMemo(
    () => typeConfigMap[notification.type] || typeConfigMap.info,
    [notification.type]
  );

  const dismiss = useCallback(() => {
    if (hasDismissedRef.current) return;

    hasDismissedRef.current = true;
    setIsVisible(false);

    removalTimeoutRef.current = window.setTimeout(() => {
      onRemove(notification.id);
    }, EXIT_DURATION);
  }, [notification.id, onRemove]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (notification.duration === 0) return undefined;

    const autoDismissTimeout = window.setTimeout(() => {
      dismiss();
    }, notification.duration ?? 4200);

    return () => {
      window.clearTimeout(autoDismissTimeout);
    };
  }, [dismiss, notification.duration]);

  useEffect(
    () => () => {
      if (removalTimeoutRef.current) {
        window.clearTimeout(removalTimeoutRef.current);
      }
    },
    []
  );

  const { Icon } = config;

  return (
    <div
      role="alert"
      className={`pointer-events-auto w-full overflow-hidden rounded-lg border border-slate-200/80 border-l-4 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF9EC_100%)] shadow-md transition-all duration-300 ease-out ${config.accentClass} ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${config.iconWrapperClass}`}
        >
          <Icon className={`h-5 w-5 ${config.iconClass}`} strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">{config.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{notification.message}</p>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
