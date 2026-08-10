/**
 * Tests for Capstone Verifier
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Load the Verifier module (sets window.CapstoneVerifier)
// We need to simulate the browser global
beforeEach(() => {
  // Reset the global
  delete globalThis.window;
  globalThis.window = {
    confirm: vi.fn(() => true),
    alert: vi.fn()
  };

  // Mock localStorage
  const store = {};
  globalThis.localStorage = {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); })
  };

  // Execute the Verifier IIFE
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, 'Verifier.js'), 'utf8');
  eval(code);
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
});

describe('CapstoneVerifier.verify', () => {
  it('returns complete:true when all 5 sections have >= 10 chars', () => {
    const sections = [
      { id: 1, title: 'Section 1', content: 'This is enough content here.' },
      { id: 2, title: 'Section 2', content: '1234567890' },
      { id: 3, title: 'Section 3', content: 'More than ten characters.' },
      { id: 4, title: 'Section 4', content: 'Sufficient text content.' },
      { id: 5, title: 'Section 5', content: 'Also has enough text.' }
    ];

    const result = window.CapstoneVerifier.verify(sections);
    expect(result.complete).toBe(true);
    expect(result.missingCount).toBe(0);
    expect(result.missingSections).toEqual([]);
  });

  it('returns complete:false when a section has less than 10 chars', () => {
    const sections = [
      { id: 1, title: 'Section 1', content: 'Long enough content here.' },
      { id: 2, title: 'Section 2', content: 'short' },
      { id: 3, title: 'Section 3', content: 'Also long enough content.' },
      { id: 4, title: 'Section 4', content: 'Sufficient text here too.' },
      { id: 5, title: 'Section 5', content: '' }
    ];

    const result = window.CapstoneVerifier.verify(sections);
    expect(result.complete).toBe(false);
    expect(result.missingCount).toBe(2);
    expect(result.missingSections).toEqual([
      { id: 2, title: 'Section 2' },
      { id: 5, title: 'Section 5' }
    ]);
  });

  it('handles empty array gracefully', () => {
    const result = window.CapstoneVerifier.verify([]);
    expect(result.complete).toBe(false);
    expect(result.missingCount).toBe(5);
  });

  it('handles null/undefined sections gracefully', () => {
    const result = window.CapstoneVerifier.verify(null);
    expect(result.complete).toBe(false);
    expect(result.missingCount).toBe(5);
  });

  it('trims whitespace before checking length', () => {
    const sections = [
      { id: 1, title: 'S1', content: '          ' }, // 10 spaces = 0 after trim
      { id: 2, title: 'S2', content: '1234567890' },
      { id: 3, title: 'S3', content: '1234567890' },
      { id: 4, title: 'S4', content: '1234567890' },
      { id: 5, title: 'S5', content: '1234567890' }
    ];

    const result = window.CapstoneVerifier.verify(sections);
    expect(result.complete).toBe(false);
    expect(result.missingCount).toBe(1);
    expect(result.missingSections[0].id).toBe(1);
  });

  it('exactly 10 characters is sufficient', () => {
    const sections = [
      { id: 1, title: 'S1', content: '1234567890' },
      { id: 2, title: 'S2', content: '1234567890' },
      { id: 3, title: 'S3', content: '1234567890' },
      { id: 4, title: 'S4', content: '1234567890' },
      { id: 5, title: 'S5', content: '1234567890' }
    ];

    const result = window.CapstoneVerifier.verify(sections);
    expect(result.complete).toBe(true);
  });
});

describe('CapstoneVerifier.isComplete', () => {
  it('returns true when all 5 sections have non-empty content', () => {
    const sections = [
      { id: 1, content: 'Response 1' },
      { id: 2, content: 'Response 2' },
      { id: 3, content: 'Response 3' },
      { id: 4, content: 'Response 4' },
      { id: 5, content: 'Response 5' }
    ];
    expect(window.CapstoneVerifier.isComplete(sections)).toBe(true);
  });

  it('returns false when any section is empty', () => {
    const sections = [
      { id: 1, content: 'Response 1' },
      { id: 2, content: '' },
      { id: 3, content: 'Response 3' },
      { id: 4, content: 'Response 4' },
      { id: 5, content: 'Response 5' }
    ];
    expect(window.CapstoneVerifier.isComplete(sections)).toBe(false);
  });

  it('returns false when sections array has fewer than 5 items', () => {
    const sections = [
      { id: 1, content: 'Response 1' },
      { id: 2, content: 'Response 2' }
    ];
    expect(window.CapstoneVerifier.isComplete(sections)).toBe(false);
  });

  it('returns false for whitespace-only content', () => {
    const sections = [
      { id: 1, content: '  ' },
      { id: 2, content: 'Response 2' },
      { id: 3, content: 'Response 3' },
      { id: 4, content: 'Response 4' },
      { id: 5, content: 'Response 5' }
    ];
    expect(window.CapstoneVerifier.isComplete(sections)).toBe(false);
  });

  it('returns false for null input', () => {
    expect(window.CapstoneVerifier.isComplete(null)).toBe(false);
  });
});

describe('CapstoneVerifier.getCompletionStatus', () => {
  it('returns array of booleans matching each section completion', () => {
    const sections = [
      { id: 1, content: 'Has content' },
      { id: 2, content: '' },
      { id: 3, content: 'Also has content' },
      { id: 4, content: '   ' },
      { id: 5, content: 'Content here' }
    ];
    const status = window.CapstoneVerifier.getCompletionStatus(sections);
    expect(status).toEqual([true, false, true, false, true]);
  });

  it('returns all false for empty sections', () => {
    const sections = [
      { id: 1, content: '' },
      { id: 2, content: '' },
      { id: 3, content: '' },
      { id: 4, content: '' },
      { id: 5, content: '' }
    ];
    const status = window.CapstoneVerifier.getCompletionStatus(sections);
    expect(status).toEqual([false, false, false, false, false]);
  });

  it('returns all true for complete sections', () => {
    const sections = [
      { id: 1, content: 'a' },
      { id: 2, content: 'b' },
      { id: 3, content: 'c' },
      { id: 4, content: 'd' },
      { id: 5, content: 'e' }
    ];
    const status = window.CapstoneVerifier.getCompletionStatus(sections);
    expect(status).toEqual([true, true, true, true, true]);
  });

  it('returns all false for null input', () => {
    const status = window.CapstoneVerifier.getCompletionStatus(null);
    expect(status).toEqual([false, false, false, false, false]);
  });
});

describe('CapstoneVerifier.submit', () => {
  it('persists submission to localStorage as JSON array', () => {
    const sections = [
      { id: 1, title: 'S1', content: 'Answer 1' },
      { id: 2, title: 'S2', content: 'Answer 2' }
    ];

    const result = window.CapstoneVerifier.submit('test_student', sections, true);
    expect(result).toBe(true);

    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored).toHaveLength(1);
    expect(stored[0].operator).toBe('test_student');
    expect(stored[0].submitted).toBe(true);
    expect(stored[0].sections).toHaveLength(2);
    expect(stored[0].sections[0].id).toBe(1);
    expect(stored[0].sections[0].content).toBe('Answer 1');
    expect(stored[0].timestamp).toBeDefined();
  });

  it('appends to existing submissions', () => {
    const existing = [{ operator: 'prev', timestamp: '2026-01-01', sections: [], submitted: true }];
    localStorage.getItem = vi.fn(() => JSON.stringify(existing));

    const sections = [{ id: 1, title: 'S1', content: 'New answer' }];
    window.CapstoneVerifier.submit('new_student', sections, true);

    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored).toHaveLength(2);
    expect(stored[0].operator).toBe('prev');
    expect(stored[1].operator).toBe('new_student');
  });

  it('shows confirmation dialog when skipConfirm is false', () => {
    window.confirm = vi.fn(() => false);
    const sections = [{ id: 1, title: 'S1', content: 'Answer' }];

    const result = window.CapstoneVerifier.submit('student', sections, false);
    expect(result).toBe(false);
    expect(window.confirm).toHaveBeenCalled();
  });

  it('stores entry with correct shape', () => {
    const sections = [
      { id: 1, title: 'Analysis', content: 'My analysis text' },
      { id: 2, title: 'Findings', content: 'My findings text' }
    ];

    window.CapstoneVerifier.submit('operator1', sections, true);

    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    const entry = stored[0];
    expect(entry).toHaveProperty('operator', 'operator1');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('submitted', true);
    expect(entry.sections[0]).toEqual({ id: 1, title: 'Analysis', content: 'My analysis text' });
  });
});
