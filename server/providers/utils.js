/**
 * Shared provider utilities.
 *
 * @module providers/utils
 */

/**
 * Prefixes that indicate internal/system content which should be hidden from the UI.
 * @type {readonly string[]}
 */
export const INTERNAL_CONTENT_PREFIXES = Object.freeze([
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<local-command-stderr>',
  '<system-reminder>',
  '<system-prompt>',
  '<tool-',
  'Environment:',
  'Caveat:',
  'This session is being continued from a previous',
  'Continue from where you left off',
  '[Request interrupted',
  '[Previous conversation context',
]);

/**
 * Check if user text content is internal/system that should be skipped.
 * Trims leading whitespace before matching to handle proxy-injected padding.
 * @param {string} content
 * @returns {boolean}
 */
export function isInternalContent(content) {
  const trimmed = content.trim();
  return INTERNAL_CONTENT_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}
