/* ═══════════════════════════════════════════════════════
   Basilico — RepoSearch Component
   Search code (git grep) and commit messages
   ═══════════════════════════════════════════════════════ */

import { useState } from 'react';
import { Search, FileText, GitCommit, CornerDownRight, X } from 'lucide-react';
import { useRepoStore } from '../../store/repo-store';
import { useUIStore } from '../../store/ui-store';
import { formatDateTime } from '../../lib/utils';
import './RepoSearch.css';

export function RepoSearch() {
  const { 
    commitSearchResults, 
    grepSearchResults, 
    searchCommits, 
    grepCode, 
    selectCommit,
    selectLocalFile
  } = useRepoStore();

  const { setActiveView } = useUIStore();

  const [searchTab, setSearchTab] = useState<'commits' | 'code'>('commits');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      if (searchTab === 'commits') {
        await searchCommits(query);
      } else {
        await grepCode(query);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    useRepoStore.setState({ commitSearchResults: [], grepSearchResults: [] });
  };

  const handleCommitClick = async (oid: string) => {
    await selectCommit(oid);
    setActiveView('graph');
  };

  const handleGrepClick = (filePath: string) => {
    // Open the selected file in blame view
    selectLocalFile(filePath, false);
    setActiveView('blame');
  };

  return (
    <div className="repo-search animate-fade-in">
      <div className="search-header">
        <h2>Search Repository</h2>
        <div className="search-tabs">
          <button 
            className={`search-tab-btn ${searchTab === 'commits' ? 'active' : ''}`}
            onClick={() => { setSearchTab('commits'); handleClear(); }}
          >
            <GitCommit size={14} />
            <span>Commits</span>
          </button>
          <button 
            className={`search-tab-btn ${searchTab === 'code' ? 'active' : ''}`}
            onClick={() => { setSearchTab('code'); handleClear(); }}
          >
            <FileText size={14} />
            <span>Code (Grep)</span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="search-input-wrapper">
          <Search size={16} className="search-icon-input" />
          <input 
            type="text" 
            placeholder={searchTab === 'commits' ? 'Search messages or authors...' : 'Search code snippet...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="search-clear-btn" onClick={handleClear}>
              <X size={14} />
            </button>
          )}
          <button type="submit" className="search-submit-btn" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      <div className="search-results custom-scrollbar">
        {searchTab === 'commits' ? (
          commitSearchResults.length === 0 ? (
            <div className="search-empty">
              <GitCommit size={28} strokeWidth={1} />
              <p>No commits match your query</p>
            </div>
          ) : (
            <div className="search-list">
              <div className="search-results-count">
                Found {commitSearchResults.length} matching commits
              </div>
              {commitSearchResults.map((commit) => (
                <div 
                  key={commit.oid} 
                  className="search-result-row commit-result"
                  onClick={() => handleCommitClick(commit.oid)}
                >
                  <div className="commit-result-title truncate">{commit.message}</div>
                  <div className="commit-result-meta">
                    <span className="commit-result-author truncate">{commit.authorName}</span>
                    <span className="commit-result-date">{formatDateTime(commit.authorDate)}</span>
                    <span className="commit-result-oid text-mono">{commit.shortOid}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          grepSearchResults.length === 0 ? (
            <div className="search-empty">
              <FileText size={28} strokeWidth={1} />
              <p>No code matches your query</p>
            </div>
          ) : (
            <div className="search-list">
              <div className="search-results-count">
                Found {grepSearchResults.length} code matches
              </div>
              {grepSearchResults.map((match, i) => (
                <div 
                  key={i} 
                  className="search-result-row grep-result"
                  onClick={() => handleGrepClick(match.filePath)}
                >
                  <div className="grep-result-header">
                    <FileText size={12} className="text-secondary" />
                    <span className="grep-file-name truncate">{match.filePath}</span>
                    <span className="grep-line-no badge">Line {match.lineNumber}</span>
                  </div>
                  <div className="grep-result-content text-mono">
                    <CornerDownRight size={10} className="text-tertiary" />
                    <code>{match.content.trim() || ' '}</code>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
