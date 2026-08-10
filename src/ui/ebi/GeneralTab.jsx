/* GeneralTab.jsx — EBI Point Detail General Tab
 * Displays point metadata as read-only fields in a dark-themed layout.
 * For analog points (AI/AO): name, address, type, units, range, COV increment, sensor offset
 * For binary points (BI/BO): name, address, type only — omits range, COV, sensor offset
 *
 * Props: { pointId } — BACnet address of the point
 * Reads metadata from window.PointRegistry.getMetadata(pointId)
 *
 * No import/export — exposes as window.EBIGeneralTab
 */

(function() {
  'use strict';

  const { useMemo } = React;

  /**
   * A single metadata field row: label on left, value on right.
   * Dark themed, read-only styling.
   */
  function MetadataField({ label, value }) {
    return React.createElement('div', {
      className: 'flex items-center py-2 px-4 border-b border-gray-700'
    },
      React.createElement('span', {
        className: 'text-gray-400 text-sm w-44 flex-shrink-0'
      }, label),
      React.createElement('span', {
        className: 'text-white text-sm font-mono bg-gray-800 px-3 py-1 rounded border border-gray-600 flex-1'
      }, value !== undefined && value !== null && value !== '' ? String(value) : '—')
    );
  }

  /**
   * EBIGeneralTab — General tab content for the EBI Point Detail view.
   * Shows point metadata as read-only labels in a structured layout.
   */
  function EBIGeneralTab({ pointId }) {
    // Fetch metadata from Point Registry
    const metadata = useMemo(function() {
      if (!pointId || !window.PointRegistry) return null;
      return window.PointRegistry.getMetadata(pointId);
    }, [pointId]);

    // No point found
    if (!metadata) {
      return React.createElement('div', {
        className: 'flex items-center justify-center h-full bg-gray-900 text-gray-400 p-8'
      },
        React.createElement('p', { className: 'text-sm' },
          pointId ? 'Point not found: ' + pointId : 'No point selected'
        )
      );
    }

    const isAnalog = metadata.type === 'AI' || metadata.type === 'AO';

    // Build the list of fields to display
    var fields = [
      { label: 'Name', value: metadata.name },
      { label: 'BACnet Address', value: metadata.address },
      { label: 'Point Type', value: metadata.type }
    ];

    // Analog-only fields
    if (isAnalog) {
      fields.push({ label: 'Engineering Units', value: metadata.units });
      fields.push({
        label: 'Range',
        value: metadata.min + ' – ' + metadata.max + (metadata.units ? ' ' + metadata.units : '')
      });
      fields.push({ label: 'COV Increment', value: metadata.covIncrement });
      fields.push({ label: 'Sensor Offset', value: metadata.sensorOffset });
    }

    return React.createElement('div', {
      className: 'bg-gray-900 h-full overflow-y-auto'
    },
      // Section header
      React.createElement('div', {
        className: 'px-4 py-3 border-b border-gray-700 bg-gray-850'
      },
        React.createElement('h3', {
          className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide'
        }, 'Point Configuration')
      ),
      // Metadata fields
      React.createElement('div', { className: 'py-2' },
        fields.map(function(field, index) {
          return React.createElement(MetadataField, {
            key: index,
            label: field.label,
            value: field.value
          });
        })
      ),
      // Subsystem info (always shown as supplementary)
      metadata.subsystem ? React.createElement('div', {
        className: 'px-4 py-3 mt-4 border-t border-gray-700'
      },
        React.createElement('span', {
          className: 'text-gray-500 text-xs uppercase tracking-wide'
        }, 'Subsystem: ' + metadata.subsystem)
      ) : null
    );
  }

  // Expose globally — no import/export
  window.EBIGeneralTab = EBIGeneralTab;

})();
