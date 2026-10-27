// One layout contract for the selected building's camera and activity card.
export function mapFocusLayout(width, height) {
  const compact = width <= 600,
    margin = compact ? Math.min(80, height * 0.095) : 24;
  const cardWidth = compact ? width - 24 : Math.max(120, Math.min(460, width * 0.52 - 32));
  const maxHeight = compact ? height * 0.32 : height - 48;
  const left = compact ? 12 : width - cardWidth - 24;
  return {
    card: { left, width: cardWidth, maxHeight, bottomAligned: compact, margin },
    frame: {
      left: compact ? 16 : 24,
      right: compact ? width - 16 : left - 24,
      top: 24,
      bottom: compact ? height - maxHeight - margin - 16 : height - 24,
      width,
      height,
    },
  };
}
