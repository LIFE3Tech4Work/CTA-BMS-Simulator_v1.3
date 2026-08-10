/**
 * SimulationEngine — Clock and tick loop for BMS data playback.
 *
 * Drives the entire simulation by advancing through 1,017 hourly rows
 * (May 1, 2026 00:00 EDT through June 12, 2026 08:00 EDT) at variable speed.
 *
 * Attached to window.SimulationEngine (no import/export — Babel standalone).
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Base date: May 1, 2026 00:00 EDT (UTC-4) */
  const BASE_DATE = new Date('2026-05-01T00:00:00-04:00');

  /** Total hourly rows in the dataset */
  const TOTAL_ROWS = 1017;

  /** Milliseconds per hour */
  const MS_PER_HOUR = 3600000;

  /** End date: June 12, 2026 08:00 EDT — row 1017 */
  const END_DATE = new Date(BASE_DATE.getTime() + (TOTAL_ROWS - 1) * MS_PER_HOUR);

  /**
   * Speed multipliers: how many simulated hours pass per 1 real-time second.
   * - '1x':    1 simulated hour / 3600 real seconds  → 1/3600 hours/sec
   * - '60x':   1 simulated hour / 60 real seconds    → 1/60 hours/sec
   * - '3600x': 1 simulated hour / 1 real second      → 1 hour/sec
   * - 'pause': 0
   */
  const SPEED_MULTIPLIERS = {
    '1x': 1 / 3600,
    '60x': 1 / 60,
    '3600x': 1,
    'pause': 0
  };

  // ─── Engine State ───────────────────────────────────────────────────────────

  let currentRow = 1;
  let speed = 'pause';
  let interpolationFraction = 0;
  let running = false;
  let lastFrameTime = null;
  let animationFrameId = null;
  let atEnd = false;

  /** Tick event subscribers */
  const tickListeners = [];

  // ─── Tick Loop ──────────────────────────────────────────────────────────────

  function tick(timestamp) {
    if (!running) return;

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
      animationFrameId = requestAnimationFrame(tick);
      return;
    }

    const elapsedMs = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Calculate simulated hours elapsed based on current speed
    const elapsedSeconds = elapsedMs / 1000;
    const multiplier = SPEED_MULTIPLIERS[speed] || 0;
    const simulatedHoursAdvanced = elapsedSeconds * multiplier;

    if (simulatedHoursAdvanced > 0) {
      // Advance interpolation fraction
      interpolationFraction += simulatedHoursAdvanced;

      // When fraction >= 1.0, we've moved to a new row
      while (interpolationFraction >= 1.0) {
        interpolationFraction -= 1.0;
        currentRow += 1;

        // Check if we've reached the end of data
        if (currentRow > TOTAL_ROWS) {
          currentRow = TOTAL_ROWS;
          interpolationFraction = 0;
          atEnd = true;
          running = false;
          // Notify one final time at the end
          notifyListeners();
          return;
        }
      }
    }

    // Notify all tick subscribers
    notifyListeners();

    // Schedule next frame
    animationFrameId = requestAnimationFrame(tick);
  }

  function notifyListeners() {
    const event = {
      rowIndex: currentRow,
      interpolationFraction: interpolationFraction,
      timestamp: getCurrentTimestamp()
    };

    for (let i = 0; i < tickListeners.length; i++) {
      try {
        tickListeners[i](event);
      } catch (e) {
        console.error('[SimulationEngine] Tick listener error:', e);
      }
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start the tick loop. If already running, does nothing.
   * If at end of data, resets to row 1.
   */
  function start() {
    if (running) return;

    if (atEnd) {
      // Reset to beginning if we were at the end
      currentRow = 1;
      interpolationFraction = 0;
      atEnd = false;
    }

    if (speed === 'pause') {
      speed = '1x'; // Default to 1x if starting from pause
    }

    running = true;
    lastFrameTime = null;
    animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * Pause the tick loop. Preserves current position.
   */
  function pause() {
    running = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    lastFrameTime = null;
  }

  /**
   * Change playback speed without resetting position (Property 17: continuity).
   * @param {string} newSpeed - '1x' | '60x' | '3600x' | 'pause'
   */
  function setSpeed(newSpeed) {
    if (!SPEED_MULTIPLIERS.hasOwnProperty(newSpeed)) {
      console.warn('[SimulationEngine] Invalid speed:', newSpeed);
      return;
    }

    speed = newSpeed;

    if (newSpeed === 'pause') {
      pause();
    } else if (!running) {
      // If we were paused and set a non-pause speed, start running
      start();
    }
  }

  /**
   * Jump to a specific date. Returns false if out of range (Property 18).
   * @param {Date} date - Target date to jump to
   * @returns {boolean} true if jump succeeded, false if date is out of range
   */
  function jumpToDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }

    const diffMs = date.getTime() - BASE_DATE.getTime();

    // Out-of-range check: before start or after end
    if (diffMs < 0 || diffMs > (TOTAL_ROWS - 1) * MS_PER_HOUR) {
      return false;
    }

    // Formula: row = floor((date - baseDate) / 3600000) + 1
    const hoursFromBase = diffMs / MS_PER_HOUR;
    const rowFromBase = Math.floor(hoursFromBase) + 1;
    const fraction = hoursFromBase - Math.floor(hoursFromBase);

    currentRow = Math.min(rowFromBase, TOTAL_ROWS);
    interpolationFraction = currentRow >= TOTAL_ROWS ? 0 : fraction;
    atEnd = currentRow >= TOTAL_ROWS;

    // Notify listeners of the new position
    notifyListeners();

    return true;
  }

  /**
   * Get the current simulated timestamp based on currentRow + interpolationFraction.
   * @returns {Date}
   */
  function getCurrentTimestamp() {
    // Row 1 = BASE_DATE, each row = 1 hour
    // Timestamp = BASE_DATE + ((currentRow - 1) + interpolationFraction) * MS_PER_HOUR
    const totalHours = (currentRow - 1) + interpolationFraction;
    return new Date(BASE_DATE.getTime() + totalHours * MS_PER_HOUR);
  }

  /**
   * Register a tick event listener.
   * @param {Function} callback - Called with { rowIndex, interpolationFraction, timestamp }
   */
  function onTick(callback) {
    if (typeof callback === 'function' && tickListeners.indexOf(callback) === -1) {
      tickListeners.push(callback);
    }
  }

  /**
   * Remove a tick event listener.
   * @param {Function} callback - Previously registered callback
   */
  function offTick(callback) {
    const idx = tickListeners.indexOf(callback);
    if (idx !== -1) {
      tickListeners.splice(idx, 1);
    }
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.SimulationEngine = {
    // Read-only state accessors (use getters for live values)
    get currentRow() { return currentRow; },
    get speed() { return speed; },
    get interpolationFraction() { return interpolationFraction; },
    get running() { return running; },
    get atEnd() { return atEnd; },

    // Constants (exposed for testing / consumers)
    BASE_DATE: BASE_DATE,
    TOTAL_ROWS: TOTAL_ROWS,
    MS_PER_HOUR: MS_PER_HOUR,
    END_DATE: END_DATE,
    SPEED_MULTIPLIERS: SPEED_MULTIPLIERS,

    // Methods
    start: start,
    pause: pause,
    setSpeed: setSpeed,
    jumpToDate: jumpToDate,
    getCurrentTimestamp: getCurrentTimestamp,
    onTick: onTick,
    offTick: offTick,

    // Testing helpers — allow resetting state
    _reset: function () {
      pause();
      currentRow = 1;
      speed = 'pause';
      interpolationFraction = 0;
      atEnd = false;
      tickListeners.length = 0;
    }
  };
})();
