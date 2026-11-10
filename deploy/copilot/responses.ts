import { Hono } from "hono"
import { stream } from "hono/streaming"
import type { ContentfulStatusCode } from "hono/utils/http-status"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { awaitApproval } from "~/lib/approval"
import { forwardError, HTTPError } from "~/lib/error"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"

export const responsesRoutes = new Hono()

responsesRoutes.post("/", async (c) => {
  try {
    let payload: Record<string, unknown>
    try {
      const value: unknown = await c.req.json()
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return c.json({ error: { type: "invalid_request_error", message: "Expected a JSON object" } }, 400)
      }
      payload = value as Record<string, unknown>
    } catch {
      return c.json({ error: { type: "invalid_request_error", message: "Invalid JSON" } }, 400)
    }
    if (typeof payload.model !== "string" || !payload.model.trim()) {
      return c.json({ error: { type: "invalid_request_error", message: "model is required" } }, 400)
    }

    await checkRateLimit(state)
    if (state.manualApprove) await awaitApproval()
    if (!state.copilotToken) {
      throw new HTTPError("Copilot unavailable", new Response(null, { status: 503 }))
    }

    const input = Array.isArray(payload.input) ? payload.input : []
    const agent = input.some((item: unknown) => {
      if (!item || typeof item !== "object") return false
      const entry = item as Record<string, unknown>
      return entry.role === "assistant" || entry.role === "tool" || entry.type === "function_call_output"
    })
    const vision = input.some((item: unknown) => {
      if (!item || typeof item !== "object") return false
      const entry = item as Record<string, unknown>
      return Array.isArray(entry.content) && entry.content.some((part: unknown) =>
        !!part && typeof part === "object" && (part as Record<string, unknown>).type === "input_image",
      )
    })
    const controller = new AbortController()
    const abort = () => controller.abort()
    const cleanup = () => {
      c.req.raw.signal.removeEventListener("abort", abort)
      controller.abort()
    }
    c.req.raw.signal.addEventListener("abort", abort, { once: true })
    if (c.req.raw.signal.aborted) abort()

    try {
      // Fixed upstream and server-held token; never forward client credentials.
      const response = await fetch(`${copilotBaseUrl(state)}/responses`, {
        method: "POST",
        headers: { ...copilotHeaders(state, vision), "X-Initiator": agent ? "agent" : "user" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new HTTPError("Copilot upstream request failed", response)
      }
      const contentType = response.headers.get("content-type") || ""
      const expectedType = payload.stream === true ? "text/event-stream" : "application/json"
      if (!contentType.toLowerCase().startsWith(expectedType)) {
        await response.body?.cancel()
        throw new HTTPError("Unexpected upstream response", new Response(null, { status: 502 }))
      }
      c.status(response.status as ContentfulStatusCode)
      c.header("Content-Type", expectedType)
      c.header("Cache-Control", "no-store")
      if (payload.stream === true) c.header("X-Accel-Buffering", "no")
      return stream(c, async (output) => {
        output.onAbort(abort)
        try {
          if (response.body) await output.pipe(response.body)
        } catch {
          // Headers may already be sent. Terminate without reflecting exceptions.
          abort()
        } finally {
          cleanup()
        }
      })
    } catch (error) {
      cleanup()
      throw error
    }
  } catch (error) {
    return await forwardError(c, error)
  }
})
