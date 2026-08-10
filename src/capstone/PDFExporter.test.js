/**
 * Tests for Capstone PDFExporter
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PDF_CODE = readFileSync(join(__dirname, 'PDFExporter.js'), 'utf8');

// Mock jsPDF instance
function createMockDoc() {
  return {
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    text: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn(function (text) { return [text]; }),
    output: vi.fn(function () { return new Blob(['pdf'], { type: 'application/pdf' }); })
  };
}

let mockDoc;
let mockLink;

beforeEach(() => {
  mockDoc = createMockDoc();
  mockLink = { href: '', download: '', style: {}, click: vi.fn() };

  // Create a proper constructor for jsPDF (must be callable with `new`)
  function MockJsPDF(opts) {
    MockJsPDF._lastOpts = opts;
    return mockDoc;
  }
  MockJsPDF._lastOpts = null;

  globalThis.window = {
    jspdf: { jsPDF: MockJsPDF },
    confirm: vi.fn(function () { return true; }),
    alert: vi.fn(),
    PDFExporter: null
  };

  globalThis.alert = vi.fn();
  globalThis.document = {
    createElement: vi.fn(function () { return mockLink; }),
    body: { appendChild: vi.fn(), removeChild: vi.fn() }
  };
  globalThis.URL = {
    createObjectURL: vi.fn(function () { return 'blob:url'; }),
    revokeObjectURL: vi.fn()
  };

  // Execute the PDFExporter IIFE
  eval(PDF_CODE);
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.URL;
  delete globalThis.alert;
});

describe('PDFExporter.exportPDF', () => {
  it('creates an A4 portrait PDF document', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Test Student',
      sections: [{ id: 1, title: 'S1', prompt: 'P1', content: 'Response 1' }]
    });

    expect(window.jspdf.jsPDF._lastOpts).toEqual({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
  });

  it('generates a blob and triggers download via anchor click', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Test Student',
      sections: [{ id: 1, title: 'S1', prompt: 'P1', content: 'Response 1' }]
    });

    expect(mockDoc.output).toHaveBeenCalledWith('blob');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('uses student name in the download filename', () => {
    window.PDFExporter.exportPDF({
      studentName: 'John Doe',
      sections: [{ id: 1, title: 'S1', prompt: 'P1', content: 'Response 1' }]
    });

    expect(mockLink.download).toBe('CTA_Capstone_Worksheet_John_Doe.pdf');
  });

  it('renders header with title, student name, and timestamp', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Jane Smith',
      sections: [{ id: 1, title: 'S1', prompt: 'P1', content: 'Resp' }],
      timestamp: '2026-06-01T14:30:00Z'
    });

    const textCalls = mockDoc.text.mock.calls;
    expect(textCalls.some(c => c[0].includes('CTA BMS Training'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Jane Smith'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Date:'))).toBe(true);
  });

  it('renders all 5 sections with titles', () => {
    const sections = [
      { id: 1, title: 'Analysis', prompt: 'Analyze', content: 'My analysis' },
      { id: 2, title: 'Findings', prompt: 'Report', content: 'My findings' },
      { id: 3, title: 'Recs', prompt: 'Make recs', content: 'My recs' },
      { id: 4, title: 'Impl', prompt: 'Plan', content: 'My plan' },
      { id: 5, title: 'Conclusion', prompt: 'Summarize', content: 'My summary' }
    ];

    window.PDFExporter.exportPDF({ studentName: 'Student', sections });

    const textCalls = mockDoc.text.mock.calls;
    expect(textCalls.some(c => c[0].includes('Section 1: Analysis'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Section 2: Findings'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Section 3: Recs'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Section 4: Impl'))).toBe(true);
    expect(textCalls.some(c => c[0].includes('Section 5: Conclusion'))).toBe(true);
  });

  it('uses grey for prompts and black for responses', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Student',
      sections: [{ id: 1, title: 'S1', prompt: 'A prompt', content: 'A response' }]
    });

    const colorCalls = mockDoc.setTextColor.mock.calls;
    expect(colorCalls.some(c => c[0] === 100 && c[1] === 100 && c[2] === 100)).toBe(true);
    expect(colorCalls.some(c => c[0] === 0 && c[1] === 0 && c[2] === 0)).toBe(true);
  });

  it('shows "(No response provided)" when content is empty', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Student',
      sections: [{ id: 1, title: 'S1', prompt: 'A prompt', content: '' }]
    });

    const textCalls = mockDoc.text.mock.calls;
    expect(textCalls.some(c => c[0] === '(No response provided)')).toBe(true);
  });

  it('handles missing jsPDF gracefully', () => {
    window.jspdf = null;
    // Re-load with null jspdf
    eval(PDF_CODE);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.PDFExporter.exportPDF({
      studentName: 'Student',
      sections: [{ id: 1, title: 'S1', prompt: 'P', content: 'C' }]
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('jsPDF not available'));
    consoleSpy.mockRestore();
  });

  it('handles missing options gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.PDFExporter.exportPDF(null);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sections are required'));
    consoleSpy.mockRestore();
  });

  it('uses splitTextToSize with 170mm max width', () => {
    window.PDFExporter.exportPDF({
      studentName: 'Student',
      sections: [{ id: 1, title: 'S1', prompt: 'A prompt text', content: 'Response text' }]
    });

    const splitCalls = mockDoc.splitTextToSize.mock.calls;
    expect(splitCalls.some(c => c[1] === 170)).toBe(true);
  });
});
