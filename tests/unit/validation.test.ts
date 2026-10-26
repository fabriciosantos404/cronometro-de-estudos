import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/domain/models';
import {
  clampNumber,
  isDuplicateSubject,
  isValidDurationSec,
  isValidHexColor,
  sanitizeColor,
  sanitizeGoalHours,
  sanitizeNote,
  sanitizeSubjectName,
  sanitizeText,
} from '../../src/domain/validation';

describe('sanitizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeText('  a   b  ', 40)).toBe('a b');
  });
  it('enforces max length', () => {
    expect(sanitizeText('x'.repeat(100), 40)).toHaveLength(40);
  });
  it('strips control characters', () => {
    expect(sanitizeText('hi\u0000\u0007 there', 40)).toBe('hi there');
  });
  it('returns empty for non-strings', () => {
    expect(sanitizeText(null, 40)).toBe('');
    expect(sanitizeText(42, 40)).toBe('');
    expect(sanitizeText(undefined, 40)).toBe('');
  });
});

describe('sanitizeSubjectName / sanitizeNote', () => {
  it('applies limits', () => {
    expect(sanitizeSubjectName('  Matemática  ')).toBe('Matemática');
    expect(sanitizeNote(''.padEnd(500, 'a')).length).toBeLessThanOrEqual(120);
  });
});

describe('hex colors', () => {
  it('validates 3 and 6 digit hex', () => {
    expect(isValidHexColor('#fff')).toBe(true);
    expect(isValidHexColor('#7c5cff')).toBe(true);
    expect(isValidHexColor('7c5cff')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
  });
  it('sanitizes invalid to fallback and normalizes case', () => {
    expect(sanitizeColor('nope')).toBe(PALETTE[0]);
    expect(sanitizeColor('#ABCDEF')).toBe('#abcdef');
  });
});

describe('clampNumber / sanitizeGoalHours', () => {
  it('clamps into range', () => {
    expect(clampNumber(5, 1, 10, 3)).toBe(5);
    expect(clampNumber(-5, 1, 10, 3)).toBe(1);
    expect(clampNumber(99, 1, 10, 3)).toBe(10);
    expect(clampNumber('bad', 1, 10, 3)).toBe(3);
  });
  it('bounds goal hours to 0.5–24', () => {
    expect(sanitizeGoalHours(0)).toBe(0.5);
    expect(sanitizeGoalHours(100)).toBe(24);
    expect(sanitizeGoalHours(6)).toBe(6);
  });
});

describe('isValidDurationSec', () => {
  it('accepts only finite positive numbers', () => {
    expect(isValidDurationSec(1)).toBe(true);
    expect(isValidDurationSec(0)).toBe(false);
    expect(isValidDurationSec(-1)).toBe(false);
    expect(isValidDurationSec(NaN)).toBe(false);
    expect(isValidDurationSec('5')).toBe(false);
  });
});

describe('isDuplicateSubject', () => {
  it('is case-insensitive', () => {
    expect(isDuplicateSubject('Math', ['math', 'Bio'])).toBe(true);
    expect(isDuplicateSubject('Chem', ['math', 'Bio'])).toBe(false);
  });
});
