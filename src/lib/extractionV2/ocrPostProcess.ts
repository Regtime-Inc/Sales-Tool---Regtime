const NUMBER_LETTER_FIXES: Array<[RegExp, string]> = [
  [/(?<=\d)O(?=\d)/g, '0'],
  [/(?<=\d)o(?=\d)/g, '0'],
  [/(?<=\d)l(?=\d)/g, '1'],
  [/(?<=\d)I(?=\d)/g, '1'],
  [/(?<=\d)S(?=\d)/g, '5'],
  [/(?<=\d)B(?=\d)/g, '8'],
];

const AREA_WHITESPACE_FIX = /(\d),\s+(\d)/g;

const HYPHENATED_WORD = /(\w)-\s*\n\s*(\w)/g;

export function fixNumberLetterConfusion(text: string): string {
  let result = text;
  for (const [pattern, replacement] of NUMBER_LETTER_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function normalizeTableWhitespace(text: string): string {
  return text
    .replace(AREA_WHITESPACE_FIX, '$1,$2')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\u00a0/g, ' ');
}

export function rejoinHyphenatedWords(text: string): string {
  return text.replace(HYPHENATED_WORD, '$1$2');
}

export function cleanOcrArtifacts(text: string): string {
  let result = text;
  result = result.replace(/[|]{2,}/g, '|');
  result = result.replace(/[_]{3,}/g, '');
  result = result.replace(/\.{4,}/g, '...');
  return result;
}

export function postProcessOcrText(text: string): string {
  let result = text;
  result = rejoinHyphenatedWords(result);
  result = fixNumberLetterConfusion(result);
  result = normalizeTableWhitespace(result);
  result = cleanOcrArtifacts(result);
  return result;
}
