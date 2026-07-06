/* ═══════════════════════════════════════════════════════
   Basilico — User-Friendly Error Messages
   Maps raw git2/Rust error strings to actionable messages
   ═══════════════════════════════════════════════════════ */

interface ErrorMapping {
  pattern: RegExp;
  message: string;
}

const ERROR_MAPPINGS: ErrorMapping[] = [
  // Authentication / SSH
  {
    pattern: /failed to authenticate|authentication required/i,
    message:
      "Authentication failed. Please check your SSH key or credentials in Settings.",
  },
  {
    pattern: /could not read from remote|host key verification failed/i,
    message:
      "Could not connect to remote. Check your network connection and SSH configuration.",
  },
  {
    pattern: /permission denied/i,
    message:
      "Permission denied. You may not have access to this repository or the SSH key is not authorized.",
  },

  // Fast-forward / merge
  {
    pattern: /cannot fast-forward/i,
    message:
      "Cannot fast-forward. The remote branch has diverged. Try pulling with merge or rebase.",
  },
  {
    pattern: /merge conflict|conflicting files/i,
    message:
      "Merge conflicts detected. Please resolve the conflicts in the staging area before continuing.",
  },
  {
    pattern: /not possible to fast-forward/i,
    message:
      "Fast-forward is not possible. The branches have diverged. Consider merging or rebasing.",
  },

  // Push
  {
    pattern: /rejected.*non-fast-forward|failed to push.*updates were rejected/i,
    message:
      "Push rejected: the remote has changes you don't have locally. Pull the latest changes first.",
  },
  {
    pattern: /remote.*does not support/i,
    message:
      "The remote does not support this operation. Check your remote URL configuration.",
  },

  // Branch
  {
    pattern: /branch.*already exists/i,
    message: "A branch with that name already exists. Please choose a different name.",
  },
  {
    pattern: /cannot delete.*checked out/i,
    message:
      "Cannot delete this branch because it is currently checked out. Switch to another branch first.",
  },
  {
    pattern: /not fully merged/i,
    message:
      "This branch has unmerged changes. Use force delete if you're sure you want to lose those changes.",
  },

  // Commit
  {
    pattern: /nothing to commit|no changes/i,
    message: "Nothing to commit. Stage some changes first.",
  },
  {
    pattern: /author.*not configured|user\.name.*user\.email/i,
    message:
      "Git author name and email are not configured. Set them in Settings or via 'git config'.",
  },

  // Repository
  {
    pattern: /could not find repository/i,
    message:
      "Could not find a git repository at this path. Make sure the directory contains a .git folder.",
  },
  {
    pattern: /repository.*bare/i,
    message:
      "This is a bare repository and doesn't have a working directory. Some operations are not available.",
  },

  // Stash
  {
    pattern: /no stash entries found/i,
    message: "No stash entries found. There's nothing to apply or pop.",
  },
  {
    pattern: /stash.*conflict/i,
    message:
      "Applying the stash resulted in conflicts. Resolve them in the staging area.",
  },

  // Index / lock
  {
    pattern: /index\.lock|unable to create.*lock/i,
    message:
      "Another git process appears to be running. If not, delete the .git/index.lock file manually.",
  },

  // Generic
  {
    pattern: /path.*outside.*working directory|path traversal/i,
    message:
      "Operation blocked: the path references a location outside the repository.",
  },
];

/**
 * Converts a raw git/Rust error string into a user-friendly message.
 * If no mapping is found, returns the original message.
 */
export function friendlyErrorMessage(raw: string): string {
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.pattern.test(raw)) {
      return mapping.message;
    }
  }
  return raw;
}
