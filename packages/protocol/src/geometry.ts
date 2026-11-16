export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The rectangle a video actually occupies inside its element under `object-fit: contain`,
 * relative to the element's top-left corner.
 */
export function contentRect(element: Size, video: Size): Rect {
  if (!(video.width > 0 && video.height > 0) || !(element.width > 0 && element.height > 0)) {
    return { left: 0, top: 0, width: element.width, height: element.height };
  }
  const scale = Math.min(element.width / video.width, element.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return {
    left: (element.width - width) / 2,
    top: (element.height - height) / 2,
    width,
    height,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Element-relative pixel point → shared-tab-viewport-normalized point (0..1). */
export function normalizeInRect(
  point: Point,
  rect: Rect,
  options: { clamp?: boolean } = {},
): Point | null {
  if (!(rect.width > 0 && rect.height > 0) || !Number.isFinite(point.x + point.y)) return null;
  const x = (point.x - rect.left) / rect.width;
  const y = (point.y - rect.top) / rect.height;
  if (options.clamp) return { x: clamp01(x), y: clamp01(y) };
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** Normalized point → pixels in the host tab's viewport. */
export function denormalize(point: Point, viewport: Size): Point {
  return { x: point.x * viewport.width, y: point.y * viewport.height };
}

/**
 * Where the shared tab's viewport appears inside a guest's <video> element.
 * First fit the video frame into the element (object-fit: contain), then, if Chrome
 * letterboxed the tab inside the captured frame, fit the tab's viewport into that frame.
 */
export function sharedContentRect(element: Size, videoFrame: Size, viewport: Size | null): Rect {
  const frame = contentRect(element, videoFrame);
  if (!viewport) return frame;
  const inner = contentRect({ width: frame.width, height: frame.height }, viewport);
  return {
    left: frame.left + inner.left,
    top: frame.top + inner.top,
    width: inner.width,
    height: inner.height,
  };
}
