/**
 * Shared SVG definitions: bezel gradients per style preset, metal and
 * opening gradients, vent patterns and <symbol>s for repeated parts (ports,
 * screws). Rendered once per document (App root) and embedded in exports, so
 * a fully populated rack reuses a handful of symbols via <use>.
 */
import { memo } from 'react';
import { STYLE_PRESETS } from '@rackplanner/shared';
import { PRESETS, bezelId, earId, trayId } from './presets';

const grad = (id: string, [a, b]: readonly [string, string], vertical = true) => (
  <linearGradient key={id} id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
    <stop offset="0" stopColor={a} />
    <stop offset="1" stopColor={b} />
  </linearGradient>
);

function PresetGradients() {
  return (
    <>
      {STYLE_PRESETS.map((p) => {
        const t = PRESETS[p];
        return [grad(bezelId(p), t.bezel), grad(earId(p), t.ear, false), grad(trayId(p), t.tray)];
      })}
    </>
  );
}

export const FaceplateDefs = memo(function FaceplateDefs() {
  return (
    <defs>
      <PresetGradients />
      {/* Metal: SFP cages, USB shells, screws. */}
      <linearGradient id="rp-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef1f4" />
        <stop offset="0.45" stopColor="#b7bdc4" />
        <stop offset="1" stopColor="#8a9198" />
      </linearGradient>
      <linearGradient id="rp-metal-dark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9aa1a8" />
        <stop offset="1" stopColor="#5d646b" />
      </linearGradient>
      {/* Port openings: darker at the top edge, like an inset shadow. */}
      <linearGradient id="rp-hole" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000000" />
        <stop offset="0.35" stopColor="#0b0d10" />
        <stop offset="1" stopColor="#1c2025" />
      </linearGradient>
      <linearGradient id="rp-screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#141a22" />
        <stop offset="1" stopColor="#05070a" />
      </linearGradient>
      <linearGradient id="rp-rail-shadow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0.38" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="rp-rail-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id="rp-shelf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a5058" />
        <stop offset="1" stopColor="#262a2f" />
      </linearGradient>
      <linearGradient id="rp-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#c7e3ff" stopOpacity="0.22" />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#c7e3ff" stopOpacity="0.16" />
      </linearGradient>
      <radialGradient id="rp-screw" cx="0.35" cy="0.35" r="0.8">
        <stop offset="0" stopColor="#f3f5f7" />
        <stop offset="0.6" stopColor="#a4abb2" />
        <stop offset="1" stopColor="#5f666d" />
      </radialGradient>
      <radialGradient id="rp-fan" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#1d2125" />
        <stop offset="1" stopColor="#07080a" />
      </radialGradient>

      {/* Vent patterns (holes are translucent black so they work on any bezel). */}
      <pattern id="rp-vent-holes" width="2.6" height="2.25" patternUnits="userSpaceOnUse">
        <circle cx="0.65" cy="0.56" r="0.62" fill="#000" fillOpacity="0.55" />
        <circle cx="1.95" cy="1.69" r="0.62" fill="#000" fillOpacity="0.55" />
      </pattern>
      <pattern id="rp-vent-honeycomb" width="3.2" height="5.54" patternUnits="userSpaceOnUse">
        <path
          d="M0.8 0.25 L2.4 0.25 L3.0 1.385 L2.4 2.52 L0.8 2.52 L0.2 1.385 Z M-0.8 3.02 L0.8 3.02 L1.4 4.155 L0.8 5.29 L-0.8 5.29 L-1.4 4.155 Z M2.4 3.02 L4.0 3.02 L4.6 4.155 L4.0 5.29 L2.4 5.29 L1.8 4.155 Z"
          fill="#000"
          fillOpacity="0.6"
        />
      </pattern>
      <pattern id="rp-vent-slots" width="8.6" height="2.9" patternUnits="userSpaceOnUse">
        <rect x="0.4" y="0.6" width="7" height="1.3" rx="0.65" fill="#000" fillOpacity="0.55" />
      </pattern>
      <pattern id="rp-vent-mesh" width="1.5" height="1.5" patternUnits="userSpaceOnUse">
        <rect x="0.25" y="0.25" width="1" height="1" fill="#000" fillOpacity="0.5" />
      </pattern>
      <pattern id="rp-brush" width="0.9" height="12" patternUnits="userSpaceOnUse">
        <path d="M0.45 0 L0.3 12" stroke="#4b525b" strokeWidth="0.32" />
      </pattern>
      <pattern id="rp-shelf-slots" width="9" height="40" patternUnits="userSpaceOnUse">
        <rect x="2" y="4" width="4.5" height="32" rx="2.2" fill="#000" fillOpacity="0.45" />
      </pattern>

      {/* --- Connector symbols at nominal size (mm). currentColor = housing / body colour. --- */}
      <symbol id="rp-rj45" viewBox="0 0 13.6 11.6">
        <rect x="0" y="0" width="13.6" height="11.6" rx="0.5" fill="currentColor" />
        <rect x="0" y="0" width="13.6" height="11.6" rx="0.5" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="0.25" />
        <path d="M1.3 1.1 h11 v7.6 h-3.4 v1.9 h-4.2 v-1.9 h-3.4 z" fill="url(#rp-hole)" />
        <path d="M2.85 1.3 v1.7 M3.85 1.3 v1.7 M4.85 1.3 v1.7 M5.85 1.3 v1.7 M6.85 1.3 v1.7 M7.85 1.3 v1.7 M8.85 1.3 v1.7 M9.85 1.3 v1.7" stroke="#c9a227" strokeWidth="0.32" strokeOpacity="0.85" />
        <rect x="1.3" y="1.1" width="11" height="0.5" fill="#000" fillOpacity="0.6" />
      </symbol>
      <symbol id="rp-sfp" viewBox="0 0 14.2 9.8">
        <rect x="0" y="0" width="14.2" height="9.8" rx="0.35" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.3" />
        <rect x="1.1" y="1.5" width="12" height="6.6" fill="url(#rp-hole)" />
        <path d="M1.6 0.55 h2 M4.6 0.55 h2 M7.6 0.55 h2 M10.6 0.55 h2" stroke="#6b7279" strokeWidth="0.35" />
        <rect x="5.1" y="8.4" width="4" height="0.9" rx="0.3" fill="#6b7279" />
      </symbol>
      <symbol id="rp-qsfp" viewBox="0 0 19.6 10.4">
        <rect x="0" y="0" width="19.6" height="10.4" rx="0.4" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.3" />
        <rect x="1.2" y="1.6" width="17.2" height="7.2" fill="url(#rp-hole)" />
        <path d="M1.8 0.6 h2.4 M5.4 0.6 h2.4 M9 0.6 h2.4 M12.6 0.6 h2.4 M16.2 0.6 h1.8" stroke="#6b7279" strokeWidth="0.35" />
      </symbol>
      <symbol id="rp-keystone" viewBox="0 0 14.8 16.6">
        <rect x="0" y="0" width="14.8" height="16.6" rx="0.8" fill="#0a0b0d" />
        <rect x="0.7" y="0.7" width="13.4" height="15.2" rx="0.9" fill="currentColor" />
        <rect x="0.7" y="0.7" width="13.4" height="15.2" rx="0.9" fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth="0.3" />
        <path d="M2 4.3 h10.8 v7.2 h-3.2 v1.8 h-4.4 v-1.8 h-3.2 z" fill="url(#rp-hole)" />
        <path d="M3.4 4.5 v1.4 M4.4 4.5 v1.4 M5.4 4.5 v1.4 M6.4 4.5 v1.4 M7.4 4.5 v1.4 M8.4 4.5 v1.4 M9.4 4.5 v1.4 M10.4 4.5 v1.4" stroke="#c9a227" strokeWidth="0.3" strokeOpacity="0.8" />
        <rect x="5.4" y="1.4" width="4" height="1.4" rx="0.4" fill="#000" fillOpacity="0.18" />
      </symbol>
      <symbol id="rp-punchdown" viewBox="0 0 14.8 20">
        <rect x="0" y="0" width="14.8" height="20" rx="0.8" fill="#e8eaed" stroke="#7b8289" strokeWidth="0.3" />
        <path d="M2 3 h4.4 M8.4 3 h4.4" stroke="#2563eb" strokeWidth="1.4" />
        <path d="M2 6.6 h4.4 M8.4 6.6 h4.4" stroke="#ea580c" strokeWidth="1.4" />
        <path d="M2 10.2 h4.4 M8.4 10.2 h4.4" stroke="#16a34a" strokeWidth="1.4" />
        <path d="M2 13.8 h4.4 M8.4 13.8 h4.4" stroke="#92400e" strokeWidth="1.4" />
        <path d="M7.4 1.5 v15" stroke="#9aa1a8" strokeWidth="0.5" />
      </symbol>
      <symbol id="rp-usb-a" viewBox="0 0 13.2 5.8">
        <rect x="0" y="0" width="13.2" height="5.8" rx="0.4" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <rect x="0.7" y="0.7" width="11.8" height="4.4" fill="#07090b" />
        <rect x="1.5" y="1.3" width="10.2" height="1.6" rx="0.2" fill="currentColor" />
      </symbol>
      <symbol id="rp-usb-c" viewBox="0 0 9.2 3.6">
        <rect x="0" y="0" width="9.2" height="3.6" rx="1.8" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <rect x="0.6" y="0.6" width="8" height="2.4" rx="1.2" fill="#07090b" />
        <rect x="2" y="1.4" width="5.2" height="0.8" rx="0.3" fill="currentColor" />
      </symbol>
      <symbol id="rp-micro-usb" viewBox="0 0 8 3.2">
        <path d="M0 0 h8 v1.8 l-1.2 1.4 h-5.6 l-1.2 -1.4 z" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <path d="M0.7 0.6 h6.6 v1.1 l-0.9 1 h-4.8 l-0.9 -1 z" fill="#07090b" />
      </symbol>
      <symbol id="rp-hdmi" viewBox="0 0 15.2 6">
        <path d="M0 0 h15.2 v3.9 l-2.1 2.1 h-11 l-2.1 -2.1 z" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <path d="M0.8 0.7 h13.6 v2.9 l-1.6 1.6 h-10.4 l-1.6 -1.6 z" fill="#07090b" />
        <rect x="2.4" y="1.6" width="10.4" height="1" fill="currentColor" />
      </symbol>
      <symbol id="rp-micro-hdmi" viewBox="0 0 7 3.2">
        <path d="M0 0 h7 v2 l-1.2 1.2 h-4.6 l-1.2 -1.2 z" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.2" />
        <path d="M0.6 0.55 h5.8 v1.3 l-0.8 0.8 h-4.2 l-0.8 -0.8 z" fill="#07090b" />
      </symbol>
      <symbol id="rp-dp" viewBox="0 0 16.1 6.4">
        <path d="M0 0 h16.1 v4.4 l-2 2 h-14.1 z" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <path d="M0.8 0.7 h14.5 v3.4 l-1.6 1.6 h-12.9 z" fill="#07090b" />
        <rect x="2" y="2.4" width="11.6" height="1" fill="currentColor" />
      </symbol>
      <symbol id="rp-dsub15" viewBox="0 0 31 12.5">
        <rect x="0" y="0" width="31" height="12.5" rx="0.6" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <path d="M7.5 2.2 h16 l-1.4 8.1 h-13.2 z" fill="#0d1f3a" stroke="#4b5563" strokeWidth="0.3" />
        <g fill="#d1d5db">
          <circle cx="10" cy="4" r="0.45" /><circle cx="12.6" cy="4" r="0.45" /><circle cx="15.2" cy="4" r="0.45" /><circle cx="17.8" cy="4" r="0.45" /><circle cx="20.4" cy="4" r="0.45" />
          <circle cx="11.2" cy="6.3" r="0.45" /><circle cx="13.8" cy="6.3" r="0.45" /><circle cx="16.4" cy="6.3" r="0.45" /><circle cx="19" cy="6.3" r="0.45" /><circle cx="21.2" cy="6.3" r="0.45" />
          <circle cx="10.6" cy="8.6" r="0.45" /><circle cx="13.2" cy="8.6" r="0.45" /><circle cx="15.8" cy="8.6" r="0.45" /><circle cx="18.4" cy="8.6" r="0.45" /><circle cx="20.8" cy="8.6" r="0.45" />
        </g>
        <circle cx="3.4" cy="6.25" r="1.6" fill="url(#rp-screw)" />
        <circle cx="27.6" cy="6.25" r="1.6" fill="url(#rp-screw)" />
      </symbol>
      <symbol id="rp-dsub9" viewBox="0 0 31 12.5">
        <rect x="0" y="0" width="31" height="12.5" rx="0.6" fill="url(#rp-metal)" stroke="#5b6168" strokeWidth="0.25" />
        <path d="M8.5 3 h14 l-1.3 6.5 h-11.4 z" fill="#1f2937" stroke="#4b5563" strokeWidth="0.3" />
        <g fill="#d1d5db">
          <circle cx="10.8" cy="5" r="0.5" /><circle cx="13.2" cy="5" r="0.5" /><circle cx="15.6" cy="5" r="0.5" /><circle cx="18" cy="5" r="0.5" /><circle cx="20.4" cy="5" r="0.5" />
          <circle cx="12" cy="7.5" r="0.5" /><circle cx="14.4" cy="7.5" r="0.5" /><circle cx="16.8" cy="7.5" r="0.5" /><circle cx="19.2" cy="7.5" r="0.5" />
        </g>
        <circle cx="3.4" cy="6.25" r="1.6" fill="url(#rp-screw)" />
        <circle cx="27.6" cy="6.25" r="1.6" fill="url(#rp-screw)" />
      </symbol>
      <symbol id="rp-c13" viewBox="0 0 24 15.5">
        <rect x="0" y="0" width="24" height="15.5" rx="1.4" fill="#16181b" stroke="#41464d" strokeWidth="0.4" />
        <path d="M4.6 2.6 h14.8 l2.2 2.4 v8 h-19.2 v-8 z" fill="#060708" stroke="#2c3036" strokeWidth="0.35" />
        <rect x="7.4" y="7.4" width="1.3" height="3.6" fill="#3b4046" />
        <rect x="15.3" y="7.4" width="1.3" height="3.6" fill="#3b4046" />
        <rect x="11.35" y="4" width="1.3" height="3" fill="#3b4046" />
      </symbol>
      <symbol id="rp-c19" viewBox="0 0 26 19.5">
        <rect x="0" y="0" width="26" height="19.5" rx="1.4" fill="#16181b" stroke="#41464d" strokeWidth="0.4" />
        <rect x="3.4" y="3.2" width="19.2" height="13.4" rx="1" fill="#060708" stroke="#2c3036" strokeWidth="0.35" />
        <rect x="6.4" y="11.4" width="4" height="1.4" fill="#3b4046" />
        <rect x="15.6" y="11.4" width="4" height="1.4" fill="#3b4046" />
        <rect x="11" y="5.4" width="4" height="1.4" fill="#3b4046" />
      </symbol>
      <symbol id="rp-c14" viewBox="0 0 27 19.5">
        <rect x="0" y="0" width="27" height="19.5" rx="1.6" fill="#1a1c1f" stroke="#44494f" strokeWidth="0.4" />
        <circle cx="2.4" cy="9.75" r="1" fill="#0a0b0c" />
        <circle cx="24.6" cy="9.75" r="1" fill="#0a0b0c" />
        <path d="M5.4 3.4 h16.2 v8.6 l-2.6 3.6 h-11 l-2.6 -3.6 z" fill="#060708" stroke="#2c3036" strokeWidth="0.35" />
        <rect x="8.4" y="7" width="1.2" height="4.6" fill="url(#rp-metal)" />
        <rect x="17.4" y="7" width="1.2" height="4.6" fill="url(#rp-metal)" />
        <rect x="12.9" y="10.6" width="1.2" height="4" fill="url(#rp-metal)" />
      </symbol>
      <symbol id="rp-c20" viewBox="0 0 29 23">
        <rect x="0" y="0" width="29" height="23" rx="1.6" fill="#1a1c1f" stroke="#44494f" strokeWidth="0.4" />
        <rect x="4.4" y="3.6" width="20.2" height="15.8" rx="1" fill="#060708" stroke="#2c3036" strokeWidth="0.35" />
        <rect x="7.6" y="13" width="4.4" height="1.3" fill="url(#rp-metal)" />
        <rect x="17" y="13" width="4.4" height="1.3" fill="url(#rp-metal)" />
        <rect x="12.3" y="6.2" width="4.4" height="1.3" fill="url(#rp-metal)" />
      </symbol>
      <symbol id="rp-c8" viewBox="0 0 12 7">
        <rect x="0" y="0" width="12" height="7" rx="1.2" fill="#1a1c1f" stroke="#44494f" strokeWidth="0.3" />
        <path d="M3.6 1.3 a2.2 2.2 0 1 0 0 4.4 h4.8 a2.2 2.2 0 1 0 0 -4.4 z" fill="#060708" />
        <rect x="3.3" y="2.9" width="0.7" height="1.4" fill="url(#rp-metal)" />
        <rect x="8" y="2.9" width="0.7" height="1.4" fill="url(#rp-metal)" />
      </symbol>
      <symbol id="rp-c6" viewBox="0 0 14 9">
        <rect x="0" y="0" width="14" height="9" rx="1.2" fill="#1a1c1f" stroke="#44494f" strokeWidth="0.3" />
        <circle cx="4.6" cy="3.6" r="2.1" fill="#060708" />
        <circle cx="9.4" cy="3.6" r="2.1" fill="#060708" />
        <circle cx="7" cy="6" r="2.1" fill="#060708" />
      </symbol>
      <symbol id="rp-dc" viewBox="0 0 8.5 8.5">
        <circle cx="4.25" cy="4.25" r="4" fill="url(#rp-metal-dark)" stroke="#3f444a" strokeWidth="0.3" />
        <circle cx="4.25" cy="4.25" r="2.7" fill="#07090b" />
        <circle cx="4.25" cy="4.25" r="0.75" fill="url(#rp-metal)" />
      </symbol>
      <symbol id="rp-au" viewBox="0 0 30 30">
        <rect x="0" y="0" width="30" height="30" rx="3" fill="#191b1e" stroke="#40454b" strokeWidth="0.45" />
        <rect x="2.4" y="2.4" width="25.2" height="25.2" rx="2.4" fill="#0e0f11" />
        <rect x="8.3" y="7.4" width="1.7" height="6.6" rx="0.5" fill="#000" transform="rotate(30 9.15 10.7)" />
        <rect x="20" y="7.4" width="1.7" height="6.6" rx="0.5" fill="#000" transform="rotate(-30 20.85 10.7)" />
        <rect x="14.15" y="16.6" width="1.7" height="6.4" rx="0.5" fill="#000" />
      </symbol>
      <symbol id="rp-nema" viewBox="0 0 28 32">
        <rect x="0" y="0" width="28" height="32" rx="3" fill="#191b1e" stroke="#40454b" strokeWidth="0.45" />
        <rect x="9.3" y="8" width="1.6" height="7" fill="#000" />
        <rect x="17.1" y="8" width="1.6" height="8" fill="#000" />
        <path d="M12.4 24 v-2 a1.6 1.6 0 0 1 3.2 0 v2 z" fill="#000" />
      </symbol>
      <symbol id="rp-schuko" viewBox="0 0 36 36">
        <rect x="0" y="0" width="36" height="36" rx="3" fill="#191b1e" stroke="#40454b" strokeWidth="0.45" />
        <circle cx="18" cy="18" r="13.5" fill="#0e0f11" />
        <circle cx="12" cy="18" r="1.7" fill="#000" />
        <circle cx="24" cy="18" r="1.7" fill="#000" />
        <rect x="16.6" y="4.8" width="2.8" height="1.6" fill="url(#rp-metal)" />
        <rect x="16.6" y="29.6" width="2.8" height="1.6" fill="url(#rp-metal)" />
      </symbol>
      <symbol id="rp-uk" viewBox="0 0 32 36">
        <rect x="0" y="0" width="32" height="36" rx="3" fill="#191b1e" stroke="#40454b" strokeWidth="0.45" />
        <rect x="14.6" y="6" width="2.8" height="7.6" fill="#000" />
        <rect x="7" y="19.4" width="6.8" height="2.6" fill="#000" />
        <rect x="18.2" y="19.4" width="6.8" height="2.6" fill="#000" />
      </symbol>
      <symbol id="rp-lc" viewBox="0 0 13.2 10">
        <rect x="0" y="0" width="13.2" height="10" rx="0.6" fill="currentColor" stroke="#000" strokeOpacity="0.35" strokeWidth="0.3" />
        <rect x="1.4" y="2.4" width="4.4" height="5.2" rx="0.4" fill="url(#rp-hole)" />
        <rect x="7.4" y="2.4" width="4.4" height="5.2" rx="0.4" fill="url(#rp-hole)" />
        <circle cx="3.6" cy="5" r="0.6" fill="#e5e7eb" />
        <circle cx="9.6" cy="5" r="0.6" fill="#e5e7eb" />
      </symbol>
      <symbol id="rp-sc" viewBox="0 0 13.2 10">
        <rect x="0" y="0" width="13.2" height="10" rx="0.6" fill="currentColor" stroke="#000" strokeOpacity="0.35" strokeWidth="0.3" />
        <rect x="2.6" y="1.6" width="8" height="6.8" rx="0.5" fill="url(#rp-hole)" />
        <circle cx="6.6" cy="5" r="0.8" fill="#e5e7eb" />
      </symbol>
      <symbol id="rp-audio" viewBox="0 0 6.2 6.2">
        <circle cx="3.1" cy="3.1" r="3" fill="#15181b" stroke="#40454b" strokeWidth="0.3" />
        <circle cx="3.1" cy="3.1" r="1.6" fill="#000" />
      </symbol>
      <symbol id="rp-microsd" viewBox="0 0 12 2">
        <rect x="0" y="0" width="12" height="2" rx="0.4" fill="#07090b" stroke="#3f444a" strokeWidth="0.2" />
      </symbol>

      {/* Hardware. */}
      <symbol id="rp-screw" viewBox="-2.4 -2.4 4.8 4.8">
        <circle r="2.3" fill="url(#rp-screw)" stroke="#4b5157" strokeWidth="0.25" />
        <path d="M-1.2 0 h2.4 M0 -1.2 v2.4" stroke="#3f444a" strokeWidth="0.5" strokeLinecap="round" />
      </symbol>
      <symbol id="rp-screw-black" viewBox="-2.4 -2.4 4.8 4.8">
        <circle r="2.3" fill="#2a2e33" stroke="#0f1113" strokeWidth="0.25" />
        <path d="M-1.2 0 h2.4 M0 -1.2 v2.4" stroke="#0b0c0e" strokeWidth="0.5" strokeLinecap="round" />
      </symbol>
      <symbol id="rp-cagehole" viewBox="0 0 9.5 9.5">
        <rect x="0" y="0" width="9.5" height="9.5" rx="0.6" fill="var(--rack-hole, #1b1f24)" />
        <rect x="0" y="0" width="9.5" height="1.4" fill="#000" fillOpacity="0.45" />
      </symbol>
    </defs>
  );
});

/** Document-level defs referenced by every on-page rack drawing. */
export function GlobalFaceplateDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" focusable="false">
      <FaceplateDefs />
    </svg>
  );
}
