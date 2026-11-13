/**
 * Neural Command Map — Canvas Utilities
 *
 * Browser-compatible drawing helpers. ctx.roundRect shipped in:
 *   Chrome 99 / Edge 99 / Firefox 112 / Safari 15.4
 * Older targets get a manual arcTo fallback.
 */

/** Uniform radius shorthand used throughout NCM canvas code. */
type RoundRectRadius = number | [number, number, number, number]

/**
 * Draw a rounded rectangle path, compatible with all browsers.
 *
 * Usage:
 *   roundRect(ctx, x, y, w, h, 8)
 *   roundRect(ctx, x, y, w, h, [topLeft, topRight, bottomRight, bottomLeft])
 */
export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: RoundRectRadius,
): void => {
  // Use the native API when available (Chrome 99+, Safari 15.4+, FF 112+)
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }

  // arcTo fallback
  const [tl, tr, br, bl] = Array.isArray(radius)
    ? radius
    : [radius, radius, radius, radius]

  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}
