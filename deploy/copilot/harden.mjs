// Applies only to the pinned copilot-api source. Refuse drift rather than
// silently rebuilding an adapter with token routes or broken cancellation.
import { readFileSync, writeFileSync } from "node:fs";

function replace(file, before, after) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) {
    throw new Error(`Pinned adapter source mismatch: ${file}`);
  }
  writeFileSync(file, text.replace(before, after));
}

replace("src/server.ts", 'import { tokenRoute } from "./routes/token/route"\n', "");
replace("src/server.ts", 'server.route("/token", tokenRoute)\n', "");
writeFileSync("src/lib/error.ts", `import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

export class HTTPError extends Error {
  response: Response
  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

// Do not reflect upstream bodies, request headers or runtime exceptions.
export async function forwardError(c: Context, error: unknown) {
  const upstreamStatus = error instanceof HTTPError ? error.response.status : 502
  const status = upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502
  return c.json({error: {message: "Copilot upstream request failed", type: "upstream_error"}}, status as ContentfulStatusCode)
}
`);
replace("src/services/copilot/create-chat-completions.ts",
  "  payload: ChatCompletionsPayload,\n) => {",
  "  payload: ChatCompletionsPayload,\n  signal?: AbortSignal,\n) => {");
replace("src/services/copilot/create-chat-completions.ts",
  '    method: "POST",\n', '    signal,\n    method: "POST",\n');
for (const [file, payload] of [
  ["src/routes/chat-completions/handler.ts", "payload"],
  ["src/routes/messages/handler.ts", "openAIPayload"],
]) {
  replace(file, `  const response = await createChatCompletions(${payload})`,
    `  const controller = new AbortController()\n  c.req.raw.signal.addEventListener("abort", () => controller.abort(), { once: true, signal: controller.signal })\n  if (c.req.raw.signal.aborted) controller.abort()\n  const response = await createChatCompletions(${payload}, controller.signal)`);
  replace(file, "  return streamSSE(c, async (stream) => {",
    "  return streamSSE(c, async (stream) => {\n    stream.onAbort(() => controller.abort())");
}
