export interface VoicePopoverRect { left: number; top: number; right: number; bottom: number; }
export interface VoiceViewport { width: number; height: number; }

export function positionVoicePopover(anchor: VoicePopoverRect, viewport: VoiceViewport, menuWidth = 280): { left: number; top: number; maxHeight: number } {
  const gap = 8;
  const margin = 12;
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - menuWidth - margin));
  const below = viewport.height - anchor.bottom - margin;
  const above = anchor.top - margin;
  const openBelow = below >= 180 || below >= above;
  const availableHeight = Math.max(120, openBelow ? below : above);
  return {
    left,
    top: openBelow ? anchor.bottom + gap : Math.max(margin, anchor.top - Math.min(availableHeight, 360)),
    maxHeight: Math.min(360, availableHeight),
  };
}
