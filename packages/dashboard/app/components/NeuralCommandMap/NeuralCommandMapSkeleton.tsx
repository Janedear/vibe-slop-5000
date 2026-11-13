/**
 * Neural Command Map — Loading Skeleton
 *
 * Shown via Suspense fallback while the NCM chunk loads.
 * Renders a dark canvas-shaped placeholder with a subtle pulse
 * so the view feels intentional rather than blank.
 */

import { useEffect, useRef } from "react"
import { NCM_PALETTE } from "./lib/ncm-types"

const TAU = Math.PI * 2

export const NeuralCommandMapSkeleton = (): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = (): void => {
      const dpr = window.devicePixelRatio ?? 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    let t = 0
    const render = (): void => {
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height
      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = NCM_PALETTE.bg
      ctx.fillRect(0, 0, w, h)

      // Pulsing ring placeholders — suggest the nodes that will appear
      const cx = w / 2
      const cy = h / 2
      const pulse = 0.08 + 0.04 * Math.sin(t * 0.0015)

      const rings = [
        { r: 28, x: cx, y: cy },
        { r: 20, x: cx - 130, y: cy + 40 },
        { r: 20, x: cx + 120, y: cy - 50 },
        { r: 16, x: cx - 60, y: cy - 100 },
        { r: 16, x: cx + 70, y: cy + 90 },
      ]

      for (const ring of rings) {
        const grad = ctx.createRadialGradient(ring.x, ring.y, ring.r * 0.4, ring.x, ring.y, ring.r + 12)
        grad.addColorStop(0, NCM_PALETTE.border + Math.round(pulse * 2 * 255).toString(16).padStart(2, "0"))
        grad.addColorStop(1, NCM_PALETTE.border + "00")
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r + 12, 0, TAU)
        ctx.fillStyle = grad
        ctx.fill()

        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, TAU)
        ctx.strokeStyle = NCM_PALETTE.border + Math.round(pulse * 255).toString(16).padStart(2, "0")
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Connecting lines
      ctx.globalAlpha = pulse
      ctx.strokeStyle = NCM_PALETTE.border
      ctx.lineWidth = 1
      for (let i = 1; i < rings.length; i++) {
        ctx.beginPath()
        ctx.moveTo(rings[0].x, rings[0].y)
        ctx.lineTo(rings[i].x, rings[i].y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      t += 16
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ display: "block", background: NCM_PALETTE.bg }}
      aria-hidden="true"
    />
  )
}
