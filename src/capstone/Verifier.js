/**
 * Capstone Worksheet Verifier
 * Checks all 5 sections have sufficient content before enabling export/submit.
 * Exposed as window.CapstoneVerifier (no import/export).
 */

(function () {
  'use strict';

  var MIN_CONTENT_LENGTH = 10;

  /**
   * Verify that all worksheet sections are complete.
   * A section is complete if it has at least 10 characters of content.
   *
   * @param {Array} sections - Array of section objects with at least { id, title, content }
   * @returns {{ complete: boolean, missingCount: number, missingSections: Array }}
   */
  function verify(sections) {
    if (!Array.isArray(sections) || sections.length === 0) {
      return {
        complete: false,
        missingCount: 5,
        missingSections: []
      };
    }

    var missingSections = [];

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var content = (section && section.content) ? section.content.trim() : '';
      if (content.length < MIN_CONTENT_LENGTH) {
        missingSections.push({
          id: section ? section.id : i + 1,
          title: section ? section.title : 'Section ' + (i + 1)
        });
      }
    }

    return {
      complete: missingSections.length === 0,
      missingCount: missingSections.length,
      missingSections: missingSections
    };
  }

  /**
   * Submit capstone worksheet to localStorage for instructor review.
   * Persists to localStorage["capstone_submissions"] as JSON array.
   *
   * @param {string} operator - The operator/student name
   * @param {Array} sections - Array of { id, title, content }
   * @param {boolean} skipConfirm - Skip the confirmation dialog (for testing)
   * @returns {boolean} True if submission was saved successfully
   */
  function submit(operator, sections, skipConfirm) {
    // Confirmation dialog before submit
    if (!skipConfirm) {
      var confirmed = window.confirm(
        'Are you sure you want to submit your capstone worksheet? This action cannot be undone.'
      );
      if (!confirmed) {
        return false;
      }
    }

    var entry = {
      operator: operator || 'Unknown',
      timestamp: new Date().toISOString(),
      sections: sections.map(function (s) {
        return {
          id: s.id,
          title: s.title,
          content: s.content
        };
      }),
      submitted: true
    };

    try {
      var existing = [];
      var stored = localStorage.getItem('capstone_submissions');
      if (stored) {
        existing = JSON.parse(stored);
        if (!Array.isArray(existing)) {
          existing = [];
        }
      }
      existing.push(entry);
      localStorage.setItem('capstone_submissions', JSON.stringify(existing));
      return true;
    } catch (e) {
      console.error('Failed to save capstone submission:', e);
      return false;
    }
  }

  /**
   * Check if all 5 sections have non-empty content.
   * Returns true only when every section has content (trimmed, non-empty).
   *
   * @param {Array} sections - Array of section objects with at least { content }
   * @returns {boolean}
   */
  function isComplete(sections) {
    if (!Array.isArray(sections) || sections.length < 5) {
      return false;
    }
    for (var i = 0; i < sections.length; i++) {
      var content = (sections[i] && sections[i].content) ? sections[i].content.trim() : '';
      if (content.length === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get completion status per section.
   * Returns an array of booleans (one per section) indicating whether that section has content.
   *
   * @param {Array} sections - Array of section objects with at least { content }
   * @returns {boolean[]}
   */
  function getCompletionStatus(sections) {
    if (!Array.isArray(sections)) {
      return [false, false, false, false, false];
    }
    var result = [];
    for (var i = 0; i < 5; i++) {
      var section = sections[i];
      var content = (section && section.content) ? section.content.trim() : '';
      result.push(content.length > 0);
    }
    return result;
  }

  // Expose globally
  window.CapstoneVerifier = {
    verify: verify,
    submit: submit,
    isComplete: isComplete,
    getCompletionStatus: getCompletionStatus,
    MIN_CONTENT_LENGTH: MIN_CONTENT_LENGTH
  };
})();
