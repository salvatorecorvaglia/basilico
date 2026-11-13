/* ═══════════════════════════════════════════════════════
   Basilico — RepoSearch Component
   Search code (git grep) and commit messages
   ═══════════════════════════════════════════════════════ */

import { CornerDownRight, FileText, GitCommit, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { formatDateTime } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./RepoSearch.css";
import { reportError } from "../../lib/git-error";

export function RepoSearch() {
  const path = useRepoStore((s) => s.activeTabId);
  return <RepositorySearch key={path} />;
}

function RepositorySearch() {
  const {
    commitSearchResults,
    grepSearchResults,
    clearSearchResults,
    searchCommits,
    grepCode,
    selectCommit,
    selectFileForBlame,
  } = useRepoStore(
    useShallow((s) => ({
      commitSearchResults: s.commitSearchResults,
      grepSearchResults: s.grepSearchResults,
      clearSearchResults: s.clearSearchResults,
      searchCommits: s.searchCommits,
      grepCode: s.grepCode,
      selectCommit: s.selectCommit,
      selectFileForBlame: s.selectFileForBlame,
    })),
  );

  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );

  const [searchTab, setSearchTab] = useState<"commits" | "code">("commits");
  const [query, setQuery] = useState("");
  const searchRequest = useRef(0);
  useEffect(
    () => () => {
      searchRequest.current++;
    },
    [],
  );
  const [isSearching, setIsSearching] = useState(false);
  // Whether results on screen answer a search. Before the first one, the
  // empty list said "No commits match your query" for a query never run.
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    const ticket = ++searchRequest.current;
    setIsSearching(true);
    setSearchError(false);
    clearSearchResults();
    try {
      if (searchTab === "commits") {
        await searchCommits(query);
      } else {
        await grepCode(query);
      }
      if (ticket === searchRequest.current) setHasSearched(true);
    } catch (err) {
      if (ticket === searchRequest.current) {
        setSearchError(true);
        reportError(err, "Search failed");
      }
    } finally {
      if (ticket === searchRequest.current) setIsSearching(false);
    }
  };

  const handleClear = () => {
    searchRequest.current++;
    setIsSearching(false);
    setQuery("");
    setHasSearched(false);
    setSearchError(false);
    clearSearchResults();
  };

  const handleCommitClick = async (oid: string) => {
    const repo = useRepoStore.getState().activeTabId;
    const ticket = searchRequest.current;
    try {
      await selectCommit(oid);
      if (
        repo === useRepoStore.getState().activeTabId &&
        ticket === searchRequest.current
      )
        setActiveView("graph");
    } catch (err) {
      reportError(err, "Failed to load commit");
    }
  };

  const handleGrepClick = (filePath: string, line: number) => {
    const repoPath = useRepoStore.getState().activeTabId;
    if (!repoPath) return;
    selectFileForBlame(filePath);
    useUIStore.setState({ blameTarget: { repoPath, filePath, line } });
    setActiveView("blame");
  };

  return (
    <div className="repo-search animate-fade-in">
      <div className="search-header">
        <h2>Search Repository</h2>
        <div className="search-tabs">
          <button
            type="button"
            className={`search-tab-btn ${searchTab === "commits" ? "active" : ""}`}
            aria-pressed={searchTab === "commits"}
            onClick={() => {
              setSearchTab("commits");
              handleClear();
            }}
          >
            <GitCommit size={14} />
            <span>Commits</span>
          </button>
          <button
            type="button"
            className={`search-tab-btn ${searchTab === "code" ? "active" : ""}`}
            aria-pressed={searchTab === "code"}
            onClick={() => {
              setSearchTab("code");
              handleClear();
            }}
          >
            <FileText size={14} />
            <span>Code (Grep)</span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="search-input-wrapper">
          <Search size={16} className="search-icon-input" />
          <input
            type="text"
            aria-label={
              searchTab === "commits"
                ? "Search commit messages or authors"
                : "Search working-tree code"
            }
            placeholder={
              searchTab === "commits"
                ? "Search messages or authors..."
                : "Search code snippet..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      <div className="search-results custom-scrollbar" aria-busy={isSearching}>
        {searchError && (
          <p role="alert">Search failed. Adjust your query and try again.</p>
        )}
        {searchTab === "commits" ? (
          commitSearchResults.length === 0 ? (
            <div className="empty-state search-empty">
              <GitCommit size={28} strokeWidth={1} />
              <p>
                {hasSearched
                  ? "No commits match your query"
                  : "Search commit messages and authors"}
              </p>
            </div>
          ) : (
            <div className="search-list">
              <div className="search-results-count">
                Showing {commitSearchResults.length} matching commits
                {commitSearchResults.length >= 200 &&
                  " (limit reached; narrow your query)"}
              </div>
              {commitSearchResults.map((commit) => (
                <div
                  key={commit.oid}
                  role="button"
                  tabIndex={0}
                  className="search-result-row commit-result"
                  onClick={() => handleCommitClick(commit.oid)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCommitClick(commit.oid);
                    }
                  }}
                >
                  <div className="commit-result-title truncate">
                    {commit.message}
                  </div>
                  <div className="commit-result-meta">
                    <span className="commit-result-author truncate">
                      {commit.authorName}
                    </span>
                    <span className="commit-result-date">
                      {formatDateTime(commit.authorDate)}
                    </span>
                    <span className="commit-result-oid text-mono">
                      {commit.shortOid}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : grepSearchResults.length === 0 ? (
          <div className="empty-state search-empty">
            <FileText size={28} strokeWidth={1} />
            <p>
              {hasSearched
                ? "No code matches your query"
                : "Search the code in the working tree"}
            </p>
          </div>
        ) : (
          <div className="search-list">
            <div className="search-results-count">
              Showing {grepSearchResults.length} code matches
              {grepSearchResults.some((match) => match.truncated) &&
                " (results limited; narrow your query)"}
            </div>
            {grepSearchResults.map((match, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                className="search-result-row grep-result"
                onClick={() =>
                  handleGrepClick(match.filePath, match.lineNumber)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleGrepClick(match.filePath, match.lineNumber);
                  }
                }}
              >
                <div className="grep-result-header">
                  <FileText size={12} className="text-secondary" />
                  <span className="grep-file-name truncate">
                    {match.filePath}
                  </span>
                  <span className="grep-line-no badge">
                    Line {match.lineNumber}
                  </span>
                </div>
                <div className="grep-result-content text-mono">
                  <CornerDownRight size={10} className="text-tertiary" />
                  <code>{match.content.trim() || " "}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
