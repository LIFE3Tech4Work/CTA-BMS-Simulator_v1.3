/**
 * LL97Panel.jsx — LL97 Compliance Panel for SymmetrE Station
 *
 * Displays LL97 accumulator values within the SymmetrE Station interface:
 * - Building selector (real anchor building + synthetic comparison
 *   archetypes from window.BuildingArchetypes — see building_archetypes.js)
 * - Annual Energy (kBTU), Electric Energy (kWh), Steam Energy (kBTU), GHG
 *   Emissions (mtCO2e) for the active building's accumulated session totals
 * - LL97 compliance status for BOTH compliance periods: 2024-2029 and
 *   2030-2034, each with its own floor-area-weighted carbon limit,
 *   percent-of-limit, and projected penalty dollar exposure
 * - "Synthetic" badge whenever a non-anchor (archetype) building is active,
 *   so it's never ambiguous that the data isn't a real LL84 disclosure
 *
 * Values update on each simulation tick.
 * Reads from window.LL97Accumulator.getValues(), .getComplianceStatus(),
 * and .getAvailableBuildings(); switches buildings via .setActiveBuilding().
 * Dark themed matching SymmetrE aesthetic.
 * Green when compliant, amber when approaching limit (>75%), red when exceeding limit.
 *
 * No import/export — exposes window.LL97Panel
 */

const LL97Panel = (function () {
  'use strict';

  const { useState, useEffect, useCallback } = React;

  // ─── Thresholds ─────────────────────────────────────────────────────────────

  /** Percent of limit above which amber/warning is shown */
  var WARNING_THRESHOLD = 75;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Format large numbers with commas and fixed decimals.
   * @param {number} val
   * @param {number} decimals
   * @returns {string}
   */
  function formatNumber(val, decimals) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    var fixed = val.toFixed(decimals);
    // Add thousand separators
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /**
   * Format a dollar amount with commas, no decimals.
   * @param {number} val
   * @returns {string}
   */
  function formatDollars(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return '$' + formatNumber(val, 0);
  }

  /**
   * Determine status color class based on compliance status.
   * @param {boolean} compliant
   * @param {number} percentOfLimit
   * @returns {string} Tailwind color class
   */
  function getStatusColor(compliant, percentOfLimit) {
    if (!compliant) return 'text-red-400';
    if (percentOfLimit > WARNING_THRESHOLD) return 'text-amber-400';
    return 'text-green-400';
  }

  /**
   * Get the background indicator class for the compliance badge.
   * @param {boolean} compliant
   * @param {number} percentOfLimit
   * @returns {string}
   */
  function getBadgeBg(compliant, percentOfLimit) {
    if (!compliant) return 'bg-red-900/50 border-red-600';
    if (percentOfLimit > WARNING_THRESHOLD) return 'bg-amber-900/50 border-amber-600';
    return 'bg-green-900/50 border-green-600';
  }

  /**
   * Get the status text for compliance.
   * @param {boolean} compliant
   * @param {number} percentOfLimit
   * @returns {string}
   */
  function getStatusText(compliant, percentOfLimit) {
    if (!compliant) return 'NON-COMPLIANT';
    if (percentOfLimit > WARNING_THRESHOLD) return 'APPROACHING LIMIT';
    return 'COMPLIANT';
  }

  /**
   * Get the dot color for the status indicator.
   * @param {boolean} compliant
   * @param {number} percentOfLimit
   * @returns {string}
   */
  function getDotColor(compliant, percentOfLimit) {
    if (!compliant) return 'bg-red-500';
    if (percentOfLimit > WARNING_THRESHOLD) return 'bg-amber-500';
    return 'bg-green-500';
  }

  // ─── Compliance Period Row ──────────────────────────────────────────────────

  /**
   * Renders one compliance-period row (used twice: 2024-2029 and 2030-2034).
   */
  function CompliancePeriodRow(props) {
    var label = props.label;
    var compliant = props.compliant;
    var limit = props.limit;
    var percentOfLimit = props.percentOfLimit;
    var penaltyExposure = props.penaltyExposure;

    var statusColor = getStatusColor(compliant, percentOfLimit);
    var badgeBg = getBadgeBg(compliant, percentOfLimit);
    var statusText = getStatusText(compliant, percentOfLimit);
    var dotColor = getDotColor(compliant, percentOfLimit);

    return React.createElement('div', { className: 'px-3 py-2 border-t border-gray-800' },
      React.createElement('div', { className: 'flex items-center justify-between mb-1.5' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-[10px] font-bold text-gray-300 tracking-wide' }, label),
          React.createElement('span', { className: 'text-[10px] text-gray-500' },
            formatNumber(limit, 2) + ' kgCO₂e/sf'
          )
        ),
        React.createElement('div', {
          className: 'flex items-center gap-1.5 px-2 py-0.5 rounded border ' + badgeBg
        },
          React.createElement('span', { className: 'w-1.5 h-1.5 rounded-full ' + dotColor }),
          React.createElement('span', { className: 'text-[9px] font-semibold ' + statusColor }, statusText)
        )
      ),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-2 flex-1' },
          React.createElement('div', {
            className: 'h-1.5 rounded-full bg-gray-700 overflow-hidden flex-1',
            role: 'progressbar',
            'aria-valuenow': Math.min(percentOfLimit, 100),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-label': label + ' limit consumption progress'
          },
            React.createElement('div', {
              className: 'h-full rounded-full transition-all duration-300 ' +
                (!compliant ? 'bg-red-500' :
                  percentOfLimit > WARNING_THRESHOLD ? 'bg-amber-500' : 'bg-green-500'),
              style: { width: Math.min(percentOfLimit, 100) + '%' }
            })
          ),
          React.createElement('span', { className: 'text-[10px] font-mono ' + statusColor + ' w-12 text-right' },
            formatNumber(percentOfLimit, 1) + '%'
          )
        )
      ),
      penaltyExposure > 0
        ? React.createElement('div', { className: 'mt-1 text-[10px] text-red-400 font-mono' },
            'Projected penalty exposure: ', formatDollars(penaltyExposure), '/yr'
          )
        : null
    );
  }

  // ─── Main Panel Component ───────────────────────────────────────────────────

  function LL97PanelComponent() {
    var _useState = useState(null);
    var values = _useState[0];
    var setValues = _useState[1];

    var _useState2 = useState(null);
    var compliance = _useState2[0];
    var setCompliance = _useState2[1];

    var _useState3 = useState([]);
    var availableBuildings = _useState3[0];
    var setAvailableBuildings = _useState3[1];

    var _useState4 = useState('anchor');
    var selectedBuildingId = _useState4[0];
    var setSelectedBuildingId = _useState4[1];

    // Update values from the LL97Accumulator on a regular interval
    // tied to simulation ticks. We poll every 500ms to catch tick updates.
    useEffect(function () {
      function updateFromAccumulator() {
        if (window.LL97Accumulator && typeof window.LL97Accumulator.getValues === 'function') {
          setValues(window.LL97Accumulator.getValues());
        }
        if (window.LL97Accumulator && typeof window.LL97Accumulator.getComplianceStatus === 'function') {
          setCompliance(window.LL97Accumulator.getComplianceStatus());
        }
        if (window.LL97Accumulator && typeof window.LL97Accumulator.getAvailableBuildings === 'function') {
          setAvailableBuildings(window.LL97Accumulator.getAvailableBuildings());
        }
        if (window.LL97Accumulator && typeof window.LL97Accumulator.getActiveBuildingId === 'function') {
          setSelectedBuildingId(window.LL97Accumulator.getActiveBuildingId());
        }
      }

      // Initial read
      updateFromAccumulator();

      // Subscribe to simulation tick events if engine is available
      if (window.SimulationEngine && typeof window.SimulationEngine.onTick === 'function') {
        window.SimulationEngine.onTick(updateFromAccumulator);
      }

      // Also poll as fallback (in case tick subscription isn't wired)
      var intervalId = setInterval(updateFromAccumulator, 500);

      return function () {
        clearInterval(intervalId);
        if (window.SimulationEngine && typeof window.SimulationEngine.offTick === 'function') {
          window.SimulationEngine.offTick(updateFromAccumulator);
        }
      };
    }, []);

    var handleBuildingChange = useCallback(function (newBuildingId) {
      if (window.LL97Accumulator && typeof window.LL97Accumulator.setActiveBuilding === 'function') {
        window.LL97Accumulator.setActiveBuilding(newBuildingId);
        setSelectedBuildingId(window.LL97Accumulator.getActiveBuildingId());
        setValues(window.LL97Accumulator.getValues());
        setCompliance(window.LL97Accumulator.getComplianceStatus());
      }
    }, []);

    // ─── Render ─────────────────────────────────────────────────────────────

    var totalEnergy = values ? values.totalEnergy_kBTU : 0;
    var electricEnergy = values ? values.electricEnergy_kWh : 0;
    var steamEnergy = values ? values.steamEnergy_kBTU : 0;
    var ghgEmissions = values ? values.ghgEmissions_mtCO2e : 0;

    var selectedBuildingMeta = availableBuildings.find(function (b) { return b.id === selectedBuildingId; });
    var isSynthetic = selectedBuildingMeta ? selectedBuildingMeta.isSynthetic : false;
    var buildingName = compliance ? compliance.buildingName : (selectedBuildingMeta ? selectedBuildingMeta.name : '');

    return React.createElement('div', {
      className: 'bg-gray-900 border border-gray-700 rounded-md mx-2 my-2 overflow-hidden',
      'aria-label': 'LL97 Compliance Panel',
      role: 'region'
    },
      // Panel header
      React.createElement('div', {
        className: 'flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700'
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-xs font-bold text-gray-200 tracking-wide' }, 'LL97'),
          React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'NYC Carbon Limit')
        ),
        isSynthetic
          ? React.createElement('span', {
              className: 'text-[9px] font-semibold text-purple-300 bg-purple-900/50 border border-purple-600 rounded px-1.5 py-0.5',
              title: 'Synthetic comparison building — not a real LL84 disclosure'
            }, 'SYNTHETIC')
          : React.createElement('span', {
              className: 'text-[9px] font-semibold text-gray-400 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5'
            }, 'LL84 VERIFIED')
      ),

      // Building selector
      React.createElement('div', { className: 'px-3 py-2 border-b border-gray-800' },
        React.createElement('label', { className: 'text-[10px] text-gray-500 uppercase tracking-wider block mb-1' },
          'Active Building'
        ),
        React.createElement('select', {
          className: 'w-full bg-gray-800 text-white text-xs border border-gray-600 rounded px-2 py-1 focus:border-cyan-500 focus:outline-none',
          value: selectedBuildingId,
          onChange: function (e) { handleBuildingChange(e.target.value); },
          'aria-label': 'Select active building for LL97 compliance comparison'
        },
          availableBuildings.map(function (b) {
            return React.createElement('option', { key: b.id, value: b.id }, b.name);
          })
        ),
        selectedBuildingMeta
          ? React.createElement('div', { className: 'text-[9px] text-gray-500 mt-1 leading-snug' },
              selectedBuildingMeta.description
            )
          : null
      ),

      // Accumulator values grid
      React.createElement('div', {
        className: 'grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2'
      },
        // Annual Energy
        React.createElement('div', { className: 'flex flex-col' },
          React.createElement('span', { className: 'text-[10px] text-gray-500 uppercase tracking-wider' }, 'Total Energy'),
          React.createElement('span', { className: 'text-xs font-mono text-gray-200' },
            formatNumber(totalEnergy, 0), ' ',
            React.createElement('span', { className: 'text-gray-500' }, 'kBTU')
          )
        ),
        // Electric Energy
        React.createElement('div', { className: 'flex flex-col' },
          React.createElement('span', { className: 'text-[10px] text-gray-500 uppercase tracking-wider' }, 'Electric'),
          React.createElement('span', { className: 'text-xs font-mono text-gray-200' },
            formatNumber(electricEnergy, 0), ' ',
            React.createElement('span', { className: 'text-gray-500' }, 'kWh')
          )
        ),
        // Steam Energy
        React.createElement('div', { className: 'flex flex-col' },
          React.createElement('span', { className: 'text-[10px] text-gray-500 uppercase tracking-wider' }, 'Steam'),
          React.createElement('span', { className: 'text-xs font-mono text-gray-200' },
            formatNumber(steamEnergy, 0), ' ',
            React.createElement('span', { className: 'text-gray-500' }, 'kBTU')
          )
        ),
        // GHG Emissions
        React.createElement('div', { className: 'flex flex-col' },
          React.createElement('span', { className: 'text-[10px] text-gray-500 uppercase tracking-wider' }, 'GHG Emissions'),
          React.createElement('span', { className: 'text-xs font-mono text-gray-200' },
            formatNumber(ghgEmissions, 2), ' ',
            React.createElement('span', { className: 'text-gray-500' }, 'mtCO₂e')
          )
        )
      ),

      // Compliance periods — 2024-2029 and 2030-2034, each with its own
      // weighted limit, percent-of-limit, and penalty exposure
      compliance
        ? React.createElement(React.Fragment, null,
            React.createElement(CompliancePeriodRow, {
              label: '2024–2029',
              compliant: compliance.compliant,
              limit: compliance.limit_kgCO2PerSqft,
              percentOfLimit: compliance.percentOfLimit,
              penaltyExposure: compliance.penaltyExposure2024_usd
            }),
            React.createElement(CompliancePeriodRow, {
              label: '2030–2034',
              compliant: compliance.compliant2030,
              limit: compliance.limit2030_kgCO2PerSqft,
              percentOfLimit: compliance.percentOfLimit2030,
              penaltyExposure: compliance.penaltyExposure2030_usd
            })
          )
        : null
    );
  }

  return LL97PanelComponent;
})();

// Expose globally — no import/export
window.LL97Panel = LL97Panel;
