import React, { useCallback, useState } from 'react';
import type { ColorSelector, StructuralRole, InterpretiveRole } from '../types/palette';
import { rgbToHex } from '../lib/colorConversion';

interface Props {
  selector: ColorSelector;
  index: number;
  structuralRole?: StructuralRole;
  interpretiveRole?: InterpretiveRole;
}

const ROLE_LABELS: Record<StructuralRole, string> = {
  base:      'BASE',
  support:   'SUPP',
  accent:    'ACNT',
  separator: 'SEP',
  signal:    'SIG',
};

export default function PaletteSwatch({ selector, index, structuralRole, interpretiveRole }: Props) {
  const [copied, setCopied] = useState(false);
  const hex = rgbToHex(selector.color);
  const { r, g, b } = selector.color;

  const copyHex = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      const el = document.createElement('textarea');
      el.value = hex;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [hex]);

  const isDark = (r * 0.299 + g * 0.587 + b * 0.114) < 128;
  const fg = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)';
  const fgMuted = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';

  return (
    <div
      className="swatch"
      style={{ background: `rgb(${r},${g},${b})` }}
      title={`Swatch ${index + 1}: ${hex}${structuralRole ? ` · ${structuralRole}` : ''}`}
    >
      <div className="swatch__top">
        <span className="swatch__index" style={{ color: fgMuted }}>{index + 1}</span>
        {structuralRole && (
          <span className="swatch__role" style={{ color: fgMuted }}>
            {ROLE_LABELS[structuralRole]}
          </span>
        )}
      </div>
      <div className="swatch__info">
        <button
          className="swatch__hex"
          style={{ color: fg }}
          onClick={copyHex}
          title="Copy HEX"
        >
          {copied ? 'Copied!' : hex.toUpperCase()}
        </button>
        <div className="swatch__bottom">
          <span className="swatch__rgb" style={{ color: fgMuted }}>
            {r} {g} {b}
          </span>
          {interpretiveRole && (
            <span className="swatch__interp" style={{ color: fgMuted }}>
              {interpretiveRole}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
