import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import NotificationContainer from "../components/NotificationContainer";
import { toClientMessage } from "../utils/clientMessages";

const NotificationContext = createContext(null);

const NOTIFICATION_TYPES = ["success", "error", "warning", "info"];
const DEFAULT_DURATION = 4200;
const MAX_NOTIFICATIONS = 5;

let notificationBridge = null;
const pendingNotifications = [];

function createNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeType(type) {
  return NOTIFICATION_TYPES.includes(type) ? type : "info";
}

function createNotificationPayload(type, message, options = {}) {
  const normalizedType = normalizeType(type);
  const normalizedMessage =
    normalizedType === "error"
      ? toClientMessage(message)
      : String(message ?? "").trim().replace(/\bowner\b/gi, "pemilik toko");
  if (!normalizedMessage) return null;

  return {
    id: options.id || createNotificationId(),
    type: normalizedType,
    message: normalizedMessage,
    duration:
      typeof options.duration === "number" && options.duration >= 0
        ? options.duration
        : DEFAULT_DURATION,
  };
}

export function showNotification(type, message, options = {}) {
  const notification = createNotificationPayload(type, message, options);
  if (!notification) return null;

  if (notificationBridge) {
    notificationBridge(notification);
  } else {
    pendingNotifications.push(notification);
  }

  return notification.id;
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const enqueueNotification = useCallback((notification) => {
    setNotifications((current) => {
      const nextNotifications = [...current, notification];
      return nextNotifications.slice(-MAX_NOTIFICATIONS);
    });
    return notification.id;
  }, []);

  const notify = useCallback(
    (type, message, options = {}) => {
      const notification =
        typeof type === "object" && type !== null
          ? type
          : createNotificationPayload(type, message, options);

      if (!notification) return null;
      return enqueueNotification(notification);
    },
    [enqueueNotification]
  );

  const removeNotification = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  useEffect(() => {
    notificationBridge = notify;

    if (pendingNotifications.length) {
      pendingNotifications.splice(0).forEach((notification) => {
        notify(notification);
      });
    }

    return () => {
      if (notificationBridge === notify) {
        notificationBridge = null;
      }
    };
  }, [notify]);

  const value = useMemo(
    () => ({
      notifications,
      showNotification: notify,
      removeNotification,
    }),
    [notifications, notify, removeNotification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotification harus dipakai di dalam NotificationProvider.");
  }

  return context;
}
