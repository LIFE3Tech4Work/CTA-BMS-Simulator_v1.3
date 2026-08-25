/**
 * WeeklySchedule.jsx — Weekly schedule table for AHU schedule objects
 *
 * Displays a Day/Time/Value table showing the weekly schedule pattern.
 * Columns: Day of Week, Start Time, End Time, Value (Active/Inactive)
 *
 * AHU-4-4 and AHU-23-1: Normal pattern — weekday 08:00–18:00 Active
 *
 * Functional buttons: Insert (add row), Modify (edit selected row), Delete (remove row)
 *
 * Supv+ security required to modify (read from AuthContext).
 * No import/export — exposes as window.WeeklySchedule
 */

const WeeklySchedule = (() => {
  const { useState, useContext } = React;

  // Shared style tokens for this screen. Defined once so the four form fields and the
  // four column headers cannot drift apart, which is how the old Tailwind version
  // ended up with three different button weights for three peer actions.
  const FIELD_LABEL = { display: 'block', fontSize: '11.5px', color: '#c7d4e6', marginBottom: '4px' };
  const FIELD_INPUT = { width: '100%', boxSizing: 'border-box', padding: '6px 8px',
                        borderRadius: '4px', fontSize: '12.5px', fontFamily: 'inherit',
                        background: '#1b2536', border: '1px solid #46536b', color: '#fff' };
  const HEAD_TH = { padding: '7px 12px', textAlign: 'left', fontSize: '10px',
                    fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase' };

  // Per-unit occupied patterns. Deliberately NOT identical: a conference room runs later than
  // an office floor, and a meeting room does not run at weekends. Identical schedules
  // would make the distinction between units invisible, which is the thing a student is
  // meant to reason about when asked whether a unit should be running at all.
  //
  // The weekday 08:00–18:00 window matches the occupied test used by the F-03
  // "running unoccupied" alarm, so the two agree.
  var PATTERNS = {
    // Conference Room air handler: event space, so it runs into the evening.
    'AHU-4-4': { start: '08:00:00', end: '22:00:00', days: 5 },
    'AHU-4-3': { start: '08:00:00', end: '22:00:00', days: 5 },
    // Meeting-room box: weekdays only, standard office hours.
    'VAV-02-03': { start: '08:00:00', end: '18:00:00', days: 5 },
    // Conference Room terminal box follows its air handler.
    'VAV-4-4-02': { start: '08:00:00', end: '22:00:00', days: 5 },
    // 2nd-level meeting rooms, and the default.
    'AHU-4-6': { start: '08:00:00', end: '18:00:00', days: 5 },
    'AHU-23-1': { start: '08:00:00', end: '18:00:00', days: 5 }
  };

  function getDefaultSchedule(scheduleId) {
    var p = PATTERNS[scheduleId] || PATTERNS['AHU-4-6'];
    var names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return names.slice(0, p.days).map(function (d, i) {
      return { id: i + 1, day: d, startTime: p.start, endTime: p.end,
               value: 'Active', isFault: false };
    });
  }

  const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function WeeklyScheduleComponent({ scheduleId }) {
    const auth = useContext(window.AuthContext);
    const canModify = auth && auth.canModifySchedules ? auth.canModifySchedules() : false;

    const [entries, setEntries] = useState(() => getDefaultSchedule(scheduleId || 'AHU-4-4'));
    const [selectedRow, setSelectedRow] = useState(null);
    const [showInsertModal, setShowInsertModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);
    const [formData, setFormData] = useState({
      day: 'Monday',
      startTime: '08:00:00',
      endTime: '18:00:00',
      value: 'Active'
    });

    // Reset entries when scheduleId changes
    React.useEffect(() => {
      setEntries(getDefaultSchedule(scheduleId || 'AHU-4-4'));
      setSelectedRow(null);
    }, [scheduleId]);

    // Check if an entry is a fault condition (24/7 pattern)
    function isFaultEntry(entry) {
      return entry.isFault || (entry.startTime === '00:01:00' && entry.endTime === '23:59:00');
    }

    // Generate next ID
    function getNextId() {
      return entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;
    }

    // Insert a new entry
    function handleInsert() {
      if (!canModify) return;
      setFormData({ day: 'Monday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active' });
      setShowInsertModal(true);
    }

    function confirmInsert() {
      const newEntry = {
        id: getNextId(),
        day: formData.day,
        startTime: formData.startTime,
        endTime: formData.endTime,
        value: formData.value,
        isFault: false
      };
      setEntries(prev => [...prev, newEntry]);
      setShowInsertModal(false);
    }

    // Modify selected entry
    function handleModify() {
      if (!canModify || selectedRow === null) return;
      const entry = entries.find(e => e.id === selectedRow);
      if (entry) {
        setFormData({
          day: entry.day,
          startTime: entry.startTime,
          endTime: entry.endTime,
          value: entry.value
        });
        setShowModifyModal(true);
      }
    }

    function confirmModify() {
      setEntries(prev => prev.map(e => {
        if (e.id === selectedRow) {
          return { ...e, day: formData.day, startTime: formData.startTime, endTime: formData.endTime, value: formData.value };
        }
        return e;
      }));
      setShowModifyModal(false);
    }

    // Delete selected entry
    function handleDelete() {
      if (!canModify || selectedRow === null) return;
      setEntries(prev => prev.filter(e => e.id !== selectedRow));
      setSelectedRow(null);
    }

    // Form modal component
    function renderModal(title, onConfirm, onCancel) {
      return React.createElement('div', {
        className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      },
        React.createElement('div', {
          style: { width: '330px', padding: '16px', borderRadius: '8px',
                   background: 'linear-gradient(180deg,#243044,#1b2536)',
                   border: '1px solid #171f2d',
                   fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" }
        },
          React.createElement('h3', {
            style: { fontSize: '13px', fontWeight: 800, color: '#fff', marginBottom: '12px' }
          }, title),
          // Day selector
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { style: FIELD_LABEL }, 'Day of Week'),
            React.createElement('select', {
              style: FIELD_INPUT,
              value: formData.day,
              onChange: function(e) { setFormData(prev => ({ ...prev, day: e.target.value })); }
            },
              DAYS_OF_WEEK.map(d => React.createElement('option', { key: d, value: d }, d))
            )
          ),
          // Start Time
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { style: FIELD_LABEL }, 'Start Time (HH:MM:SS)'),
            React.createElement('input', {
              type: 'text',
              style: FIELD_INPUT,
              value: formData.startTime,
              onChange: function(e) { setFormData(prev => ({ ...prev, startTime: e.target.value })); }
            })
          ),
          // End Time
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { style: FIELD_LABEL }, 'End Time (HH:MM:SS)'),
            React.createElement('input', {
              type: 'text',
              style: FIELD_INPUT,
              value: formData.endTime,
              onChange: function(e) { setFormData(prev => ({ ...prev, endTime: e.target.value })); }
            })
          ),
          // Value
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { style: FIELD_LABEL }, 'Value'),
            React.createElement('select', {
              style: FIELD_INPUT,
              value: formData.value,
              onChange: function(e) { setFormData(prev => ({ ...prev, value: e.target.value })); }
            },
              React.createElement('option', { value: 'Active' }, 'Active'),
              React.createElement('option', { value: 'Inactive' }, 'Inactive')
            )
          ),
          // Buttons
          React.createElement('div', { className: 'flex justify-end gap-2' },
            React.createElement('button', {
              style: { padding: '6px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 700,
                       cursor: 'pointer', fontFamily: 'inherit', background: '#1b2230',
                       border: '1px solid #46536b', color: '#c3cfdd' },
              onClick: onCancel
            }, 'Cancel'),
            React.createElement('button', {
              style: { padding: '6px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 800,
                       cursor: 'pointer', fontFamily: 'inherit', color: '#fff',
                       background: 'linear-gradient(180deg,#3f6fbf,#2d5aa8)',
                       border: '1px solid #2d5aa8' },
              onClick: onConfirm
            }, 'OK')
          )
        )
      );
    }

    return React.createElement('div', { className: 'flex flex-col h-full' },
      // Header
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                 padding: '8px 12px', background: '#18202e',
                 borderBottom: '1px solid #232c3d', flexShrink: 0 }
      },
        React.createElement('h3', {
          style: { fontSize: '12px', fontWeight: 800, color: '#e8edf6', letterSpacing: '.2px' }
        }, 'Weekly Schedule'),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            style: { padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                     letterSpacing: '.2px', fontFamily: 'inherit',
                     cursor: canModify ? 'pointer' : 'not-allowed',
                     background: canModify ? '#2d5aa8' : '#1b2230',
                     border: '1px solid ' + (canModify ? '#2d5aa8' : '#38445c'),
                     color: canModify ? '#fff' : '#5d6b83' },
            onClick: handleInsert,
            disabled: !canModify,
            title: canModify ? 'Insert new schedule entry' : 'Supv+ security required'
          }, 'Insert'),
          React.createElement('button', {
            style: { padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                     letterSpacing: '.2px', fontFamily: 'inherit',
                     cursor: (canModify && selectedRow !== null) ? 'pointer' : 'not-allowed',
                     background: (canModify && selectedRow !== null) ? '#8a6116' : '#1b2230',
                     border: '1px solid ' + ((canModify && selectedRow !== null) ? '#8a6116' : '#38445c'),
                     color: (canModify && selectedRow !== null) ? '#fff' : '#5d6b83' },
            onClick: handleModify,
            disabled: !canModify || selectedRow === null,
            title: canModify ? 'Modify selected entry' : 'Supv+ security required'
          }, 'Modify'),
          React.createElement('button', {
            style: { padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                     letterSpacing: '.2px', fontFamily: 'inherit',
                     cursor: (canModify && selectedRow !== null) ? 'pointer' : 'not-allowed',
                     background: (canModify && selectedRow !== null) ? '#8a2018' : '#1b2230',
                     border: '1px solid ' + ((canModify && selectedRow !== null) ? '#8a2018' : '#38445c'),
                     color: (canModify && selectedRow !== null) ? '#fff' : '#5d6b83' },
            onClick: handleDelete,
            disabled: !canModify || selectedRow === null,
            title: canModify ? 'Delete selected entry' : 'Supv+ security required'
          }, 'Delete')
        )
      ),

      // Table
      React.createElement('div', { className: 'flex-1 overflow-auto' },
        React.createElement('table', { className: 'w-full text-sm' },
          React.createElement('thead', null,
            React.createElement('tr', {
              style: { background: '#141a26', color: '#9db0c8',
                       borderBottom: '1px solid #232c3d' }
            },
              React.createElement('th', { style: HEAD_TH }, 'Day'),
              React.createElement('th', { style: HEAD_TH }, 'Start Time'),
              React.createElement('th', { style: HEAD_TH }, 'End Time'),
              React.createElement('th', { style: HEAD_TH }, 'Value')
            )
          ),
          React.createElement('tbody', null,
            entries.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 4, style: { padding: '18px', textAlign: 'center', color: '#6f7f97', fontSize: '12px' } }, 'No schedule entries')
                )
              : entries.map(function(entry) {
                  const isSelected = selectedRow === entry.id;
                  const fault = isFaultEntry(entry);
                  // Selection reads as a tinted row rather than a saturated block, so
                  // a fault row stays legible when it is also the selected one.
                  let rowClass = 'cta-sched-row cursor-pointer';
                  let rowStyle = {
                    borderBottom: '1px solid #232c3d',
                    background: isSelected ? 'rgba(47,111,208,.22)'
                      : (fault ? 'rgba(194,34,34,.16)' : 'transparent')
                  };

                  return React.createElement('tr', {
                    key: entry.id,
                    className: rowClass,
                    style: rowStyle,
                    onClick: function() { setSelectedRow(entry.id); }
                  },
                    React.createElement('td', { style: { padding: '7px 12px', color: '#e8edf6', fontSize: '12.5px', fontWeight: 600 } },
                      fault
                        ? React.createElement('span', { className: 'flex items-center gap-1' },
                            React.createElement('span', { className: 'inline-block w-2 h-2 rounded-full bg-red-500', title: 'Fault: 24/7 schedule' }),
                            entry.day
                          )
                        : entry.day
                    ),
                    React.createElement('td', { style: { padding: '7px 12px', color: '#c3cfdd', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' } }, entry.startTime),
                    React.createElement('td', { style: { padding: '7px 12px', color: '#c3cfdd', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' } }, entry.endTime),
                    React.createElement('td', { style: { padding: '7px 12px' } },
                      React.createElement('span', {
                        style: { padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px',
                                 fontWeight: 800, letterSpacing: '.3px',
                                 background: entry.value === 'Active' ? 'rgba(63,143,90,.2)' : '#1b2230',
                                 border: '1px solid ' + (entry.value === 'Active' ? '#2f7a52' : '#38445c'),
                                 color: entry.value === 'Active' ? '#8ff0b5' : '#9db0c8' }
                      }, entry.value)
                    )
                  );
                })
          )
        )
      ),

      // Security notice if can't modify
      !canModify && React.createElement('div', {
        style: { padding: '8px 12px', background: '#18202e', borderTop: '1px solid #232c3d',
                 fontSize: '11px', color: '#ffd79a', lineHeight: 1.45 }
      }, '⚠ Schedule editing requires Supervisor (Supv) or higher security. For training: identify runtime waste (e.g. running at 1 AM on Sundays) and document the recommended fix.'),

      // Modals
      showInsertModal && renderModal('Insert Schedule Entry', confirmInsert, function() { setShowInsertModal(false); }),
      showModifyModal && renderModal('Modify Schedule Entry', confirmModify, function() { setShowModifyModal(false); })
    );
  }

  return WeeklyScheduleComponent;
})();

window.WeeklySchedule = WeeklySchedule;
