/**
 * ExceptionSchedule.jsx — Holiday/special-event schedule entries
 *
 * Displays a table of exception (holiday/special event) schedule entries.
 * Columns: Date, Description, Value (Override Active/Inactive)
 *
 * Pre-loaded with common holiday entries as examples.
 * Supv+ security required to add/remove entries (read from AuthContext).
 *
 * No import/export — exposes as window.ExceptionSchedule
 */

const ExceptionSchedule = (() => {
  const { useState, useContext } = React;

  // Default exception schedule entries (common holidays)
  function getDefaultExceptions(scheduleId) {
    return [
      { id: 1, date: '2026-01-01', description: "New Year's Day", value: 'Inactive' },
      { id: 2, date: '2026-01-20', description: 'Martin Luther King Jr. Day', value: 'Inactive' },
      { id: 3, date: '2026-02-16', description: "Presidents' Day", value: 'Inactive' },
      { id: 4, date: '2026-05-25', description: 'Memorial Day', value: 'Inactive' },
      { id: 5, date: '2026-07-04', description: 'Independence Day', value: 'Inactive' },
      { id: 6, date: '2026-09-07', description: 'Labor Day', value: 'Inactive' },
      { id: 7, date: '2026-11-26', description: 'Thanksgiving Day', value: 'Inactive' },
      { id: 8, date: '2026-12-25', description: 'Christmas Day', value: 'Inactive' }
    ];
  }

  function ExceptionScheduleComponent({ scheduleId }) {
    const auth = useContext(window.AuthContext);
    const canModify = auth && auth.canModifySchedules ? auth.canModifySchedules() : false;

    const [entries, setEntries] = useState(() => getDefaultExceptions(scheduleId || 'AHU-4-4'));
    const [selectedRow, setSelectedRow] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({
      date: '2026-01-01',
      description: '',
      value: 'Inactive'
    });

    // Reset entries when scheduleId changes
    React.useEffect(() => {
      setEntries(getDefaultExceptions(scheduleId || 'AHU-4-4'));
      setSelectedRow(null);
    }, [scheduleId]);

    // Generate next ID
    function getNextId() {
      return entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;
    }

    // Add new exception entry
    function handleAdd() {
      if (!canModify) return;
      setFormData({ date: '2026-01-01', description: '', value: 'Inactive' });
      setShowAddModal(true);
    }

    function confirmAdd() {
      if (!formData.description.trim()) return;
      const newEntry = {
        id: getNextId(),
        date: formData.date,
        description: formData.description.trim(),
        value: formData.value
      };
      setEntries(prev => [...prev, newEntry].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAddModal(false);
    }

    // Delete selected entry
    function handleDelete() {
      if (!canModify || selectedRow === null) return;
      setEntries(prev => prev.filter(e => e.id !== selectedRow));
      setSelectedRow(null);
    }

    // Format date for display
    function formatDate(dateStr) {
      try {
        const parts = dateStr.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
      } catch (e) {
        return dateStr;
      }
    }

    // Modal for adding exception
    function renderAddModal() {
      return React.createElement('div', {
        className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      },
        React.createElement('div', { className: 'bg-gray-800 border border-gray-600 rounded p-4 w-80' },
          React.createElement('h3', { className: 'text-white font-bold mb-3' }, 'Add Exception Entry'),
          // Date
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Date'),
            React.createElement('input', {
              type: 'date',
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.date,
              onChange: function(e) { setFormData(prev => ({ ...prev, date: e.target.value })); }
            })
          ),
          // Description
          React.createElement('div', { className: 'mb-2' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Description'),
            React.createElement('input', {
              type: 'text',
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.description,
              placeholder: 'e.g., Building Maintenance Day',
              onChange: function(e) { setFormData(prev => ({ ...prev, description: e.target.value })); }
            })
          ),
          // Value
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'text-gray-300 text-sm block mb-1' }, 'Value (Override)'),
            React.createElement('select', {
              className: 'w-full bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 text-sm',
              value: formData.value,
              onChange: function(e) { setFormData(prev => ({ ...prev, value: e.target.value })); }
            },
              React.createElement('option', { value: 'Active' }, 'Override Active'),
              React.createElement('option', { value: 'Inactive' }, 'Override Inactive')
            )
          ),
          // Buttons
          React.createElement('div', { className: 'flex justify-end gap-2' },
            React.createElement('button', {
              className: 'px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-500',
              onClick: function() { setShowAddModal(false); }
            }, 'Cancel'),
            React.createElement('button', {
              className: 'px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500',
              onClick: confirmAdd
            }, 'Add')
          )
        )
      );
    }

    return React.createElement('div', { className: 'flex flex-col h-full' },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between px-3 py-2 bg-gray-700 border-b border-gray-600' },
        React.createElement('h3', { className: 'text-white font-semibold text-sm' }, 'Exception Schedule (Holidays / Special Events)'),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            className: 'px-3 py-1 text-xs font-medium rounded ' +
              (canModify ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'),
            onClick: handleAdd,
            disabled: !canModify,
            title: canModify ? 'Add exception entry' : 'Supv+ security required'
          }, 'Add'),
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
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Date'),
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Description'),
              React.createElement('th', { className: 'px-3 py-2 text-left font-medium' }, 'Value')
            )
          ),
          React.createElement('tbody', null,
            entries.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 3, className: 'px-3 py-4 text-center text-gray-500' }, 'No exception entries')
                )
              : entries.map(function(entry) {
                  const isSelected = selectedRow === entry.id;
                  let rowClass = 'border-b border-gray-700 cursor-pointer transition-colors ';
                  if (isSelected) {
                    rowClass += 'bg-blue-900 bg-opacity-50 ';
                  } else {
                    rowClass += 'hover:bg-gray-750 hover:bg-opacity-50 ';
                  }

                  return React.createElement('tr', {
                    key: entry.id,
                    className: rowClass,
                    onClick: function() { setSelectedRow(entry.id); }
                  },
                    React.createElement('td', { className: 'px-3 py-2 text-gray-300 font-mono text-xs' }, formatDate(entry.date)),
                    React.createElement('td', { className: 'px-3 py-2 text-white' }, entry.description),
                    React.createElement('td', { className: 'px-3 py-2' },
                      React.createElement('span', {
                        className: 'px-2 py-0.5 rounded text-xs font-medium ' +
                          (entry.value === 'Active' ? 'bg-green-700 text-green-100' : 'bg-orange-700 text-orange-100')
                      }, entry.value === 'Active' ? 'Override Active' : 'Override Inactive')
                    )
                  );
                })
          )
        )
      ),

      // Security notice if can't modify
      !canModify && React.createElement('div', {
        className: 'px-3 py-2 bg-gray-800 border-t border-gray-600 text-xs text-yellow-400'
      }, '⚠ Schedule editing requires Supervisor (Supv) or higher security. For training: use the schedules shown for analysis only — identify what should change and why, then document as a recommendation.'),

      // Add modal
      showAddModal && renderAddModal()
    );
  }

  return ExceptionScheduleComponent;
})();

window.ExceptionSchedule = ExceptionSchedule;
