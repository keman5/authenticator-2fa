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

/** Align to the browser right edge, offset below its top and clamp to the work area. */
export function cameraWindowBounds(
  source: SourceWindow | undefined,
  area: WorkArea,
  preferredWidth = 370,
  topOffset = 85,
  preferredHeight = 800
): WorkArea {
  const width = Math.min(preferredWidth, area.width),
    height = Math.min(preferredHeight, area.height);
  const right =
    typeof source?.left === 'number' && typeof source.width === 'number'
      ? source.left + source.width
      : area.left + area.width;
  const preferredLeft = right - width;
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, value)));
  return {
    left: clamp(preferredLeft, area.left, area.left + area.width - width),
    top: clamp(
      (source?.top ?? area.top) + topOffset,
      area.top,
      area.top + area.height - height
    ),
    width,
    height
  };
}
