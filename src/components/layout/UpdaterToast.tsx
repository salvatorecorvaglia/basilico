import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useUpdaterStore } from "../../store/updater-store";
import "./UpdaterToast.css";

export function UpdaterToast() {
  const status = useUpdaterStore((s) => s.status);
  const version = useUpdaterStore((s) => s.version);
  const progress = useUpdaterStore((s) => s.progress);
  const error = useUpdaterStore((s) => s.error);
  const dismissed = useUpdaterStore((s) => s.dismissed);

  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  if (dismissed || status === "idle" || status === "checking") {
    return null;
  }

  return (
    <div className="updater-toast" role="alert">
      <div className="updater-toast-header">
        <div className="updater-toast-title">
          {status === "downloading" ? (
            <Loader2 size={16} className="updater-spinner" />
          ) : (
            <Download size={16} className="updater-icon-accent" />
          )}
          <span className="updater-title-text">
            {status === "available" && `Update v${version} available`}
            {status === "downloading" && `Downloading update… (${progress}%)`}
            {status === "ready" && "Update ready to install"}
            {status === "error" && "Update error"}
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="updater-close-btn"
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
      </div>

      <p className="updater-toast-desc">
        {status === "available" &&
          "A new version of Basilico is ready to download."}
        {status === "downloading" && `Downloading update files... ${progress}%`}
        {status === "ready" &&
          "Basilico will update when you restart the application."}
        {status === "error" && (error || "An error occurred during update.")}
      </p>

      {status === "downloading" && (
        <div className="updater-progress-track">
          <div
            className="updater-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="updater-toast-actions">
        {status === "available" && (
          <button
            type="button"
            onClick={downloadAndInstall}
            className="updater-btn updater-btn-primary"
          >
            <Download size={13} />
            <span>Download</span>
          </button>
        )}

        {status === "ready" && (
          <button
            type="button"
            onClick={restartApp}
            className="updater-btn updater-btn-primary"
          >
            <RefreshCw size={13} />
            <span>Restart now</span>
          </button>
        )}

        {status === "error" && (
          <button
            type="button"
            onClick={dismiss}
            className="updater-btn updater-btn-secondary"
          >
            <span>Dismiss</span>
          </button>
        )}
      </div>
    </div>
  );
}
