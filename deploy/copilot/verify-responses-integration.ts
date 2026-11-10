import { Hono } from "hono"
import { responsesRoutes } from "/app/src/routes/responses/route"
import { state } from "/app/src/lib/state"

const nativeFetch = globalThis.fetch
state.copilotToken = "synthetic-server-credential"
state.accountType = "individual"
state.manualApprove = false
state.rateLimitSeconds = undefined
let mode = "json"
let captured: RequestInit | undefined
let aborted = false
const terminal = { id: "resp_fixture", object: "response", status: "completed", output: [{ type: "function_call", call_id: "call_fixture", name: "get_weather", arguments: '{"city":"Paris"}' }] }
const event = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: terminal })}\n\n`

globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
  if (!String(url).startsWith("https://api.githubcopilot.com/")) return nativeFetch(url as string, options)
  if (String(url) !== "https://api.githubcopilot.com/responses") throw new Error("Unexpected destination")
  captured = options
  if (mode === "error") return Response.json({ error: { message: "synthetic-server-credential" } }, { status: 400 })
  if (mode === "json") return Response.json(terminal)
  if (mode === "sse") return new Response(event, { headers: { "Content-Type": "text/event-stream" } })
  if (mode === "pending") return new Promise((_, reject) => {
    options!.signal!.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")) }, { once: true })
  })
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setInterval>
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: response.created\ndata: {}\n\n"))
      timer = setInterval(() => { try { controller.enqueue(encoder.encode(": heartbeat\n\n")) } catch { clearInterval(timer) } }, 20)
      options!.signal!.addEventListener("abort", () => { aborted = true; clearInterval(timer); try { controller.close() } catch {} }, { once: true })
    },
    cancel() { clearInterval(timer) },
  }), { headers: { "Content-Type": "text/event-stream" } })
}) as typeof fetch

const app = new Hono().route("/v1/responses", responsesRoutes)
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch })
const endpoint = `http://127.0.0.1:${server.port}/v1/responses`
let checks = 0
function check(ok: unknown, name: string) { if (!ok) throw new Error(name); checks++; console.log("PASS", name) }
function post(payload: unknown, signal?: AbortSignal) {
  return nativeFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-client-credential" }, body: JSON.stringify(payload), signal })
}
try {
  const payload = { model: "gpt-5.4-nano", input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,synthetic" }] }, { type: "function_call_output", call_id: "call_prior", output: "OK" }], tools: [{ type: "function", name: "get_weather", parameters: { type: "object" } }], tool_choice: "required", max_output_tokens: 64 }
  const json = await post(payload)
  check(json.status === 200 && JSON.stringify(await json.json()) === JSON.stringify(terminal), "JSON and tool call preserved")
  check(captured!.body === JSON.stringify(payload), "request fields preserved")
  const headers = captured!.headers as Record<string, string>
  check(headers.Authorization === "Bearer synthetic-server-credential", "client credential replaced")
  check(headers["X-Initiator"] === "agent" && headers["copilot-vision-request"] === "true", "agent and vision headers")
  mode = "sse"
  const sse = await post({ model: "gpt-5.4-nano", input: "OK", stream: true })
  check(await sse.text() === event, "SSE bytes and terminal event preserved")
  mode = "error"
  const error = await post({ model: "rejected", input: "OK" })
  const errorBody = await error.text()
  check(error.status === 400 && errorBody.includes("upstream_error") && !errorBody.includes("synthetic-server-credential"), "upstream error sanitized")
  check((await post({})).status === 400, "missing model rejected")
  check((await post(null)).status === 400, "non-object request rejected")
  check((await nativeFetch(endpoint, { method: "POST", body: "{" })).status === 400, "malformed JSON rejected")
  for (const stage of ["streaming", "pending"]) {
    mode = stage
    aborted = false
    const cancel = new AbortController()
    const pending = post({ model: "gpt-5.4-nano", input: "OK", stream: true }, cancel.signal)
    if (stage === "streaming") {
      const response = await pending
      await response.body!.getReader().read()
      cancel.abort()
    } else {
      await Bun.sleep(50)
      cancel.abort()
      await pending.catch(() => undefined)
    }
    for (let i = 0; i < 40 && !aborted; i++) await Bun.sleep(50)
    check(aborted, `client disconnect aborts upstream while ${stage}`)
  }
  console.log("integration_checks", checks)
} finally {
  server.stop(true)
  globalThis.fetch = nativeFetch
}
