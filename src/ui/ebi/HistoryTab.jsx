/* HistoryTab.jsx — EBI Point Detail History Tab
 * Canvas 2D trend chart with black background and cyan area fill.
 * Period/interval dropdowns, multi-series overlay (up to 4), data table,
 * scroll/zoom via mouse wheel + drag, and Export to CSV button.
 *
 * Props: { pointId } — BACnet address of the point
 * Reads data from window.PointRegistry (point's full data array + metadata)
 * Gets current simulation time from window.SimulationEngine.getCurrentTimestamp()
 *
 * No import/export — exposes as window.EBIHistoryTab
 */

(function() {
  'use strict';

  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Base date: May 1, 2026 00:00 EDT */
  const BASE_DATE = new Date('2026-05-01T00:00:00-04:00');
  const MS_PER_HOUR = 3600000;
  const TOTAL_ROWS = 1017;

  /** Series colors for multi-overlay */
  const SERIES_COLORS = ['#00BFFF', '#00FF00', '#FFFF00', '#FF00FF'];
  const SERIES_NAMES = ['Primary', 'Series 2', 'Series 3', 'Series 4'];

  /** Period options */
  const PERIOD_OPTIONS = [
    { label: '2 Weeks', hours: 14 * 24 },
    { label: '4 Weeks', hours: 28 * 24 },
    { label: '3 Months', hours: 90 * 24 },
    { label: 'Custom', hours: TOTAL_ROWS }
  ];

  /** Interval options (averaging) */
  const INTERVAL_OPTIONS = [
    { label: '6 min avg', factor: 1 },
    { label: '1 hr avg', factor: 1 },
    { label: '8 hr avg', factor: 8 },
    { label: '1 day avg', factor: 24 }
  ];

  // ─── Utility Functions ──────────────────────────────────────────────────────

  /** Get the timestamp for a given row index (1-based) */
  function rowToTimestamp(row) {
    return new Date(BASE_DATE.getTime() + (row - 1) * MS_PER_HOUR);
  }

  /** Format a date as a readable string */
  function formatTimestamp(date) {
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    var hours = date.getHours().toString().padStart(2, '0');
    var mins = date.getMinutes().toString().padStart(2, '0');
    return month + '/' + day + ' ' + hours + ':' + mins;
  }

  /** Format a short date for axis labels */
  function formatShortDate(date) {
    var month = (date.getMonth() + 1).toString();
    var day = date.getDate().toString();
    return month + '/' + day;
  }

  /** Average data points over a given factor (number of rows per average) */
  function averageData(data, factor) {
    if (factor <= 1) return data.slice();
    var result = [];
    for (var i = 0; i < data.length; i += factor) {
      var sum = 0;
      var count = 0;
      for (var j = i; j < Math.min(i + factor, data.length); j++) {
        if (typeof data[j] === 'number' && !isNaN(data[j])) {
          sum += data[j];
          count++;
        }
      }
      result.push(count > 0 ? sum / count : 0);
    }
    return result;
  }

  // ─── Canvas Chart Drawing ───────────────────────────────────────────────────

  function drawChart(canvas, seriesDataList, viewport, yMin, yMax) {
    var ctx = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;

    // Chart margins
    var marginLeft = 60;
    var marginRight = 20;
    var marginTop = 20;
    var marginBottom = 40;
    var chartWidth = width - marginLeft - marginRight;
    var chartHeight = height - marginTop - marginBottom;

    // Clear to black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (!seriesDataList || seriesDataList.length === 0 || chartWidth <= 0 || chartHeight <= 0) return;

    var startRow = viewport.startRow;
    var endRow = viewport.endRow;
    var visibleCount = endRow - startRow;

    if (visibleCount <= 0) return;

    // Y-axis range
    var yRange = yMax - yMin;
    if (yRange === 0) yRange = 1;

    // ─── Draw grid lines ────────────────────────────────────────────
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5;

    // Horizontal grid lines (Y-axis)
    var yTicks = 5;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'right';

    for (var i = 0; i <= yTicks; i++) {
      var yVal = yMin + (yRange * i / yTicks);
      var yPos = marginTop + chartHeight - (chartHeight * i / yTicks);

      ctx.beginPath();
      ctx.moveTo(marginLeft, yPos);
      ctx.lineTo(marginLeft + chartWidth, yPos);
      ctx.stroke();

      // Y-axis label
      ctx.fillText(yVal.toFixed(1), marginLeft - 8, yPos + 3);
    }

    // X-axis time labels
    var xTicks = Math.min(6, visibleCount);
    ctx.textAlign = 'center';
    for (var i = 0; i <= xTicks; i++) {
      var row = startRow + Math.floor(visibleCount * i / xTicks);
      var xPos = marginLeft + (chartWidth * i / xTicks);
      var ts = rowToTimestamp(row);

      ctx.beginPath();
      ctx.moveTo(xPos, marginTop);
      ctx.lineTo(xPos, marginTop + chartHeight);
      ctx.stroke();

      ctx.fillStyle = '#888888';
      ctx.fillText(formatShortDate(ts), xPos, marginTop + chartHeight + 15);
    }

    // ─── Draw each series ───────────────────────────────────────────
    for (var s = 0; s < seriesDataList.length; s++) {
      var seriesData = seriesDataList[s];
      if (!seriesData || seriesData.length === 0) continue;

      var color = SERIES_COLORS[s] || SERIES_COLORS[0];

      // Map data points to canvas coordinates
      var points = [];
      for (var i = 0; i < visibleCount && (startRow - 1 + i) < seriesData.length; i++) {
        var dataIdx = startRow - 1 + i;
        var val = seriesData[dataIdx];
        if (typeof val !== 'number' || isNaN(val)) continue;

        var x = marginLeft + (chartWidth * i / Math.max(visibleCount - 1, 1));
        var y = marginTop + chartHeight - (chartHeight * (val - yMin) / yRange);
        points.push({ x: x, y: y });
      }

      if (points.length < 2) continue;

      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(points[0].x, marginTop + chartHeight); // bottom-left
      for (var i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[points.length - 1].x, marginTop + chartHeight); // bottom-right
      ctx.closePath();

      ctx.fillStyle = color + '40'; // semi-transparent fill
      ctx.fill();

      // Draw line on top
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ─── Draw axis borders ──────────────────────────────────────────
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeft, marginTop);
    ctx.lineTo(marginLeft, marginTop + chartHeight);
    ctx.lineTo(marginLeft + chartWidth, marginTop + chartHeight);
    ctx.stroke();
  }

  // ─── Dropdown Component ─────────────────────────────────────────────────────

  function Dropdown({ label, options, value, onChange }) {
    return React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('label', {
        className: 'text-gray-400 text-xs uppercase tracking-wide'
      }, label),
      React.createElement('select', {
        className: 'bg-gray-800 text-white text-sm border border-gray-600 rounded px-2 py-1 focus:border-cyan-500 focus:outline-none',
        value: value,
        onChange: function(e) { onChange(e.target.value); }
      },
        options.map(function(opt, idx) {
          return React.createElement('option', { key: idx, value: idx }, opt.label);
        })
      )
    );
  }

  // ─── Add Sensor Modal ───────────────────────────────────────────────────────

  function AddSensorModal({ onSelect, onClose, existingIds }) {
    var allPoints = window.PointRegistry ? window.PointRegistry.getAll() : [];
    var available = allPoints.filter(function(p) {
      return existingIds.indexOf(p.address) === -1 && p.data && p.data.length > 0;
    });

    return React.createElement('div', {
      className: 'absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-80 z-50 flex items-center justify-center'
    },
      React.createElement('div', {
        className: 'bg-gray-800 border border-gray-600 rounded-lg p-4 w-80 max-h-96 overflow-y-auto'
      },
        React.createElement('div', { className: 'flex justify-between items-center mb-3' },
          React.createElement('h4', { className: 'text-white text-sm font-semibold' }, 'Add Sensor Overlay'),
          React.createElement('button', {
            className: 'text-gray-400 hover:text-white text-lg',
            onClick: onClose
          }, '×')
        ),
        available.length === 0
          ? React.createElement('p', { className: 'text-gray-500 text-sm' }, 'No additional sensors available')
          : React.createElement('div', { className: 'space-y-1' },
              available.map(function(point) {
                return React.createElement('button', {
                  key: point.address,
                  className: 'w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded',
                  onClick: function() { onSelect(point.address); }
                }, point.name + ' (' + point.address + ')');
              })
            )
      )
    );
  }

  // ─── Main HistoryTab Component ──────────────────────────────────────────────

  function EBIHistoryTab({ pointId }) {
    // State
    var _useState = useState(0);
    var periodIdx = _useState[0], setPeriodIdx = _useState[1];

    var _useState2 = useState(1);
    var intervalIdx = _useState2[0], setIntervalIdx = _useState2[1];

    var _useState3 = useState([]);
    var overlaySeries = _useState3[0], setOverlaySeries = _useState3[1]; // additional pointIds

    var _useState4 = useState(null);
    var viewport = _useState4[0], setViewport = _useState4[1];

    var _useState5 = useState(false);
    var showAddSensor = _useState5[0], setShowAddSensor = _useState5[1];

    var canvasRef = useRef(null);
    var containerRef = useRef(null);
    var isDragging = useRef(false);
    var dragStartX = useRef(0);
    var dragStartViewport = useRef(null);

    // ─── Get point data ───────────────────────────────────────────────
    var pointData = useMemo(function() {
      if (!pointId || !window.PointRegistry) return null;
      var point = window.PointRegistry.points.get(pointId);
      if (!point) return null;
      return point;
    }, [pointId]);

    // ─── Determine period range ───────────────────────────────────────
    var periodHours = PERIOD_OPTIONS[periodIdx] ? PERIOD_OPTIONS[periodIdx].hours : TOTAL_ROWS;
    var intervalFactor = INTERVAL_OPTIONS[intervalIdx] ? INTERVAL_OPTIONS[intervalIdx].factor : 1;

    // ─── Initialize viewport ──────────────────────────────────────────
    useEffect(function() {
      var totalAvailable = pointData && pointData.data ? pointData.data.length : TOTAL_ROWS;
      var visibleRows = Math.min(periodHours, totalAvailable);
      setViewport({ startRow: 1, endRow: Math.min(visibleRows, totalAvailable) });
    }, [periodIdx, pointData]);

    // ─── Build series data arrays ─────────────────────────────────────
    var seriesDataArrays = useMemo(function() {
      var result = [];

      // Primary series
      if (pointData && pointData.data && pointData.data.length > 0) {
        result.push(averageData(pointData.data, intervalFactor));
      }

      // Overlay series
      overlaySeries.forEach(function(overlayId) {
        var overlayPoint = window.PointRegistry ? window.PointRegistry.points.get(overlayId) : null;
        if (overlayPoint && overlayPoint.data && overlayPoint.data.length > 0) {
          result.push(averageData(overlayPoint.data, intervalFactor));
        }
      });

      return result;
    }, [pointData, overlaySeries, intervalFactor]);

    // ─── Compute Y range from all visible series ──────────────────────
    var yRange = useMemo(function() {
      if (!pointData) return { min: 0, max: 100 };

      var min = pointData.min !== undefined ? pointData.min : 0;
      var max = pointData.max !== undefined ? pointData.max : 100;

      // Also consider overlay points' ranges
      overlaySeries.forEach(function(overlayId) {
        var meta = window.PointRegistry ? window.PointRegistry.getMetadata(overlayId) : null;
        if (meta) {
          if (meta.min !== undefined && meta.min < min) min = meta.min;
          if (meta.max !== undefined && meta.max > max) max = meta.max;
        }
      });

      return { min: min, max: max };
    }, [pointData, overlaySeries]);

    // ─── Draw chart on canvas ─────────────────────────────────────────
    useEffect(function() {
      if (!canvasRef.current || !viewport) return;

      var canvas = canvasRef.current;
      // Set canvas size to match container
      var container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = 280;
      }

      drawChart(canvas, seriesDataArrays, viewport, yRange.min, yRange.max);
    }, [seriesDataArrays, viewport, yRange]);

    // ─── Scroll/zoom handlers ─────────────────────────────────────────
    var handleWheel = useCallback(function(e) {
      e.preventDefault();
      if (!viewport || !pointData || !pointData.data) return;

      var totalRows = pointData.data.length;
      var currentSpan = viewport.endRow - viewport.startRow;
      var zoomFactor = e.deltaY > 0 ? 1.2 : 0.8; // scroll down = zoom out, up = zoom in
      var newSpan = Math.max(10, Math.min(totalRows, Math.round(currentSpan * zoomFactor)));

      // Keep center point
      var center = (viewport.startRow + viewport.endRow) / 2;
      var newStart = Math.max(1, Math.round(center - newSpan / 2));
      var newEnd = Math.min(totalRows, newStart + newSpan);
      newStart = Math.max(1, newEnd - newSpan);

      setViewport({ startRow: newStart, endRow: newEnd });
    }, [viewport, pointData]);

    var handleMouseDown = useCallback(function(e) {
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartViewport.current = viewport;
    }, [viewport]);

    var handleMouseMove = useCallback(function(e) {
      if (!isDragging.current || !dragStartViewport.current || !pointData || !pointData.data) return;

      var dx = e.clientX - dragStartX.current;
      var canvas = canvasRef.current;
      if (!canvas) return;

      var chartWidth = canvas.width - 80; // approximate margins
      var span = dragStartViewport.current.endRow - dragStartViewport.current.startRow;
      var rowShift = Math.round(-dx * span / chartWidth);

      var totalRows = pointData.data.length;
      var newStart = Math.max(1, Math.min(totalRows - span, dragStartViewport.current.startRow + rowShift));
      var newEnd = newStart + span;

      setViewport({ startRow: newStart, endRow: Math.min(newEnd, totalRows) });
    }, [pointData]);

    var handleMouseUp = useCallback(function() {
      isDragging.current = false;
      dragStartViewport.current = null;
    }, []);

    // ─── Add sensor handler ───────────────────────────────────────────
    var handleAddSensor = useCallback(function(sensorId) {
      if (overlaySeries.length < 3) { // max 4 total (1 primary + 3 overlays)
        setOverlaySeries(overlaySeries.concat([sensorId]));
      }
      setShowAddSensor(false);
    }, [overlaySeries]);

    // ─── Export handler ───────────────────────────────────────────────
    var handleExport = useCallback(function() {
      if (window.CSVExporter && pointData && viewport) {
        window.CSVExporter.generate(pointData, viewport.startRow, viewport.endRow, intervalFactor);
      } else {
        // Minimal fallback: generate a simple CSV download
        if (!pointData || !pointData.data) return;
        var rows = ['Timestamp,Value,' + (pointData.units || 'Units')];
        var start = viewport ? viewport.startRow : 1;
        var end = viewport ? viewport.endRow : pointData.data.length;
        for (var i = end - 1; i >= start - 1 && i >= 0; i--) {
          var ts = rowToTimestamp(i + 1);
          rows.push(formatTimestamp(ts) + ',' + (pointData.data[i] !== undefined ? pointData.data[i].toFixed(2) : '') + ',' + (pointData.units || ''));
        }
        var csvContent = rows.join('\n');
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = (pointData.name || 'history') + '_export.csv';
        link.click();
        URL.revokeObjectURL(url);
      }
    }, [pointData, viewport, intervalFactor]);

    // ─── Build data table rows (newest first — Property 10) ───────────
    var tableRows = useMemo(function() {
      if (!pointData || !pointData.data || !viewport) return [];

      var rows = [];
      var start = Math.max(0, viewport.startRow - 1);
      var end = Math.min(pointData.data.length, viewport.endRow);

      for (var i = start; i < end; i++) {
        rows.push({
          timestamp: rowToTimestamp(i + 1),
          value: pointData.data[i],
          units: pointData.units || ''
        });
      }

      // Sort descending by timestamp (newest first)
      rows.sort(function(a, b) { return b.timestamp.getTime() - a.timestamp.getTime(); });

      return rows;
    }, [pointData, viewport]);

    // ─── Empty state ──────────────────────────────────────────────────
    if (!pointData || !pointData.data || pointData.data.length === 0) {
      return React.createElement('div', {
        className: 'bg-black h-full flex flex-col items-center justify-center p-8'
      },
        React.createElement('div', {
          className: 'w-full h-64 border border-gray-700 rounded flex items-center justify-center',
          style: { backgroundColor: '#000000' }
        },
          React.createElement('p', {
            className: 'text-gray-500 text-sm'
          }, 'No data available')
        )
      );
    }

    // ─── Series legend ────────────────────────────────────────────────
    var allSeriesIds = [pointId].concat(overlaySeries);

    // ─── Render ───────────────────────────────────────────────────────
    return React.createElement('div', {
      className: 'bg-gray-900 h-full overflow-y-auto flex flex-col',
      ref: containerRef
    },
      // ─── Toolbar: Period, Interval, Add sensor, Export ────────────
      React.createElement('div', {
        className: 'flex items-center gap-4 px-4 py-2 border-b border-gray-700 flex-wrap'
      },
        React.createElement(Dropdown, {
          label: 'Period',
          options: PERIOD_OPTIONS,
          value: periodIdx,
          onChange: function(v) { setPeriodIdx(parseInt(v, 10)); }
        }),
        React.createElement(Dropdown, {
          label: 'Interval',
          options: INTERVAL_OPTIONS,
          value: intervalIdx,
          onChange: function(v) { setIntervalIdx(parseInt(v, 10)); }
        }),
        // Add sensor button (only if < 4 total series)
        allSeriesIds.length < 4 ? React.createElement('button', {
          className: 'bg-gray-700 hover:bg-gray-600 text-cyan-400 text-xs px-3 py-1 rounded border border-gray-600',
          onClick: function() { setShowAddSensor(true); }
        }, '+ Add sensor') : null,
        // Export button
        React.createElement('button', {
          className: 'ml-auto bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded border border-gray-600',
          onClick: handleExport
        }, 'Export to CSV')
      ),

      // ─── Series legend ────────────────────────────────────────────
      allSeriesIds.length > 1 ? React.createElement('div', {
        className: 'flex items-center gap-4 px-4 py-1 border-b border-gray-800'
      },
        allSeriesIds.map(function(id, idx) {
          var meta = window.PointRegistry ? window.PointRegistry.getMetadata(id) : null;
          var name = meta ? meta.name : id;
          return React.createElement('div', {
            key: id,
            className: 'flex items-center gap-1'
          },
            React.createElement('span', {
              className: 'inline-block w-3 h-3 rounded-sm',
              style: { backgroundColor: SERIES_COLORS[idx] }
            }),
            React.createElement('span', {
              className: 'text-xs text-gray-400'
            }, name)
          );
        })
      ) : null,

      // ─── Canvas chart ─────────────────────────────────────────────
      React.createElement('div', {
        className: 'relative px-4 py-2',
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseUp,
        style: { cursor: isDragging.current ? 'grabbing' : 'grab' }
      },
        React.createElement('canvas', {
          ref: canvasRef,
          className: 'w-full rounded border border-gray-700',
          style: { height: '280px', backgroundColor: '#000000' }
        }),
        // Add Sensor modal
        showAddSensor ? React.createElement(AddSensorModal, {
          onSelect: handleAddSensor,
          onClose: function() { setShowAddSensor(false); },
          existingIds: allSeriesIds
        }) : null
      ),

      // ─── Data table ───────────────────────────────────────────────
      React.createElement('div', {
        className: 'flex-1 overflow-y-auto px-4 py-2'
      },
        React.createElement('table', {
          className: 'w-full text-sm border-collapse'
        },
          React.createElement('thead', null,
            React.createElement('tr', {
              className: 'border-b border-gray-700'
            },
              React.createElement('th', {
                className: 'text-left text-gray-400 text-xs uppercase py-2 px-2'
              }, 'Timestamp'),
              React.createElement('th', {
                className: 'text-right text-gray-400 text-xs uppercase py-2 px-2'
              }, 'Value'),
              React.createElement('th', {
                className: 'text-left text-gray-400 text-xs uppercase py-2 px-2'
              }, 'Units')
            )
          ),
          React.createElement('tbody', null,
            tableRows.slice(0, 200).map(function(row, idx) {
              return React.createElement('tr', {
                key: idx,
                className: 'border-b border-gray-800 hover:bg-gray-800'
              },
                React.createElement('td', {
                  className: 'text-gray-300 text-xs py-1 px-2 font-mono'
                }, formatTimestamp(row.timestamp)),
                React.createElement('td', {
                  className: 'text-white text-xs py-1 px-2 text-right font-mono'
                }, typeof row.value === 'number' ? row.value.toFixed(2) : '—'),
                React.createElement('td', {
                  className: 'text-gray-400 text-xs py-1 px-2'
                }, row.units)
              );
            })
          )
        ),
        tableRows.length === 0 ? React.createElement('p', {
          className: 'text-gray-500 text-sm text-center py-4'
        }, 'No data for selected period') : null
      )
    );
  }

  // Expose globally — no import/export
  window.EBIHistoryTab = EBIHistoryTab;

})();
