/**
 * CSVExporter.js — Generates UTF-8 CSV with BMS point + weather data
 * and triggers browser download.
 *
 * CSV columns: Date, Time, Hour_Number, Month, OA_Temp_F, HDH, CDH, [sensor name], [unit]
 *
 * Reads:
 *   - Point data from window.PointRegistry
 *   - Weather from window.TMY3Projector
 *   - HDH/CDH from window.HDHCDHCounter (base 65°F)
 *
 * Called from the EBI History tab's "Export to CSV" button.
 *
 * No import/export — exposed as window.CSVExporter
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Simulation base date: May 1, 2026 00:00 EDT */
  var BASE_DATE = new Date('2026-05-01T00:00:00-04:00');
  var MS_PER_HOUR = 3600000;
  var BASE_TEMP = 65; // HDH/CDH base temperature (°F)

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Get the Date object for a given simulation row (1-based).
   */
  function rowToDate(row) {
    return new Date(BASE_DATE.getTime() + (row - 1) * MS_PER_HOUR);
  }

  /**
   * Format date as MM/DD/YYYY
   */
  function formatDate(date) {
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    var year = date.getFullYear().toString();
    return month + '/' + day + '/' + year;
  }

  /**
   * Format time as HH:MM
   */
  function formatTime(date) {
    var hours = date.getHours().toString().padStart(2, '0');
    var mins = date.getMinutes().toString().padStart(2, '0');
    return hours + ':' + mins;
  }

  /**
   * Format a date as YYYYMMDD for filenames.
   */
  function formatFilenameDate(date) {
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    var year = date.getFullYear().toString();
    return year + month + day;
  }

  /**
   * Sanitize a point name for use in a filename.
   * Replace spaces and special characters with underscores.
   */
  function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
  }

  /**
   * Escape a CSV field value. Wraps in quotes if it contains commas, quotes, or newlines.
   */
  function escapeCSV(value) {
    var str = String(value);
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Average an array of numbers over the given factor (interval grouping).
   */
  function averageRows(data, startIdx, count) {
    var sum = 0;
    var n = 0;
    for (var i = startIdx; i < startIdx + count && i < data.length; i++) {
      if (typeof data[i] === 'number' && !isNaN(data[i])) {
        sum += data[i];
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  }

  // ─── Core CSV Generation ────────────────────────────────────────────────────

  /**
   * Generate CSV content string from point data, weather, and HDH/CDH.
   *
   * @param {Object} point - Point object from PointRegistry (with .name, .data, .units)
   * @param {number} startRow - Start row (1-based, inclusive)
   * @param {number} endRow - End row (1-based, inclusive)
   * @param {number} intervalFactor - Number of rows to average per output row (1, 8, or 24)
   * @returns {string|null} CSV content string, or null if no data
   */
  function generateCSV(point, startRow, endRow, intervalFactor) {
    if (!point || !point.data || point.data.length === 0) {
      return null;
    }

    // Clamp rows to valid range
    startRow = Math.max(1, startRow || 1);
    endRow = Math.min(point.data.length, endRow || point.data.length);
    intervalFactor = Math.max(1, intervalFactor || 1);

    if (startRow > endRow) return null;

    var sensorName = point.name || 'Sensor';
    var sensorUnits = point.units || '';

    // Header row matching Requirement 25.1
    var header = [
      'Date',
      'Time',
      'Hour_Number',
      'Month',
      'OA_Temp_F',
      'HDH',
      'CDH',
      escapeCSV(sensorName),
      escapeCSV(sensorUnits)
    ].join(',');

    var rows = [header];

    // Running HDH/CDH accumulators for the exported period
    var cumulativeHDH = 0;
    var cumulativeCDH = 0;

    // Generate rows stepped by intervalFactor
    for (var row = startRow; row <= endRow; row += intervalFactor) {
      var blockEnd = Math.min(row + intervalFactor - 1, endRow);
      var blockSize = blockEnd - row + 1;

      // Timestamp for this row (use start of block)
      var date = rowToDate(row);

      // Date, Time columns
      var dateStr = formatDate(date);
      var timeStr = formatTime(date);

      // Hour_Number: hours elapsed since start of simulation period
      var hourNumber = row - 1;

      // Month (1-based)
      var month = date.getMonth() + 1;

      // OA_Temp_F from TMY3Projector — average over the interval block
      var oaTemp = null;
      if (window.TMY3Projector) {
        var oaTempSum = 0;
        var oaTempCount = 0;
        for (var r = row; r <= blockEnd; r++) {
          var weather = window.TMY3Projector.getWeatherForRow(r);
          if (weather && typeof weather.dryBulb === 'number') {
            oaTempSum += weather.dryBulb;
            oaTempCount++;
          }
        }
        if (oaTempCount > 0) {
          oaTemp = oaTempSum / oaTempCount;
        }
      }

      // HDH and CDH — accumulate from weather data over this block
      for (var r = row; r <= blockEnd; r++) {
        var weatherRow = window.TMY3Projector ? window.TMY3Projector.getWeatherForRow(r) : null;
        if (weatherRow && typeof weatherRow.dryBulb === 'number') {
          var temp = weatherRow.dryBulb;
          if (temp < BASE_TEMP) {
            cumulativeHDH += (BASE_TEMP - temp);
          } else if (temp > BASE_TEMP) {
            cumulativeCDH += (temp - BASE_TEMP);
          }
        }
      }

      // Sensor value — average over interval block
      var sensorValue = averageRows(point.data, row - 1, blockSize);

      // Build CSV row
      var csvRow = [
        escapeCSV(dateStr),
        escapeCSV(timeStr),
        hourNumber,
        month,
        oaTemp !== null ? oaTemp.toFixed(1) : '',
        cumulativeHDH.toFixed(1),
        cumulativeCDH.toFixed(1),
        sensorValue !== null ? sensorValue.toFixed(2) : '',
        escapeCSV(sensorUnits)
      ].join(',');

      rows.push(csvRow);
    }

    return rows.join('\n');
  }

  // ─── Browser Download Trigger ───────────────────────────────────────────────

  /**
   * Trigger a browser file download for the given CSV content.
   *
   * @param {string} csvContent - UTF-8 CSV string
   * @param {string} pointName - Name of the point (used in filename)
   * @param {Date} startDate - Start date of the exported period
   * @param {Date} endDate - End date of the exported period
   */
  function downloadCSV(csvContent, pointName, startDate, endDate) {
    var startStr = formatFilenameDate(startDate);
    var endStr = formatFilenameDate(endDate);
    var safeName = sanitizeFilename(pointName);

    var filename = safeName + '_' + startStr + '_' + endStr + '.csv';

    // Create UTF-8 Blob with BOM for Excel compatibility
    var BOM = '\uFEFF';
    var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(function () {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ─── Public API (called by HistoryTab) ──────────────────────────────────────

  /**
   * Generate CSV and trigger download.
   *
   * Called from EBI History tab's Export button:
   *   window.CSVExporter.generate(pointData, startRow, endRow, intervalFactor)
   *
   * @param {Object} point - Point object with .name, .data, .units, .address
   * @param {number} startRow - Start row (1-based)
   * @param {number} endRow - End row (1-based)
   * @param {number} intervalFactor - Averaging interval (1, 8, or 24)
   */
  function generate(point, startRow, endRow, intervalFactor) {
    // Validate inputs
    if (!point || !point.data || point.data.length === 0) {
      showNoDataMessage();
      return;
    }

    startRow = Math.max(1, startRow || 1);
    endRow = Math.min(point.data.length, endRow || point.data.length);

    if (startRow > endRow) {
      showNoDataMessage();
      return;
    }

    // Check if there's any actual data in the range
    var hasData = false;
    for (var i = startRow - 1; i < endRow && i < point.data.length; i++) {
      if (typeof point.data[i] === 'number' && !isNaN(point.data[i])) {
        hasData = true;
        break;
      }
    }

    if (!hasData) {
      showNoDataMessage();
      return;
    }

    // Generate CSV content
    var csvContent = generateCSV(point, startRow, endRow, intervalFactor);

    if (!csvContent) {
      showNoDataMessage();
      return;
    }

    // Compute start and end dates for filename
    var startDate = rowToDate(startRow);
    var endDate = rowToDate(endRow);
    var pointName = point.name || 'export';

    // Trigger download
    downloadCSV(csvContent, pointName, startDate, endDate);
  }

  /**
   * Show a "no data available" message to the user.
   * Uses a temporary notification overlay.
   */
  function showNoDataMessage() {
    // Create a temporary toast notification
    var toast = document.createElement('div');
    toast.textContent = 'No data available for export';
    toast.style.cssText = [
      'position: fixed',
      'bottom: 80px',
      'left: 50%',
      'transform: translateX(-50%)',
      'background: #1f2937',
      'color: #f87171',
      'padding: 12px 24px',
      'border-radius: 8px',
      'border: 1px solid #374151',
      'font-size: 14px',
      'z-index: 9999',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.5)',
      'transition: opacity 0.3s ease'
    ].join(';');

    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.CSVExporter = {
    generate: generate,
    generateCSV: generateCSV,
    download: downloadCSV,
    // Exposed for testing
    _rowToDate: rowToDate,
    _formatDate: formatDate,
    _formatTime: formatTime,
    _formatFilenameDate: formatFilenameDate,
    _sanitizeFilename: sanitizeFilename,
    _escapeCSV: escapeCSV
  };

})();
