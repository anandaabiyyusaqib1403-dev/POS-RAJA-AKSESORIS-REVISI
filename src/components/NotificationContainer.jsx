import NotificationItem from "./NotificationItem";

export default function NotificationContainer({ notifications, onRemove }) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[120] flex max-h-screen w-[min(320px,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-6"
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
