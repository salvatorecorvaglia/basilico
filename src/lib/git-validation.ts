/* ═══════════════════════════════════════════════════════
   Basilico — Git Validation Utilities
   Client-side validation matching Git's check-ref-format rules
   ═══════════════════════════════════════════════════════ */

/**
 * Common validation logic matching Git's check-ref-format rules.
 * @returns An error message string if invalid, or null if valid.
 */
function validateRefFormat(
  name: string,
  refType: "Branch" | "Tag",
): string | null {
  if (!name || name.trim().length === 0) {
    return `${refType} name cannot be empty.`;
  }

  if (name !== name.trim()) {
    return `${refType} name cannot start or end with spaces.`;
  }

  // Cannot begin or end with /
  if (name.startsWith("/") || name.endsWith("/")) {
    return `${refType} name cannot start or end with "/".`;
  }

  // Cannot contain //
  if (name.includes("//")) {
    return `${refType} name cannot contain consecutive slashes "//".`;
  }

  // Cannot have two consecutive dots
  if (name.includes("..")) {
    return `${refType} name cannot contain "..".`;
  }

  // Cannot end with "."
  if (name.endsWith(".")) {
    return `${refType} name cannot end with ".".`;
  }

  // Cannot end with ".lock"
  if (name.endsWith(".lock")) {
    return `${refType} name cannot end with ".lock".`;
  }

  // Cannot contain @{
  if (name.includes("@{")) {
    return `${refType} name cannot contain "@{".`;
  }

  // Cannot be the single character "@"
  if (name === "@") {
    return `${refType} name cannot be "@".`;
  }

  // Cannot contain ASCII control characters, space, ~, ^, :, ?, [, \, *
  // biome-ignore lint/suspicious/noControlCharactersInRegex: we need to match control characters to validate git branch names
  const invalidCharsRegex = /[\x00-\x1f\x7f ~^:?[\\*]/;
  const match = name.match(invalidCharsRegex);
  if (match) {
    const char = match[0];
    if (char === " ") {
      return `${refType} name cannot contain spaces.`;
    }
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) {
      return `${refType} name cannot contain control characters.`;
    }
    return `${refType} name cannot contain the character "${char}".`;
  }

  // Each path component cannot begin with "."
  const components = name.split("/");
  for (const component of components) {
    if (component.startsWith(".")) {
      return `${refType} name component cannot start with "." (found in "${component}").`;
    }
    if (component.length === 0) {
      return `${refType} name contains an empty path component.`;
    }
  }

  return null;
}

/**
 * Validates a branch name against Git's check-ref-format rules.
 * @returns An error message string if invalid, or null if valid.
 */
export function validateBranchName(name: string): string | null {
  return validateRefFormat(name, "Branch");
}

/**
 * Validates a tag name against Git's check-ref-format rules.
 * @returns An error message string if invalid, or null if valid.
 */
export function validateTagName(name: string): string | null {
  return validateRefFormat(name, "Tag");
}
