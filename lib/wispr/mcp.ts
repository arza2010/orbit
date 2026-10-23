import "server-only";

// A small client for MCP servers over Streamable HTTP. Handles JSON and SSE replies, the optional
// session id, and a single token refresh when the server answers 401.

export class McpError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const PROTOCOL = "2025-06-18";

type RpcMessage = { jsonrpc: "2.0"; id?: number | string; result?: unknown; error?: { code: number; message: string } };

/** Pulls the JSON-RPC response with a given id out of an SSE body. */
export function parseSse(body: string, id: number): RpcMessage | null {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as RpcMessage;
      if (msg.id === id) return msg;
    } catch {
      /* not a JSON event */
    }
  }
  return null;
}

/** Tool results arrive as structured JSON, or as JSON inside a text block (sometimes after a short prefix). */
export function toolPayload<T>(result: unknown): T {
  const r = result as { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
  if (r?.isError) {
    throw new McpError(r.content?.find((c) => c.type === "text")?.text?.slice(0, 200) ?? "The tool reported an error");
  }
  if (r?.structuredContent !== undefined && r.structuredContent !== null) return r.structuredContent as T;
  const text = r?.content?.find((c) => c.type === "text")?.text ?? "";
  const start = text.search(/[{[]/);
  if (start === -1) throw new McpError("The tool returned no data");
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    throw new McpError("The tool returned data in an unexpected format");
  }
}

export class McpClient {
  private sessionId: string | null = null;
  private ready = false;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private token: string,
    /** Called once on a 401. Returns a fresh access token, or throws. */
    private readonly refresh?: () => Promise<string>,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.ready) h["MCP-Protocol-Version"] = PROTOCOL;
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  private async post(payload: object, allowRefresh = true): Promise<Response> {
    const res = await fetch(this.url, { method: "POST", headers: this.headers(), body: JSON.stringify(payload), cache: "no-store" });
    if (res.status === 401 && allowRefresh && this.refresh) {
      this.token = await this.refresh();
      return this.post(payload, false);
    }
    return res;
  }

  private async rpc(method: string, params: object): Promise<unknown> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: "2.0", id, method, params });

    if (res.status === 404 && this.sessionId) {
      // The server dropped our session. Start over once.
      this.sessionId = null;
      this.ready = false;
      await this.init();
      return this.rpc(method, params);
    }
    if (!res.ok) throw new McpError(`Wispr returned HTTP ${res.status}`, res.status);

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const text = await res.text();
    const msg: RpcMessage | null = res.headers.get("content-type")?.includes("text/event-stream")
      ? parseSse(text, id)
      : (JSON.parse(text) as RpcMessage);
    if (!msg) throw new McpError("Wispr sent no reply to the request");
    if (msg.error) throw new McpError(msg.error.message.slice(0, 200));
    return msg.result;
  }

  private async init(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "orbit", version: "1.0.0" },
    });
    this.ready = true;
    // Best effort: servers that do not track sessions answer 202 or ignore it.
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false).catch(() => undefined);
  }

  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.ready) await this.init();
    return toolPayload<T>(await this.rpc("tools/call", { name, arguments: args }));
  }
}
