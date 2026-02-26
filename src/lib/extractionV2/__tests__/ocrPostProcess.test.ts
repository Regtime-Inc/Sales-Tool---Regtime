import { describe, it, expect } from 'vitest';
import {
  fixNumberLetterConfusion,
  normalizeTableWhitespace,
  rejoinHyphenatedWords,
  cleanOcrArtifacts,
  postProcessOcrText,
} from '../ocrPostProcess';

describe('fixNumberLetterConfusion', () => {
  it('replaces O between digits with 0', () => {
    expect(fixNumberLetterConfusion('1O5')).toBe('105');
  });

  it('replaces lowercase o between digits with 0', () => {
    expect(fixNumberLetterConfusion('2o3')).toBe('203');
  });

  it('replaces l between digits with 1', () => {
    expect(fixNumberLetterConfusion('3l4')).toBe('314');
  });

  it('replaces I between digits with 1', () => {
    expect(fixNumberLetterConfusion('5I6')).toBe('516');
  });

  it('replaces S between digits with 5', () => {
    expect(fixNumberLetterConfusion('1S0')).toBe('150');
  });

  it('replaces B between digits with 8', () => {
    expect(fixNumberLetterConfusion('1B0')).toBe('180');
  });

  it('does not alter letters outside numeric context', () => {
    expect(fixNumberLetterConfusion('BLOCK')).toBe('BLOCK');
  });
});

describe('normalizeTableWhitespace', () => {
  it('removes space after comma in numbers', () => {
    expect(normalizeTableWhitespace('1, 250')).toBe('1,250');
  });

  it('collapses excessive spaces to double space', () => {
    expect(normalizeTableWhitespace('foo     bar')).toBe('foo  bar');
  });

  it('converts non-breaking spaces', () => {
    expect(normalizeTableWhitespace('unit\u00a0A')).toBe('unit A');
  });
});

describe('rejoinHyphenatedWords', () => {
  it('joins words split by hyphen and newline', () => {
    expect(rejoinHyphenatedWords('apart-\nment')).toBe('apartment');
  });

  it('joins with extra whitespace around newline', () => {
    expect(rejoinHyphenatedWords('build-  \n  ing')).toBe('building');
  });

  it('leaves normal hyphens alone', () => {
    expect(rejoinHyphenatedWords('well-known')).toBe('well-known');
  });
});

describe('cleanOcrArtifacts', () => {
  it('collapses repeated pipes', () => {
    expect(cleanOcrArtifacts('|||')).toBe('|');
  });

  it('removes long underscore runs', () => {
    expect(cleanOcrArtifacts('____')).toBe('');
  });

  it('trims dot leaders to ellipsis', () => {
    expect(cleanOcrArtifacts('......')).toBe('...');
  });
});

describe('postProcessOcrText', () => {
  it('applies all fixes in sequence', () => {
    const input = 'apart-\nment 1O5 unit  area 1, 250 sf ||||';
    const result = postProcessOcrText(input);
    expect(result).toContain('apartment');
    expect(result).toContain('105');
    expect(result).toContain('1,250');
    expect(result).not.toContain('||||');
  });
});
