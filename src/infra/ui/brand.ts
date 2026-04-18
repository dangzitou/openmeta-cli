const GLYPHS = {
  O: [
    ' ###### ',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  P: [
    '####### ',
    '##    ##',
    '##    ##',
    '####### ',
    '##      ',
    '##      ',
    '##      ',
  ],
  E: [
    '########',
    '##      ',
    '##      ',
    '######  ',
    '##      ',
    '##      ',
    '########',
  ],
  N: [
    '##    ##',
    '###   ##',
    '####  ##',
    '## ## ##',
    '##  ####',
    '##   ###',
    '##    ##',
  ],
  M: [
    '##    ##',
    '###  ###',
    '########',
    '## ## ##',
    '##    ##',
    '##    ##',
    '##    ##',
  ],
  T: [
    '########',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
  ],
  A: [
    ' ###### ',
    '##    ##',
    '##    ##',
    '########',
    '##    ##',
    '##    ##',
    '##    ##',
  ],
} as const;

const OPENMETA_TEXT = 'OPENMETA';
const GLYPH_HEIGHT = 7;

function composeWordmark(text: string): string[] {
  return Array.from({ length: GLYPH_HEIGHT }, (_, rowIndex) => text
    .split('')
    .map((letter) => {
      const glyph = GLYPHS[letter as keyof typeof GLYPHS];
      if (!glyph) {
        throw new Error(`Unsupported wordmark glyph: ${letter}`);
      }

      return glyph[rowIndex];
    })
    .join('  ')
    .replace(/\s+$/, ''));
}

const OPENMETA_WORDMARK_LINES = composeWordmark(OPENMETA_TEXT);

export function getOpenMetaWordmarkLines(): string[] {
  return [...OPENMETA_WORDMARK_LINES];
}
