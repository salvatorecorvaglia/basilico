import { useState, useEffect } from 'react';
import { 
  GitPullRequest, 
  ExternalLink, 
  Key, 
  User, 
  Clock, 
  MessageSquare, 
  AlertCircle, 
  ArrowLeftRight,
  RefreshCw,
  GitBranch
} from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import './PullRequestReview.css';

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
    label: string;
  };
  base: {
    ref: string;
    sha: string;
    label: string;
  };
  comments: number;
  labels: { name: string; color: string }[];
}

export function PullRequestReview() {
  const { remotes, startComparison } = useRepoStore();
  const { setActiveView, addNotification } = useUIStore();

  const [token, setToken] = useState<string>(() => localStorage.getItem('basilico_github_token') || '');
  const [isSaved, setIsSaved] = useState<boolean>(!!localStorage.getItem('basilico_github_token'));
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Parse owner and repo from remote URL
  const githubRepo = useMemo(() => {
    const origin = remotes.find(r => r.name === 'origin') || remotes[0];
    if (!origin || !origin.url) return null;
    
    // Support HTTPS: https://github.com/owner/repo.git
    // Support SSH: git@github.com:owner/repo.git
    const match = origin.url.match(/github\.com[:/]([^/]+)\/([^.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  }, [remotes]);

  // Fetch PRs
  const fetchPullRequests = async () => {
    if (!githubRepo) return;
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }

      const res = await fetch(
        `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.repo}/pulls?state=open`,
        { headers }
      );

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized: Please check your GitHub token.');
        }
        if (res.status === 404) {
          throw new Error('Repository not found or token lacks permissions.');
        }
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }

      const data = await res.json();
      setPrs(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (githubRepo) {
      fetchPullRequests();
    }
  }, [githubRepo, isSaved]);

  const handleSaveToken = () => {
    if (token.trim()) {
      localStorage.setItem('basilico_github_token', token.trim());
      setIsSaved(true);
      addNotification({ type: 'success', message: 'GitHub token saved successfully' });
    } else {
      localStorage.removeItem('basilico_github_token');
      setIsSaved(false);
    }
  };

  const handleComparePR = (pr: PullRequest) => {
    // Start tree comparison in CompareView
    startComparison(pr.base.sha, pr.head.sha);
    setActiveView('compare');
    addNotification({ 
      type: 'info', 
      message: `Comparing PR #${pr.number}: ${pr.base.ref} ➔ ${pr.head.ref}` 
    });
  };

  if (!githubRepo) {
    return (
      <div className="pr-fallback-container">
        <AlertCircle size={32} className="text-tertiary" />
        <h3>No GitHub Remote Configured</h3>
        <p>This repository does not have a configured GitHub remote URL on 'origin'.</p>
      </div>
    );
  }

  return (
    <div className="pr-view-container">
      {/* Header */}
      <div className="pr-header">
        <div className="pr-header-title">
          <GitPullRequest size={20} className="text-link" />
          <h2>GitHub Pull Requests</h2>
          <span className="repo-badge">{githubRepo.owner}/{githubRepo.repo}</span>
        </div>

        <div className="pr-header-actions">
          <button className="pr-btn pr-btn-outline" onClick={fetchPullRequests} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="pr-body-grid">
        {/* Token Config Sidebar Card */}
        <div className="pr-config-card">
          <div className="config-card-title">
            <Key size={14} />
            <h3>GitHub Integration</h3>
          </div>
          <p className="config-desc">
            Provide a Personal Access Token (PAT) to fetch PRs from private repositories and avoid GitHub API rate limits.
          </p>

          <div className="config-input-group">
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="config-token-input"
            />
            <button className="pr-btn" onClick={handleSaveToken}>
              {isSaved ? 'Update Token' : 'Save Token'}
            </button>
            {isSaved && (
              <button 
                className="pr-btn pr-btn-outline" 
                onClick={() => {
                  setToken('');
                  localStorage.removeItem('basilico_github_token');
                  setIsSaved(false);
                  addNotification({ type: 'info', message: 'GitHub token removed' });
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* PR List Area */}
        <div className="pr-list-section">
          {loading ? (
            <div className="pr-loader">
              <span className="spinner-large" />
              <p>Fetching active pull requests...</p>
            </div>
          ) : error ? (
            <div className="pr-error-card">
              <AlertCircle size={24} className="text-danger" />
              <div>
                <h4>Error Loading Pull Requests</h4>
                <p>{error}</p>
                <button className="pr-btn pr-btn-outline" onClick={fetchPullRequests} style={{ marginTop: 'var(--space-2)' }}>
                  Retry
                </button>
              </div>
            </div>
          ) : prs.length === 0 ? (
            <div className="pr-empty-state">
              <GitPullRequest size={36} className="text-tertiary" />
              <h4>No Open Pull Requests</h4>
              <p>Everything is merged or closed! Nice job.</p>
            </div>
          ) : (
            <div className="pr-list">
              {prs.map((pr) => (
                <div key={pr.id} className="pr-card">
                  <div className="pr-card-header">
                    <img 
                      src={pr.user.avatar_url} 
                      alt={pr.user.login} 
                      className="pr-author-avatar" 
                      title={pr.user.login}
                    />
                    <div className="pr-title-group">
                      <div className="pr-title-row">
                        <span className="pr-number">#{pr.number}</span>
                        <h4 className="pr-title-text">{pr.title}</h4>
                      </div>
                      <div className="pr-meta-row">
                        <span className="pr-meta-item">
                          <User size={12} /> {pr.user.login}
                        </span>
                        <span className="pr-meta-item">
                          <Clock size={12} /> {new Date(pr.created_at).toLocaleDateString()}
                        </span>
                        {pr.comments > 0 && (
                          <span className="pr-meta-item">
                            <MessageSquare size={12} /> {pr.comments}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {pr.body && (
                    <p className="pr-card-body truncate-2">
                      {pr.body}
                    </p>
                  )}

                  <div className="pr-labels-row">
                    {pr.labels.map(lbl => (
                      <span 
                        key={lbl.name} 
                        className="pr-label-badge" 
                        style={{ 
                          backgroundColor: `#${lbl.color}22`,
                          borderColor: `#${lbl.color}`,
                          color: `#${lbl.color}`
                        }}
                      >
                        {lbl.name}
                      </span>
                    ))}
                  </div>

                  <div className="pr-branch-flow">
                    <div className="branch-ref">
                      <GitBranch size={12} />
                      <span>{pr.base.ref}</span>
                    </div>
                    <span className="flow-arrow">◀</span>
                    <div className="branch-ref">
                      <GitBranch size={12} />
                      <span>{pr.head.ref}</span>
                    </div>
                  </div>

                  <div className="pr-card-actions">
                    <button className="pr-btn" onClick={() => handleComparePR(pr)}>
                      <ArrowLeftRight size={13} />
                      <span>Compare & Review Diff</span>
                    </button>
                    <a 
                      href={pr.html_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="pr-btn pr-btn-outline"
                    >
                      <ExternalLink size={13} />
                      <span>View on GitHub</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Utility import helper
import { useMemo } from 'react';
