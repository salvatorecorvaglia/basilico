import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useUIStore } from "../../store/ui-store";
import "./NotificationToast.css";

export function NotificationToast() {
  const { notifications, removeNotification } = useUIStore();

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
            </div>
            <button
              className="toast-close-btn"
              onClick={() => removeNotification(notif.id)}
            >
              <X size={12} />
            </button>
            <div
              className="toast-progress-bar"
              style={{ animationDuration: `${notif.timeout ?? 4000}ms` }}
            />
          </div>
        );
      })}
    </div>
  );
}
