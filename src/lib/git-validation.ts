/* ═══════════════════════════════════════════════════════
   Basilico — Git Validation Utilities
   Client-side validation matching Git's check-ref-format rules
   ═══════════════════════════════════════════════════════ */

/**
 * Validates a branch name against Git's check-ref-format rules.
 * @returns An error message string if invalid, or null if valid.
 *
 * Rules based on `git check-ref-format`:
 * 1. Cannot have two consecutive dots ".."
 * 2. Cannot contain ASCII control characters or space, ~, ^, :, \
 * 3. Cannot contain ?
 * 4. Cannot contain [
 * 5. Cannot begin or end with "/" or contain "//"
 * 6. Cannot end with "."
 * 7. Cannot contain "@{"
 * 8. Cannot be the single character "@"
 * 9. Cannot end with ".lock"
 * 10. Cannot contain backslash "\"
 */
export function validateBranchName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return "Branch name cannot be empty.";
  }

  if (name !== name.trim()) {
    return "Branch name cannot start or end with spaces.";
  }

  // Cannot begin or end with /
  if (name.startsWith("/") || name.endsWith("/")) {
    return 'Branch name cannot start or end with "/".';
  }

  // Cannot contain //
  if (name.includes("//")) {
    return 'Branch name cannot contain consecutive slashes "//".';
  }

  // Cannot have two consecutive dots
  if (name.includes("..")) {
    return 'Branch name cannot contain "..".';
  }

  // Cannot end with "."
  if (name.endsWith(".")) {
    return 'Branch name cannot end with ".".';
  }

  // Cannot end with ".lock"
  if (name.endsWith(".lock")) {
    return 'Branch name cannot end with ".lock".';
  }

  // Cannot contain @{
  if (name.includes("@{")) {
    return 'Branch name cannot contain "@{".';
  }

  // Cannot be the single character "@"
  if (name === "@") {
    return 'Branch name cannot be "@".';
  }

  // Cannot contain ASCII control characters, space, ~, ^, :, ?, [, \, *
  const invalidCharsRegex = /[\x00-\x1f\x7f ~^:?[\\*]/;
  const match = name.match(invalidCharsRegex);
  if (match) {
    const char = match[0];
    if (char === " ") {
      return "Branch name cannot contain spaces.";
    }
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) {
      return "Branch name cannot contain control characters.";
    }
    return `Branch name cannot contain the character "${char}".`;
  }

  // Each path component cannot begin with "."
  const components = name.split("/");
  for (const component of components) {
    if (component.startsWith(".")) {
      return `Branch name component cannot start with "." (found in "${component}").`;
    }
    if (component.length === 0) {
      return "Branch name contains an empty path component.";
    }
  }

  return null;
}
