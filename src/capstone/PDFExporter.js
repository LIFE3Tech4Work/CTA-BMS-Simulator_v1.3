/**
 * Capstone PDF Exporter
 * Uses jsPDF (available as window.jspdf.jsPDF) to generate an A4 PDF
 * of the capstone worksheet with header, sections, and responses.
 * Exposed as window.PDFExporter (no import/export).
 */

(function () {
  'use strict';

  var PAGE_WIDTH_MM = 210; // A4 width
  var PAGE_HEIGHT_MM = 297; // A4 height
  var MARGIN_LEFT = 20;
  var MARGIN_RIGHT = 20;
  var MARGIN_TOP = 20;
  var MARGIN_BOTTOM = 20;
  var MAX_TEXT_WIDTH = PAGE_WIDTH_MM - MARGIN_LEFT - MARGIN_RIGHT; // 170mm
  var LINE_HEIGHT = 6;
  var SECTION_GAP = 10;

  /**
   * Generate and download a PDF of the capstone worksheet.
   *
   * @param {Object} options
   * @param {string} options.studentName - Operator/student name
   * @param {Array} options.sections - Array of { id, title, prompt, content }
   * @param {string} [options.timestamp] - ISO timestamp (defaults to now)
   */
  function exportPDF(options) {
    if (!options || !options.sections) {
      console.error('PDFExporter: sections are required');
      return;
    }

    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      console.error('PDFExporter: jsPDF not available. Ensure jspdf is loaded.');
      alert('PDF generation is not available. jsPDF library is not loaded.');
      return;
    }

    var doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    var studentName = options.studentName || 'Unknown Student';
    var timestamp = options.timestamp || new Date().toISOString();
    var sections = options.sections;
    var y = MARGIN_TOP;

    // --- Header ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CTA BMS Training \u2014 Capstone Assessment', MARGIN_LEFT, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Student: ' + studentName, MARGIN_LEFT, y);
    y += 6;

    var formattedDate = formatTimestamp(timestamp);
    doc.text('Date: ' + formattedDate, MARGIN_LEFT, y);
    y += 6;

    // Divider line
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_LEFT, y, PAGE_WIDTH_MM - MARGIN_RIGHT, y);
    y += SECTION_GAP;

    // --- Sections ---
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      y = renderSection(doc, section, y, i + 1);
      if (i < sections.length - 1) {
        y += SECTION_GAP / 2;
      }
    }

    // Generate blob and trigger download
    var blob = doc.output('blob');
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'CTA_Capstone_Worksheet_' + studentName.replace(/\s+/g, '_') + '.pdf';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(function () {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Render a single worksheet section to the PDF.
   * Returns the updated y position.
   */
  function renderSection(doc, section, y, sectionNumber) {
    // Check if we need a page break for the section title
    y = checkPageBreak(doc, y, 20);

    // Section title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    var title = 'Section ' + sectionNumber + ': ' + (section.title || '');
    doc.text(title, MARGIN_LEFT, y);
    y += LINE_HEIGHT + 2;

    // Prompt text (grey)
    if (section.prompt) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      var promptLines = doc.splitTextToSize(section.prompt, MAX_TEXT_WIDTH);
      for (var p = 0; p < promptLines.length; p++) {
        y = checkPageBreak(doc, y, LINE_HEIGHT);
        doc.text(promptLines[p], MARGIN_LEFT, y);
        y += LINE_HEIGHT - 1;
      }
      y += 3;
    }

    // Student response (black)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    var content = (section.content && section.content.trim()) ? section.content.trim() : '(No response provided)';
    var contentLines = doc.splitTextToSize(content, MAX_TEXT_WIDTH);
    for (var c = 0; c < contentLines.length; c++) {
      y = checkPageBreak(doc, y, LINE_HEIGHT);
      doc.text(contentLines[c], MARGIN_LEFT, y);
      y += LINE_HEIGHT;
    }

    return y;
  }

  /**
   * Check if we need a page break. If so, add a new page and reset y.
   */
  function checkPageBreak(doc, y, neededSpace) {
    if (y + neededSpace > PAGE_HEIGHT_MM - MARGIN_BOTTOM) {
      doc.addPage();
      return MARGIN_TOP;
    }
    return y;
  }

  /**
   * Format an ISO timestamp to a human-readable string.
   */
  function formatTimestamp(isoString) {
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) + ' at ' + d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  }

  // Expose globally
  window.PDFExporter = {
    exportPDF: exportPDF
  };
})();
