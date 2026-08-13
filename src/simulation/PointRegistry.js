/**
 * PointRegistry.js — Reactive point store for the BMS Simulator
 * 
 * Holds all BMS point values, manages subscriptions, and publishes
 * updates to UI components via Change-of-Value (COV) filtering.
 * 
 * Runs via Babel standalone (no bundler) — attaches to window.
 * Consumes window.POINT_CATALOG from src/data/points/index.js
 */

const PointRegistry = (() => {
  // Internal state
  const points = new Map();          // Map<address, Point>
  const subscribers = new Map();     // Map<address, Set<callback>>
  const previousValues = new Map();  // Map<address, number|boolean> — last notified value

  // ─── Subscription Management ────────────────────────────────────────────────

  /**
   * Register a callback for a specific point address.
   * Called whenever that point's value changes beyond its COV threshold.
   */
  function subscribe(address, callback) {
    if (!subscribers.has(address)) {
      subscribers.set(address, new Set());
    }
    subscribers.get(address).add(callback);
  }

  /**
   * Remove a callback subscription for a specific point address.
   */
  function unsubscribe(address, callback) {
    const subs = subscribers.get(address);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        subscribers.delete(address);
      }
    }
  }

  // ─── Value Access ───────────────────────────────────────────────────────────

  /**
   * Returns the current value for a point (number or boolean).
   */
  function getValue(address) {
    const point = points.get(address);
    if (!point) return undefined;
    return point.currentValue;
  }

  /**
   * Update a point's value. Notifies subscribers only if the change
   * exceeds the point's COV increment threshold.
   *
   * Note on the Honeywell SymmetrE/EBI spec rule that Inputs (AI/BI) can't be
   * put into Manual directly: that restriction is enforced at the UI layer
   * (ControlsSidebar.jsx only renders AO/BO as editable white boxes), not
   * here. setValue() itself stays type-agnostic because legitimate internal
   * callers — training-scenario fixtures, which inject fault conditions
   * (e.g. "CO2 Sensor Fault") by writing directly to sensor addresses with
   * source 'operator' — depend on being able to write any point type.
   *
   * @param {string} address - BACnet address
   * @param {number|boolean} value - New value
   * @param {string} source - 'simulation' | 'operator' | 'fault'
   */
  function setValue(address, value, source) {
    const point = points.get(address);
    if (!point) return;

    const oldValue = point.currentValue;
    point.currentValue = value;

    // Track source for mode management
    if (source === 'operator') {
      point.mode = 'Manual';
    }

    // COV filtering: only notify if change exceeds threshold
    const lastNotified = previousValues.get(address);
    const covIncrement = point.covIncrement;

    let shouldNotify = false;

    if (typeof value === 'boolean' || typeof oldValue === 'boolean') {
      // Binary points: always notify on change
      shouldNotify = value !== lastNotified;
    } else if (covIncrement === 0) {
      // No COV configured: notify on any change
      shouldNotify = value !== lastNotified;
    } else {
      // Analog points: notify only if delta exceeds COV increment
      if (lastNotified === undefined) {
        shouldNotify = true;
      } else {
        shouldNotify = Math.abs(value - lastNotified) >= covIncrement;
      }
    }

    if (shouldNotify) {
      previousValues.set(address, value);
      _notifySubscribers(address, point);
    }
  }

  /**
   * Toggle a point's Out of Service state. While Out of Service, the
   * controller "doesn't read anything controlling it other than the value
   * given by the operator" (per spec) — interpolate() skips OOS points just
   * like it skips Manual-mode points. Checking this box is also what allows
   * an Input (AI/BI) to have its PV operator-set at all; unchecking it
   * returns the point to normal controller-driven updates.
   * @param {string} address - BACnet address
   * @param {boolean} outOfService - New Out of Service state
   */
  function setOutOfService(address, outOfService) {
    const point = points.get(address);
    if (!point) return;
    point.outOfService = !!outOfService;
    _notifySubscribers(address, point);
  }

  // ─── Metadata Access ────────────────────────────────────────────────────────

  /**
   * Returns all point fields except currentValue.
   */
  function getMetadata(address) {
    const point = points.get(address);
    if (!point) return undefined;

    const { currentValue, data, ...metadata } = point;
    return metadata;
  }

  /**
   * Returns array of all point objects.
   */
  function getAll() {
    return Array.from(points.values());
  }

  /**
   * Filter points by criteria object.
   * Each key in filter must match the corresponding point field.
   * e.g. { subsystem: 'AHU-4-4' }, { mode: 'Manual' }, { type: 'AI' }
   */
  function query(filter) {
    if (!filter || Object.keys(filter).length === 0) {
      return getAll();
    }

    return Array.from(points.values()).filter(point => {
      return Object.entries(filter).every(([key, value]) => {
        return point[key] === value;
      });
    });
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  /**
   * Load all points from the POINT_CATALOG.
   * Each catalog entry has: address, name, type, units, min, max,
   * covIncrement, sensorOffset, subsystem, and a module with a `data` array.
   */
  function initialize(pointCatalog) {
    points.clear();
    subscribers.clear();
    previousValues.clear();

    if (!pointCatalog || !Array.isArray(pointCatalog)) return;

    pointCatalog.forEach(entry => {
      // Skip variant points (pedagogical alternatives) during normal initialization
      if (entry.isVariant) return;

      const dataArray = entry.module ? entry.module.data : (entry.data || []);

      const point = {
        address: entry.address,
        name: entry.name,
        type: entry.type,
        units: entry.units,
        min: entry.min,
        max: entry.max,
        covIncrement: entry.covIncrement,
        sensorOffset: entry.sensorOffset,
        subsystem: entry.subsystem,
        currentValue: dataArray.length > 0 ? dataArray[0] : 0,
        mode: 'Auto',
        alarmState: {
          lifecycle: 'inactive',
          acknowledged: true
        },
        outOfService: false,
        alarmSuppressed: false,
        data: dataArray
      };

      points.set(entry.address, point);
    });
  }

  // ─── Interpolation (called by Simulation Engine on each tick) ───────────────

  /**
   * For each point, calculate interpolated value between adjacent hourly samples:
   *   data[rowIndex-1] + fraction * (data[rowIndex] - data[rowIndex-1])
   * 
   * Updates currentValue and notifies subscribers if value changes exceed COV.
   * 
   * @param {number} rowIndex - Current row index (1-based, range 1–1017)
   * @param {number} fraction - Interpolation fraction between rows (0.0–1.0)
   */
  function interpolate(rowIndex, fraction) {
    points.forEach((point, address) => {
      const data = point.data;
      if (!data || data.length === 0) return;

      // Skip points in Manual mode or Out of Service — operator-controlled
      // values don't interpolate
      if (point.mode === 'Manual' || point.outOfService) return;

      let newValue;

      // rowIndex is 1-based: row 1 = data[0], row 2 = data[1], etc.
      const idx = rowIndex - 1; // Convert to 0-based index

      if (idx <= 0) {
        // At or before the first row, use first value
        newValue = data[0];
      } else if (idx >= data.length - 1) {
        // At or beyond the last row, use last value
        newValue = data[data.length - 1];
      } else if (fraction <= 0) {
        // No interpolation needed, use exact row value
        newValue = data[idx];
      } else {
        // Linear interpolation: data[idx] + fraction * (data[idx+1] - data[idx])
        // Note: rowIndex points to current position. We interpolate BETWEEN
        // the current row and the next row using fraction.
        // Design spec: data[row-1] + fraction * (data[row] - data[row-1])
        // With 1-based rowIndex: data[rowIndex-1] + fraction * (data[rowIndex] - data[rowIndex-1])
        // In 0-based: data[idx] + fraction * (data[idx+1] - data[idx])
        const prev = data[idx];
        const next = idx + 1 < data.length ? data[idx + 1] : data[idx];
        newValue = prev + fraction * (next - prev);
      }

      // For binary points, round to 0 or 1
      if (point.type === 'BI' || point.type === 'BO') {
        newValue = newValue >= 0.5 ? 1 : 0;
      }

      setValue(address, newValue, 'simulation');
    });
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────────

  function _notifySubscribers(address, point) {
    const subs = subscribers.get(address);
    if (subs && subs.size > 0) {
      subs.forEach(callback => {
        try {
          callback(point);
        } catch (err) {
          console.error('[PointRegistry] Subscriber error for ' + address + ':', err);
        }
      });
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    // Subscription
    subscribe,
    unsubscribe,

    // Value access
    getValue,
    setValue,
    setOutOfService,
    getMetadata,
    getAll,
    query,

    // Initialization and simulation
    initialize,
    interpolate,

    // Expose internal map for debugging / context integration
    get points() { return points; },
    get subscriberCount() {
      let count = 0;
      subscribers.forEach(subs => count += subs.size);
      return count;
    }
  };
})();

// Attach to window for browser use (Babel standalone, no bundler)
window.PointRegistry = PointRegistry;
