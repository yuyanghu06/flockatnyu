// Clamp the full portrait + thought bubble into the existing focused screen frame.
export function clampFocusedAvatarPosition({ x, y, frame, size, noteWidth = 0, noteHeight = 0, padding = 8 }) {
  if (frame.width <= 0 || frame.height <= 0) return { u: 0.5, v: 0.5 };
  const radius = size / 2;
  const side = Math.max(radius, noteWidth / 2) + padding;
  const top = radius + (noteHeight ? 16 + noteHeight : 0) + padding;
  const bottom = radius + padding;
  const clamp = (value, low, high) => low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value));
  const centerX = clamp(x, frame.left + side, frame.left + frame.width - side);
  const centerY = clamp(y, frame.top + top, frame.top + frame.height - bottom);
  return { u: (centerX - frame.left) / frame.width, v: (centerY - frame.top) / frame.height };
}
