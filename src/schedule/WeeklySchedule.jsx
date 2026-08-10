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

  // Default schedule data for each AHU — currently the same weekday
  // 08:00–18:00 occupied pattern for both AHU-4-4 and AHU-23-1.
  function getDefaultSchedule(scheduleId) {
    return [
      { id: 1, day: 'Monday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active', isFault: false },
      { id: 2, day: 'Tuesday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active', isFault: false },
      { id: 3, day: 'Wednesday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active', isFault: false },
      { id: 4, day: 'Thursday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active', isFault: false },
      { id: 5, day: 'Friday', startTime: '08:00:00', endTime: '18:00:00', value: 'Active', isFault: false }
    ];
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
        React.createElement('div', { className: 'bg-gray-800 border border-gray-600 rounded p-4 w-80' },
          React.createElement('h3', { className: 'text-white font-bold mb-3' }, title),
          // Day selector
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Day of Week'),
            React.createElement('select', {
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.day,
              onChange: function(e) { setFormData(prev => ({ ...prev, day: e.target.value })); }
            },
              DAYS_OF_WEEK.map(d => React.createElement('option', { key: d, value: d }, d))
            )
          ),
          // Start Time
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Start Time (HH:MM:SS)'),
            React.createElement('input', {
              type: 'text',
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.startTime,
              onChange: function(e) { setFormData(prev => ({ ...prev, startTime: e.target.value })); }
            })
          ),
          // End Time
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'End Time (HH:MM:SS)'),
            React.createElement('input', {
              type: 'text',
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.endTime,
              onChange: function(e) { setFormData(prev => ({ ...prev, endTime: e.target.value })); }
            })
          ),
          // Value
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Value'),
            React.createElement('select', {
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
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
              className: 'px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-500',
              onClick: onCancel
            }, 'Cancel'),
            React.createElement('button', {
              className: 'px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500',
              onClick: onConfirm
            }, 'OK')
          )
        )
      );
    }

    return React.createElement('div', { className: 'flex flex-col h-full' },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between px-3 py-2 bg-gray-700 border-b border-gray-600' },
        React.createElement('h3', { className: 'text-white font-semibold text-sm' }, 'Weekly Schedule'),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            className: 'px-3 py-1 text-xs font-medium rounded ' +
              (canModify ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'),
            onClick: handleInsert,
            disabled: !canModify,
            title: canModify ? 'Insert new schedule entry' : 'Supv+ security required'
          }, 'Insert'),
          React.createElement('button', {
            className: 'px-3 py-1 text-xs font-medium rounded ' +
              (canModify && selectedRow !== null ? 'bg-yellow-600 text-white hover:bg-yellow-500 cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'),
            onClick: handleModify,
            disabled: !canModify || selectedRow === null,
            title: canModify ? 'Modify selected entry' : 'Supv+ security required'
          }, 'Modify'),
          React.createElement('button', {
            className: 'px-3 py-1 text-xs font-medium rounded ' +
              (canModify && selectedRow !== null ? 'bg-red-600 text-white hover:bg-red-500 cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'),
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
            React.createElement('tr', { className: 'bg-gray-800 text-gray-300 border-b border-gray-600' },
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Day'),
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Start Time'),
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'End Time'),
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Value')
            )
          ),
          React.createElement('tbody', null,
            entries.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 4, className: 'px-3 py-4 text-center text-gray-500' }, 'No schedule entries')
                )
              : entries.map(function(entry) {
                  const isSelected = selectedRow === entry.id;
                  const fault = isFaultEntry(entry);
                  let rowClass = 'border-b border-gray-700 cursor-pointer transition-colors ';
                  if (isSelected) {
                    rowClass += 'bg-blue-900 bg-opacity-50 ';
                  } else if (fault) {
                    rowClass += 'bg-red-900 bg-opacity-30 ';
                  } else {
                    rowClass += 'hover:bg-gray-750 hover:bg-opacity-50 ';
                  }

                  return React.createElement('tr', {
                    key: entry.id,
                    className: rowClass,
                    onClick: function() { setSelectedRow(entry.id); }
                  },
                    React.createElement('td', { className: 'px-3 py-2 text-white' },
                      fault
                        ? React.createElement('span', { className: 'flex items-center gap-1' },
                            React.createElement('span', { className: 'inline-block w-2 h-2 rounded-full bg-red-500', title: 'Fault: 24/7 schedule' }),
                            entry.day
                          )
                        : entry.day
                    ),
                    React.createElement('td', { className: 'px-3 py-2 text-gray-300 font-mono' }, entry.startTime),
                    React.createElement('td', { className: 'px-3 py-2 text-gray-300 font-mono' }, entry.endTime),
                    React.createElement('td', { className: 'px-3 py-2' },
                      React.createElement('span', {
                        className: 'px-2 py-0.5 rounded text-xs font-medium ' +
                          (entry.value === 'Active' ? 'bg-green-700 text-green-100' : 'bg-gray-600 text-gray-300')
                      }, entry.value)
                    )
                  );
                })
          )
        )
      ),

      // Security notice if can't modify
      !canModify && React.createElement('div', {
        className: 'px-3 py-2 bg-gray-800 border-t border-gray-600 text-xs text-yellow-400'
      }, '⚠ Schedule editing requires Supervisor (Supv) or higher security. For training: identify runtime waste (e.g. running at 1 AM on Sundays) and document the recommended fix.'),

      // Modals
      showInsertModal && renderModal('Insert Schedule Entry', confirmInsert, function() { setShowInsertModal(false); }),
      showModifyModal && renderModal('Modify Schedule Entry', confirmModify, function() { setShowModifyModal(false); })
    );
  }

  return WeeklyScheduleComponent;
})();

window.WeeklySchedule = WeeklySchedule;
