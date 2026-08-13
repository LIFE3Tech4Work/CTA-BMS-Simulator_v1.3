/**
 * SMEQAForm.jsx — SME Quality Assurance Observation Form
 *
 * Observations are saved to localStorage so they persist across sessions
 * and are available offline. A log panel lets the SME review all past
 * submissions, and a single button exports them all as a .md file.
 *
 * Access: Help → "SME QA: Log Observation"
 *
 * Storage key: 'cta_sme_qa_observations'
 * Each entry: { id, ts, screen, point, types, observed, expected,
 *               soo, priority, blocking, fix }
 */

window.SMEQAForm = (function () {
  'use strict';
  const { useState, useCallback, useEffect, useRef } = React;

  const STORAGE_KEY = 'cta_sme_qa_observations';

  // ── Persistence helpers ──────────────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(entries) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    catch (e) { console.warn('SME QA: localStorage write failed', e); }
  }

  // ── Markdown formatter ───────────────────────────────────────────────────
  function toMarkdown(entry) {
    var lines = [
      '## SME QA Observation — ' + entry.ts,
      '',
      '**Screen:** ' + entry.screen + (entry.point ? ' — ' + entry.point : ''),
      '**Type:** '   + (entry.types && entry.types.length ? entry.types.join(', ') : 'not specified'),
      '**Priority:** ' + entry.priority + (entry.blocking ? ' | Blocks instruction: ' + entry.blocking : ''),
      '',
      '**Observed:**',
      entry.observed,
      '',
      '**Expected:**',
      entry.expected,
    ];
    if (entry.soo) lines.push('', '**SOO / Reference:** ' + entry.soo);
    if (entry.fix) lines.push('', '**Suggested fix:** ' + entry.fix);
    lines.push('', '---', '*Paste this block into Claude to implement the fix.*');
    return lines.join('\n');
  }

  function allToMarkdown(entries) {
    if (!entries.length) return '# SME QA Observation Log\n\nNo observations recorded yet.';
    return '# SME QA Observation Log\n\nExported: ' + new Date().toLocaleString() +
      '\n\n' + entries.map(toMarkdown).join('\n\n');
  }

  // ── Constants ────────────────────────────────────────────────────────────
  var SCREENS = [
    'AHU-4-4', 'AHU-4-6', 'AHU-23-1', 'VAV-4-4-02 (Ballroom)',
    'Alarm Summary', 'EBI Point Detail', 'Schedule Manager',
    'Point Attribute Report', 'Capstone Worksheet', 'LL97 Panel',
    'General / multiple screens',
  ];
  var ISSUE_TYPES = [
    'Wrong value or calculation', 'Missing point or output',
    'Control logic wrong', 'Label confusing or incorrect',
    'Missing feature', 'Visual or layout issue',
    'Alarm not firing or wrong', 'Physically wrong behavior',
  ];
  var PRIORITIES = [
    { label: 'High',   cls: 'bg-red-900 border-red-600 text-red-200' },
    { label: 'Medium', cls: 'bg-amber-900 border-amber-600 text-amber-200' },
    { label: 'Low',    cls: 'bg-green-900 border-green-600 text-green-200' },
  ];
  var BLOCKING = [
    'Yes — students cannot complete the exercise',
    'No — but it creates confusion',
    'No — minor polish',
  ];
  var EMPTY = { screen:'', point:'', types:[], observed:'', expected:'', soo:'', priority:'', blocking:'', fix:'' };

  // ── Main modal ───────────────────────────────────────────────────────────
  function SMEQAModal({ onClose }) {
    var [tab, setTab]       = useState('new');   // 'new' | 'log'
    var [form, setForm]     = useState(EMPTY);
    var [output, setOutput] = useState('');
    var [copied, setCopied] = useState(false);
    var [errors, setErrors] = useState([]);
    var [log, setLog]       = useState(load);
    var [saved, setSaved]   = useState(false);

    // ESC to close
    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [onClose]);

    // Auto-detect current screen from URL hash
    useEffect(function () {
      var hash = (window.location.hash || '').toLowerCase();
      var match = SCREENS.find(function (s) {
        return hash.includes(s.toLowerCase().replace(/[^a-z0-9]/g, ''));
      });
      if (match) setForm(function (f) { return Object.assign({}, f, { screen: match }); });
    }, []);

    function set(key, val) {
      setForm(function (f) { return Object.assign({}, f, { [key]: val }); });
    }
    function toggleType(t) {
      setForm(function (f) {
        var next = f.types.includes(t)
          ? f.types.filter(function (x) { return x !== t; })
          : f.types.concat(t);
        return Object.assign({}, f, { types: next });
      });
    }

    function submit() {
      var missing = [];
      if (!form.screen)   missing.push('screen');
      if (!form.observed) missing.push('what you observed');
      if (!form.expected) missing.push('what you expected');
      if (!form.priority) missing.push('priority');
      if (missing.length) { setErrors(missing); return; }
      setErrors([]);

      // Build entry
      var entry = Object.assign({}, form, {
        id: Date.now().toString(),
        ts: new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }),
      });

      // Save to localStorage
      var updated = [entry].concat(log);
      save(updated);
      setLog(updated);

      // Generate markdown for Claude
      setOutput(toMarkdown(entry));
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 3000);
    }

    function copy() {
      if (!output) return;
      navigator.clipboard.writeText(output).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2500);
      });
    }

    function downloadAll() {
      var text = allToMarkdown(log);
      var blob = new Blob([text], { type: 'text/markdown' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'CTA_SME_QA_Observations_' + new Date().toISOString().slice(0,10) + '.md';
      a.click();
      URL.revokeObjectURL(url);
    }

    function deleteEntry(id) {
      var updated = log.filter(function (e) { return e.id !== id; });
      save(updated);
      setLog(updated);
    }

    function clearAll() {
      if (!window.confirm('Delete all ' + log.length + ' saved observations? This cannot be undone.')) return;
      save([]);
      setLog([]);
    }

    function reset() {
      setForm(EMPTY);
      setOutput('');
      setErrors([]);
    }

    // ── Shared style tokens ─────────────────────────────────────────────────
    var lbl = 'block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1';
    var inp = 'w-full text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500';
    var pillBase = 'px-2.5 py-1 rounded-full border text-[11px] cursor-pointer transition-colors ';

    // Priority badge for log entries
    function priBadge(p) {
      var colors = { High: 'bg-red-900/50 text-red-300 border-red-700', Medium: 'bg-amber-900/50 text-amber-300 border-amber-700', Low: 'bg-green-900/50 text-green-300 border-green-700' };
      return colors[p] || 'bg-gray-700 text-gray-300 border-gray-600';
    }

    return React.createElement('div', {
      className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60',
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
    },
      React.createElement('div', {
        className: 'bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col',
        style: { width: 700, maxHeight: '90vh' },
        onClick: function (e) { e.stopPropagation(); },
      },

        // ── Header ──────────────────────────────────────────────────────────
        React.createElement('div', { className: 'flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0' },
          React.createElement('div', null,
            React.createElement('h2', { className: 'text-sm font-semibold text-gray-100' }, 'SME QA Observation Log'),
            React.createElement('p', { className: 'text-[11px] text-gray-400 mt-0.5' },
              'Saved locally — works offline. Export anytime as Markdown.'
            )
          ),
          React.createElement('div', { className: 'flex items-center gap-3' },
            log.length > 0 && React.createElement('span', { className: 'text-[11px] text-gray-500' },
              log.length + ' saved'
            ),
            React.createElement('button', {
              className: 'text-gray-500 hover:text-gray-200 text-lg leading-none',
              onClick: onClose,
            }, '✕')
          )
        ),

        // ── Tabs ────────────────────────────────────────────────────────────
        React.createElement('div', { className: 'flex border-b border-gray-700 flex-shrink-0' },
          ['new', 'log'].map(function (t) {
            var labels = { new: '+ New Observation', log: 'Saved Log (' + log.length + ')' };
            return React.createElement('button', {
              key: t,
              className: 'px-5 py-2.5 text-xs font-medium transition-colors ' + (tab === t
                ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-800/40'
                : 'text-gray-400 hover:text-gray-200'),
              onClick: function () { setTab(t); },
            }, labels[t]);
          })
        ),

        // ── Scrollable body ─────────────────────────────────────────────────
        React.createElement('div', { className: 'overflow-y-auto flex-1 px-5 py-4' },

          // ══ NEW OBSERVATION TAB ══════════════════════════════════════════
          tab === 'new' && React.createElement('div', { className: 'space-y-4' },

            // Section 1 — Location
            React.createElement('div', { className: 'text-[10px] font-bold text-blue-500 uppercase tracking-widest' }, '1 — Location'),
            React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
              React.createElement('div', null,
                React.createElement('label', { className: lbl }, 'Which screen?'),
                React.createElement('select', { className: inp, value: form.screen,
                  onChange: function (e) { set('screen', e.target.value); } },
                  React.createElement('option', { value: '' }, '— select —'),
                  SCREENS.map(function (s) { return React.createElement('option', { key: s, value: s }, s); })
                )
              ),
              React.createElement('div', null,
                React.createElement('label', { className: lbl }, 'Component or point'),
                React.createElement('input', { type: 'text', className: inp, value: form.point,
                  placeholder: 'e.g. Supply Air %RH, OA Damper',
                  onChange: function (e) { set('point', e.target.value); } })
              )
            ),

            React.createElement('hr', { className: 'border-gray-700' }),

            // Section 2 — Issue type
            React.createElement('div', { className: 'text-[10px] font-bold text-blue-500 uppercase tracking-widest' }, '2 — Issue type'),
            React.createElement('div', { className: 'flex flex-wrap gap-1.5' },
              ISSUE_TYPES.map(function (t) {
                var on = form.types.includes(t);
                return React.createElement('button', { key: t,
                  className: pillBase + (on ? 'bg-blue-900 border-blue-500 text-blue-200' : 'border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'),
                  onClick: function () { toggleType(t); } }, t);
              })
            ),

            React.createElement('hr', { className: 'border-gray-700' }),

            // Section 3 — Observed vs Expected
            React.createElement('div', { className: 'text-[10px] font-bold text-blue-500 uppercase tracking-widest' }, '3 — Observed vs. expected'),
            React.createElement('div', null,
              React.createElement('label', { className: lbl }, 'What did you observe?'),
              React.createElement('p', { className: 'text-[10px] text-gray-500 mb-1' }, 'Value, what you changed, and what happened'),
              React.createElement('textarea', { className: inp, rows: 3, value: form.observed,
                placeholder: 'e.g. When I lowered Cooling Coil Setpoint to 50°F, Supply Air %RH did not change.',
                onChange: function (e) { set('observed', e.target.value); } })
            ),
            React.createElement('div', null,
              React.createElement('label', { className: lbl }, 'What should have happened?'),
              React.createElement('p', { className: 'text-[10px] text-gray-500 mb-1' }, 'Ground in SOO, ASHRAE, or physical reality'),
              React.createElement('textarea', { className: inp, rows: 3, value: form.expected,
                placeholder: 'e.g. Per SOO CLC #4, CHW coil dehumidifies proportional to valve opening. Supply Air %RH should decrease.',
                onChange: function (e) { set('expected', e.target.value); } })
            ),
            React.createElement('div', null,
              React.createElement('label', { className: lbl }, 'SOO / reference (optional)'),
              React.createElement('input', { type: 'text', className: inp, value: form.soo,
                placeholder: 'e.g. SOO CLC #4, ASHRAE 62.1, Points List DA-3',
                onChange: function (e) { set('soo', e.target.value); } })
            ),

            React.createElement('hr', { className: 'border-gray-700' }),

            // Section 4 — Priority
            React.createElement('div', { className: 'text-[10px] font-bold text-blue-500 uppercase tracking-widest' }, '4 — Priority'),
            React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
              React.createElement('div', null,
                React.createElement('label', { className: lbl }, 'Priority'),
                React.createElement('div', { className: 'flex gap-2' },
                  PRIORITIES.map(function (p) {
                    var on = form.priority === p.label;
                    return React.createElement('button', { key: p.label,
                      className: pillBase + (on ? p.cls : 'border-gray-600 text-gray-400 hover:border-gray-400'),
                      onClick: function () { set('priority', p.label); } }, p.label);
                  })
                )
              ),
              React.createElement('div', null,
                React.createElement('label', { className: lbl }, 'Blocks instruction?'),
                React.createElement('div', { className: 'space-y-1' },
                  BLOCKING.map(function (b) {
                    var on = form.blocking === b;
                    return React.createElement('button', { key: b,
                      className: 'block w-full text-left px-2 py-1 rounded border text-[11px] cursor-pointer transition-colors ' +
                        (on ? 'bg-gray-700 border-gray-400 text-gray-100' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'),
                      onClick: function () { set('blocking', b); } }, b);
                  })
                )
              )
            ),
            React.createElement('div', null,
              React.createElement('label', { className: lbl }, 'Suggested fix (optional)'),
              React.createElement('textarea', { className: inp, rows: 2, value: form.fix,
                placeholder: 'e.g. In AHU44NewController.js, supplyRH should decrease when chwValvePosition increases',
                onChange: function (e) { set('fix', e.target.value); } })
            ),

            // Errors
            errors.length > 0 && React.createElement('div', { className: 'text-[11px] text-red-400 bg-red-900/30 border border-red-700 rounded px-3 py-2' },
              'Please complete: ' + errors.join(', ')
            ),

            // Submit row
            React.createElement('div', { className: 'flex items-center gap-2 pt-1' },
              React.createElement('button', {
                className: 'px-4 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded font-medium',
                onClick: submit,
              }, 'Save observation'),
              saved && React.createElement('span', { className: 'text-[11px] text-green-400' }, '✓ Saved to log'),
              React.createElement('div', { className: 'flex-1' }),
              React.createElement('button', {
                className: 'px-3 py-1.5 border border-gray-700 text-gray-500 hover:text-gray-300 text-xs rounded',
                onClick: reset,
              }, 'Clear form'),
            ),

            // Generated output for Claude
            output && React.createElement('div', null,
              React.createElement('div', { className: 'flex items-center justify-between mb-1 mt-2' },
                React.createElement('label', { className: lbl }, 'Paste into Claude to implement fix'),
                React.createElement('button', {
                  className: 'text-[11px] px-2.5 py-1 border rounded ' +
                    (copied ? 'border-green-600 text-green-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'),
                  onClick: copy,
                }, copied ? '✓ Copied!' : 'Copy')
              ),
              React.createElement('pre', {
                className: 'bg-gray-800 border border-gray-700 rounded p-3 text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed overflow-auto max-h-52',
              }, output)
            )
          ),

          // ══ SAVED LOG TAB ════════════════════════════════════════════════
          tab === 'log' && React.createElement('div', null,

            // Log toolbar
            React.createElement('div', { className: 'flex items-center justify-between mb-3' },
              React.createElement('span', { className: 'text-[11px] text-gray-400' },
                log.length === 0 ? 'No observations saved yet.' : log.length + ' observation' + (log.length === 1 ? '' : 's') + ' — stored in browser'
              ),
              React.createElement('div', { className: 'flex gap-2' },
                log.length > 0 && React.createElement('button', {
                  className: 'px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white text-[11px] rounded font-medium',
                  onClick: downloadAll,
                  title: 'Download all observations as a .md file — works offline',
                }, '⬇ Export all as Markdown'),
                log.length > 0 && React.createElement('button', {
                  className: 'px-3 py-1 border border-red-800 text-red-400 hover:text-red-300 text-[11px] rounded',
                  onClick: clearAll,
                }, 'Clear all'),
              )
            ),

            // Empty state
            log.length === 0 && React.createElement('div', {
              className: 'text-center py-12 text-gray-500 text-sm'
            },
              React.createElement('div', { className: 'text-3xl mb-3' }, '📋'),
              React.createElement('p', null, 'No observations saved yet.'),
              React.createElement('p', { className: 'text-xs mt-1' }, 'Switch to the New Observation tab to log your first finding.')
            ),

            // Log entries
            React.createElement('div', { className: 'space-y-2' },
              log.map(function (entry) {
                return React.createElement('div', {
                  key: entry.id,
                  className: 'bg-gray-800 border border-gray-700 rounded p-3',
                },
                  // Entry header
                  React.createElement('div', { className: 'flex items-start justify-between gap-2 mb-2' },
                    React.createElement('div', { className: 'flex-1 min-w-0' },
                      React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
                        React.createElement('span', { className: 'text-xs font-medium text-gray-200' },
                          entry.screen + (entry.point ? ' — ' + entry.point : '')
                        ),
                        entry.priority && React.createElement('span', {
                          className: 'text-[10px] px-2 py-0.5 rounded-full border font-medium ' + priBadge(entry.priority),
                        }, entry.priority),
                      ),
                      React.createElement('div', { className: 'text-[10px] text-gray-500 mt-0.5' },
                        entry.ts + (entry.types && entry.types.length ? ' · ' + entry.types.join(', ') : '')
                      ),
                    ),
                    React.createElement('button', {
                      className: 'text-gray-600 hover:text-red-400 text-sm flex-shrink-0',
                      onClick: function () { deleteEntry(entry.id); },
                      title: 'Delete this observation',
                    }, '✕')
                  ),
                  // Entry body — collapsible summary
                  React.createElement('div', { className: 'space-y-1' },
                    React.createElement('p', { className: 'text-[11px] text-gray-400' },
                      React.createElement('span', { className: 'text-gray-500 font-medium' }, 'Observed: '),
                      entry.observed.length > 120 ? entry.observed.slice(0, 120) + '…' : entry.observed
                    ),
                    React.createElement('p', { className: 'text-[11px] text-gray-400' },
                      React.createElement('span', { className: 'text-gray-500 font-medium' }, 'Expected: '),
                      entry.expected.length > 120 ? entry.expected.slice(0, 120) + '…' : entry.expected
                    ),
                    entry.soo && React.createElement('p', { className: 'text-[10px] text-blue-400' }, '📄 ' + entry.soo),
                    entry.blocking && entry.blocking.startsWith('Yes') && React.createElement('p', { className: 'text-[10px] text-red-400 font-medium' }, '⚠ Blocks instruction'),
                  ),
                  // Copy individual entry
                  React.createElement('button', {
                    className: 'mt-2 text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5',
                    onClick: function () {
                      navigator.clipboard.writeText(toMarkdown(entry)).then(function () {});
                    },
                  }, 'Copy this entry for Claude')
                );
              })
            )
          )
        ) // end scrollable body
      ) // end modal
    ); // end backdrop
  }

  // ── Singleton mount ──────────────────────────────────────────────────────
  var _container = null;

  function open() {
    if (!_container) {
      _container = document.createElement('div');
      document.body.appendChild(_container);
    }
    ReactDOM.render(
      React.createElement(SMEQAModal, { onClose: close }),
      _container
    );
  }

  function close() {
    if (_container) ReactDOM.unmountComponentAtNode(_container);
  }

  return { open: open, close: close };
})();
