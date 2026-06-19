/* ═══════════════════════════════════════════════════════
   Basilico — Utility Functions
   ═══════════════════════════════════════════════════════ */

/** Format a Unix timestamp as a relative time string (e.g., "2 hours ago") */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }
  if (diff < 2592000) {
    const weeks = Math.floor(diff / 604800);
    return `${weeks}w ago`;
  }
  if (diff < 31536000) {
    const months = Math.floor(diff / 2592000);
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / 31536000);
  return `${years}y ago`;
}

/** Format a Unix timestamp as an absolute date/time */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Get initials from a name (e.g., "John Doe" → "JD") */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);
}

/** Generate a consistent color from a string (for author avatars) */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

/** Get the lane color CSS variable */
export function getLaneColor(lane: number): string {
  return `var(--lane-${lane % 10})`;
}

/** Truncate a string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Short OID (first 7 chars) */
export function shortOid(oid: string): string {
  return oid.slice(0, 7);
}

/** Get file extension from path */
export function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** Get file name from path */
export function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Get directory from path */
export function getDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

/** Classify file status into an icon-friendly category */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'added': return 'A';
    case 'modified': return 'M';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    default: return '?';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'added': return 'var(--color-success)';
    case 'modified': return 'var(--color-warning)';
    case 'deleted': return 'var(--color-danger)';
    case 'renamed': return 'var(--color-info)';
    default: return 'var(--text-secondary)';
  }
}
