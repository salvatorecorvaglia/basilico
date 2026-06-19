import { useEffect } from 'react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { RotateCcw, ArrowLeft } from 'lucide-react';
import { formatDateTime } from '../../lib/utils';
import './ReflogView.css';

export function ReflogView() {
  const { reflogEntries, loadReflog, checkoutBranch, isLoading } = useRepoStore();
  const { setActiveView, addNotification, openConfirm } = useUIStore();

  useEffect(() => {
    loadReflog();
  }, []);

  const handleRecover = (oid: string, selector: string) => {
    openConfirm({
      title: 'Recover Commit',
      message: `Are you sure you want to checkout/recover reflog commit ${oid.slice(0, 8)} (${selector})? This will detach HEAD.`,
      confirmLabel: 'Recover & Checkout',
      isDanger: true,
      onConfirm: async () => {
        try {
          await checkoutBranch(oid);
          addNotification({ type: 'success', message: `Successfully recovered state at ${selector}` });
        } catch (err) {
          addNotification({ type: 'error', message: `Recovery failed: ${err}` });
        }
      }
    });
  };

  return (
    <div className="reflog-view animate-fade-in">
      {/* Header */}
      <div className="reflog-header">
        <button className="reflog-back-btn" onClick={() => setActiveView('graph')} title="Back to Graph">
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
        <div className="reflog-title truncate">
          <h2>HEAD Reference Log</h2>
          <p className="text-secondary text-xs">History of all actions that updated the HEAD pointer</p>
        </div>
        <button 
          className="reflog-refresh-btn" 
          onClick={loadReflog}
          title="Refresh Reflog"
          disabled={isLoading}
        >
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="reflog-container">
        {isLoading ? (
          <div className="reflog-loader">
            <span className="spinner-large" />
            <p>Loading reference logs...</p>
          </div>
        ) : reflogEntries.length === 0 ? (
          <div className="reflog-empty">No reference log entries found in this repository.</div>
        ) : (
          <div className="reflog-table-wrapper">
            <table className="reflog-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Commit</th>
                  <th>Committer</th>
                  <th>Date</th>
                  <th>Action / Message</th>
                  <th className="actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reflogEntries.map((entry) => (
                  <tr key={entry.index}>
                    <td className="text-tertiary text-mono">{entry.selector}</td>
                    <td className="text-mono">
                      <span className="reflog-oid" title={entry.newOid}>
                        {entry.newOid.slice(0, 8)}
                      </span>
                    </td>
                    <td>{entry.committerName}</td>
                    <td className="text-secondary">{formatDateTime(entry.committerDate)}</td>
                    <td className="reflog-msg text-mono" title={entry.message}>{entry.message}</td>
                    <td className="reflog-actions">
                      <button 
                        className="reflog-action-btn"
                        onClick={() => handleRecover(entry.newOid, entry.selector)}
                        title="Checkout / Recover this commit state"
                      >
                        <RotateCcw size={12} />
                        <span>Recover</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
