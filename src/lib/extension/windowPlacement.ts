export interface WorkArea {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface SourceWindow {
  left?: number;
  top?: number;
  width?: number;
}

/** Prefer beside the browser; otherwise align within its right edge and work area. */
export function cameraWindowBounds(
  source: SourceWindow | undefined,
  area: WorkArea,
  preferredWidth = 440
): WorkArea {
  const width = Math.min(preferredWidth, area.width),
    height = Math.min(800, area.height);
  const right =
    typeof source?.left === 'number' && typeof source.width === 'number'
      ? source.left + source.width
      : area.left + area.width;
  const beside = right + 12;
  const preferredLeft =
    beside + width <= area.left + area.width ? beside : right - width;
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, value)));
  return {
    left: clamp(preferredLeft, area.left, area.left + area.width - width),
    top: clamp(
      source?.top ?? area.top,
      area.top,
      area.top + area.height - height
    ),
    width,
    height
  };
}
