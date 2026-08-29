import { formatReleaseNotes } from '@/utils/release-notes';

/** Verbatim shape of what `gh release create --generate-notes` produced for v4.1.0. */
const GENERATED = `## What's Changed
* Magnet basket: collect magnet links in the background by @Hitman47 in https://github.com/MKDevTests/qRemote/pull/2


**Full Changelog**: https://github.com/MKDevTests/qRemote/compare/v4.0.0...v4.1.0`;

describe('formatReleaseNotes', () => {
  it('returns an empty string for missing notes', () => {
    expect(formatReleaseNotes(null)).toBe('');
    expect(formatReleaseNotes(undefined)).toBe('');
    expect(formatReleaseNotes('')).toBe('');
  });

  it('flattens the notes GitHub generates', () => {
    expect(formatReleaseNotes(GENERATED)).toBe(
      "What's Changed\n• Magnet basket: collect magnet links in the background",
    );
  });

  it('drops the heading marker but keeps the heading', () => {
    expect(formatReleaseNotes('### Fixes')).toBe('Fixes');
  });

  it('turns every list marker into a bullet', () => {
    expect(formatReleaseNotes('- one\n* two\n+ three')).toBe('• one\n• two\n• three');
  });

  it('keeps numbered lists numbered', () => {
    expect(formatReleaseNotes('1. first\n2) second')).toBe('1. first\n2. second');
  });

  it('strips inline emphasis, code and links', () => {
    expect(formatReleaseNotes('**bold** and *italic* and `code`')).toBe('bold and italic and code');
    expect(formatReleaseNotes('see [the docs](https://example.com/x)')).toBe('see the docs');
  });

  it('leaves a bare asterisk alone', () => {
    expect(formatReleaseNotes('2 * 3 = 6')).toBe('2 * 3 = 6');
  });

  it('drops the Full Changelog footer and horizontal rules', () => {
    expect(formatReleaseNotes('kept\n\n---\n**Full Changelog**: https://x/y')).toBe('kept');
  });

  it('strips the generated attribution with or without a pull request link', () => {
    expect(formatReleaseNotes('* thing by @someone in https://github.com/a/b/pull/3')).toBe(
      '• thing',
    );
    expect(formatReleaseNotes('* thing by @someone')).toBe('• thing');
  });

  it('collapses blank runs and trims the ends', () => {
    expect(formatReleaseNotes('\n\na\n\n\n\nb\n\n')).toBe('a\n\nb');
  });

  it('truncates a very long body with an ellipsis line', () => {
    const body = Array.from({ length: 30 }, (_, i) => `* item ${i}`).join('\n');
    const lines = formatReleaseNotes(body, 5).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('• item 0');
    expect(lines[5]).toBe('…');
  });
});
