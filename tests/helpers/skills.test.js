import { describe, it, expect } from 'vitest';
import { slugifySkillName, generateCustomSkillKey } from '../../module/helpers/skills.mjs';

describe('slugifySkillName', () => {
  it('lowercases and keeps plain ascii words', () => {
    expect(slugifySkillName('Verhandeln')).toBe('verhandeln');
  });

  it('strips diacritics', () => {
    expect(slugifySkillName('Überzeugen')).toBe('uberzeugen');
  });

  it('collapses symbols and whitespace to single hyphens', () => {
    expect(slugifySkillName('Nah- & Fernkampf!!')).toBe('nah-fernkampf');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifySkillName('  -Schleichen-  ')).toBe('schleichen');
  });

  it('removes dots, since they are actor.update() path separators', () => {
    expect(slugifySkillName('R.O.T.-Piloting')).toBe('r-o-t-piloting');
  });

  it('returns an empty string for names with no sluggable characters', () => {
    expect(slugifySkillName('!!!')).toBe('');
  });

  it('handles null/undefined input', () => {
    expect(slugifySkillName(undefined)).toBe('');
    expect(slugifySkillName(null)).toBe('');
  });
});

describe('generateCustomSkillKey', () => {
  it('prefixes the slug with "custom-"', () => {
    expect(generateCustomSkillKey([], 'Verhandeln')).toBe('custom-verhandeln');
  });

  it('falls back to "custom-skill" for an unsluggable name', () => {
    expect(generateCustomSkillKey([], '!!!')).toBe('custom-skill');
  });

  it('appends -2 on a first collision', () => {
    expect(generateCustomSkillKey(['custom-verhandeln'], 'Verhandeln')).toBe('custom-verhandeln-2');
  });

  it('keeps incrementing past multiple collisions', () => {
    const existing = ['custom-verhandeln', 'custom-verhandeln-2', 'custom-verhandeln-3'];
    expect(generateCustomSkillKey(existing, 'Verhandeln')).toBe('custom-verhandeln-4');
  });

  it('is unaffected by unrelated built-in keys', () => {
    expect(generateCustomSkillKey(['brawling', 'swords'], 'Verhandeln')).toBe('custom-verhandeln');
  });
});
