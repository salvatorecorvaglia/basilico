import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUIStore } from "../../store/ui-store";
import "./NotificationToast.css";

export function NotificationToast() {
  const { notifications, removeNotification } = useUIStore(
    useShallow((s) => ({
      notifications: s.notifications,
      removeNotification: s.removeNotification,
    })),
  );

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notif) => {
        let Icon = Info;
        let iconClass = "info";

        if (notif.type === "success") {
          Icon = CheckCircle2;
          iconClass = "success";
        } else if (notif.type === "error") {
          Icon = XCircle;
          iconClass = "error";
        } else if (notif.type === "warning") {
          Icon = AlertTriangle;
          iconClass = "warning";
        }

        return (
          <div
            key={notif.id}
            className={`notification-toast toast-${iconClass}`}
          >
            <div className={`toast-icon icon-${iconClass}`}>
              <Icon size={16} />
            </div>
            <div className="toast-content">
              <p className="toast-message">{notif.message}</p>
              {notif.description && (
                <p className="toast-description">{notif.description}</p>
              )}
              {notif.action && (
                <button
                  type="button"
                  className="toast-action-btn"
                  onClick={() => {
                    notif.action?.onClick();
                    removeNotification(notif.id);
                  }}
                >
                  {notif.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => removeNotification(notif.id)}
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
            {notif.timeout && notif.timeout < 100000 && (
              <div
                className="toast-progress-bar"
                style={{ animationDuration: `${notif.timeout}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
