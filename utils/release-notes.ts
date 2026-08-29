/**
 * release-notes.ts — turn a GitHub release body into something readable in a
 * plain <Text>.
 *
 * The updater shows whatever `gh release create --generate-notes` produced,
 * and that is Markdown: `## What's Changed`, `* item by @user in <url>`,
 * `**Full Changelog**: <url>`. Rendered raw it reads like source code, which
 * is exactly what it looked like in 4.1.0.
 *
 * This is deliberately not a Markdown renderer — the card has room for a few
 * lines of prose, not for nested emphasis. It flattens to text, keeps the
 * structure a reader actually needs (headings, bullets), and drops the
 * bookkeeping GitHub appends for a repository whose commits are all the
 * maintainer's own.
 */

/** Attribution GitHub appends to every generated bullet: "by @user in <url>". */
const GENERATED_ATTRIBUTION = /\s+by\s+@[\w.-]+(?:\s+in\s+\S+)?\s*$/;

/** The "Full Changelog" footer — the card already links to the release. */
const FULL_CHANGELOG_LINE = /^\s*\**full changelog\**\s*:/i;

/** Strip the inline Markdown that survives flattening. */
function inline(text: string): string {
  return (
    text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) → label
      .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
      // Italic, once bold is gone: any surviving pair of single asterisks.
      // Written without lookbehind on purpose — Hermes is the runtime here.
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1') // code
      .replace(GENERATED_ATTRIBUTION, '')
      .trimEnd()
  );
}

/**
 * Flatten a release body to plain text.
 *
 * @param raw    the release body, as GitHub returned it
 * @param maxLines cap on the rendered lines — the notes live in a small
 *                 scroll view, and a release with fifty bullets should not
 *                 push the install button off the bottom of the world.
 */
export function formatReleaseNotes(raw: string | null | undefined, maxLines = 24): string {
  if (!raw) return '';

  const out: string[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();

    if (line === '') {
      // Collapse runs of blank lines, and never open with one.
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) continue; // horizontal rule
    if (FULL_CHANGELOG_LINE.test(line)) continue;

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      const text = inline(heading[1]);
      if (text) {
        if (out.length > 0 && out[out.length - 1] !== '') out.push('');
        out.push(text);
      }
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      const text = inline(bullet[1]);
      if (text) out.push(`• ${text}`);
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      const text = inline(numbered[2]);
      if (text) out.push(`${numbered[1]}. ${text}`);
      continue;
    }

    const text = inline(line);
    if (text) out.push(text);
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();

  const truncated = out.length > maxLines;
  const lines = truncated ? out.slice(0, maxLines) : out;
  // A trailing blank left by the slice would read as a formatting bug.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (truncated) lines.push('…');

  return lines.join('\n');
}
