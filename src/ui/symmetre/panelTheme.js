/**
 * panelTheme.js — shared palette for the SymmetrE Controls sidebars.
 *
 * Colour tokens lifted from the CTA BMS design reference's left control panel
 * so the sidebar, the vector board's chips, and the point-detail dialog all
 * speak one palette: a light neutral panel with blue section bars, navy values,
 * and the same white/grey value-box treatment used on the diagram
 * (white = editable setpoint, grey = calculated / read-only).
 *
 * Styling only — no row content, labels, ordering, or behaviour lives here.
 *
 * No import/export — exposed as window.CTAPanel
 */
(function () {
  'use strict';

  var T = {
    // surfaces
    panel:       'linear-gradient(180deg,#eef2f8,#e4eaf3)',
    panelFlat:   '#e8edf5',
    panelBorder: '#b9c4d6',
    rail:        'linear-gradient(180deg,#2b3a52,#243247)',

    // bars
    head:        'linear-gradient(180deg,#2b3a52,#243247)',
    headText:    '#eef3fa',
    headSub:     '#9db0c8',
    section:     'linear-gradient(180deg,#3f6fbf,#30528e)',
    sectionTop:  '1px solid #5f8bce',

    // type
    label:       '#3f5170',
    value:       '#12294f',
    muted:       '#5a6f8e',
    accent:      '#2d5aa8',

    // rows
    rowLine:     '#d8e1ee',
    rowHover:    '#dde7f4',
    rowAlt:      'rgba(255,255,255,0.45)',

    // state colours
    on:          'linear-gradient(180deg,#5fd694,#22a35d)',
    onBorder:    '#9ff0c2',
    off:         'linear-gradient(180deg,#8d9cb4,#68788f)',
    offBorder:   '#b8c3d3',
    alarm:       'linear-gradient(180deg,#e88f88,#c0332b)',
    alarmBorder: '#eeaba4',
    manual:      '#c81fae',
  };

  /* White framed box — an editable setpoint. Matches the diagram's box chips. */
  T.boxWhite = {
    background: '#fff',
    border: '1.5px solid #8496b4',
    borderRadius: '4px',
    boxShadow: 'inset 0 1px 2px rgba(30,50,90,.1)',
    color: T.value,
    fontWeight: 700,
    padding: '1px 6px',
    minWidth: '46px',
    textAlign: 'right',
  };

  /* Grey framed box — a calculated / read-only value. */
  T.boxGrey = {
    background: '#e3e8f0',
    border: '1.5px solid #a9b6c9',
    borderRadius: '4px',
    color: T.value,
    fontWeight: 700,
    padding: '1px 6px',
    minWidth: '46px',
    textAlign: 'right',
  };

  /* Pill for a binary state. tone: 'on' | 'off' | 'alarm' */
  T.pill = function (tone) {
    var bg = tone === 'on' ? T.on : (tone === 'alarm' ? T.alarm : T.off);
    var bd = tone === 'on' ? T.onBorder : (tone === 'alarm' ? T.alarmBorder : T.offBorder);
    return {
      background: bg,
      border: '1px solid ' + bd,
      borderRadius: '5px',
      color: '#fff',
      fontWeight: 800,
      letterSpacing: '.3px',
      padding: '1px 8px',
      textShadow: '0 1px 1px rgba(10,25,50,.28)',
    };
  };

  T.sectionStyle = {
    background: T.section,
    borderTop: T.sectionTop,
    color: '#fff',
    fontWeight: 800,
    letterSpacing: '.5px',
    textTransform: 'uppercase',
  };

  T.rowStyle = { color: T.label, borderBottom: '1px solid ' + T.rowLine };

  window.CTAPanel = T;
})();
