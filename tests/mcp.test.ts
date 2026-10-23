import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { McpClient, McpError, parseSse, toolPayload } from "../lib/wispr/mcp";
import { startMock } from "./support/mock-wispr";

const meetings = [{ id: "m1", title: "Class", start: "2026-10-19T04:05:00Z", end: "2026-10-19T05:59:00Z" }];

async function setup(opts: Parameters<typeof startMock>[0] = {}) {
  const mock = await startMock({ meetings, ...opts });
  const { access } = mock.mintTokens();
  return { mock, access };
}

describe("MCP client", () => {
  const closers: (() => Promise<void>)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });
  const make = async (opts: Parameters<typeof startMock>[0] = {}) => {
    const s = await setup(opts);
    closers.push(s.mock.close);
    return s;
  };

  it("calls a tool over plain JSON", async () => {
    const { mock, access } = await make();
    const client = new McpClient(mock.mcpUrl, access);
    const res = await client.callTool<{ meetings: { id: string }[] }>("search_meetings", {});
    assert.equal(res.meetings[0].id, "m1");
    assert.equal(mock.state.initCount, 1);
  });

  it("calls a tool when the server answers as an event stream", async () => {
    const { mock, access } = await make({ sse: true });
    const res = await new McpClient(mock.mcpUrl, access).callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
  });

  it("reads JSON out of a text block when there is no structured content", async () => {
    const { mock, access } = await make({ structured: false });
    const res = await new McpClient(mock.mcpUrl, access).callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
  });

  it("carries the session id when the server requires one", async () => {
    const { mock, access } = await make({ requireSession: true });
    const client = new McpClient(mock.mcpUrl, access);
    await client.callTool("search_meetings", {});
    await client.callTool("search_meetings", {});
    assert.equal(mock.state.initCount, 1, "initialised once, then reused the session");
  });

  it("recovers when the server forgets the session", async () => {
    const { mock, access } = await make({ requireSession: true });
    const client = new McpClient(mock.mcpUrl, access);
    await client.callTool("search_meetings", {});
    mock.state.sessions.clear(); // server restarted
    const res = await client.callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
    assert.equal(mock.state.initCount, 2);
  });

  it("refreshes the token once on a 401, then succeeds", async () => {
    const { mock } = await make();
    const fresh = mock.mintTokens().access;
    let refreshCalls = 0;
    const client = new McpClient(mock.mcpUrl, "expired-token", async () => {
      refreshCalls++;
      return fresh;
    });
    const res = await client.callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
    assert.equal(refreshCalls, 1);
    // Later calls reuse the fresh token without refreshing again.
    await client.callTool("search_meetings", {});
    assert.equal(refreshCalls, 1);
  });

  it("gives up (no loop) when the refreshed token is also rejected", async () => {
    const { mock } = await make();
    let refreshCalls = 0;
    const client = new McpClient(mock.mcpUrl, "bad", async () => {
      refreshCalls++;
      return "also-bad";
    });
    await assert.rejects(() => client.callTool("search_meetings", {}), (e: McpError) => e.status === 401);
    assert.equal(refreshCalls, 1);
  });

  it("fails with 401 when there is no way to refresh", async () => {
    const { mock } = await make();
    await assert.rejects(() => new McpClient(mock.mcpUrl, "nope").callTool("search_meetings", {}), (e: McpError) => e.status === 401);
  });

  it("surfaces a tool-level error as McpError", async () => {
    const { mock, access } = await make({ failTool: "search_meetings" });
    await assert.rejects(() => new McpClient(mock.mcpUrl, access).callTool("search_meetings", {}), /boom/);
  });
});

describe("parsing helpers", () => {
  it("picks the right message out of an event stream", () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","method":"ping"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n';
    assert.deepEqual(parseSse(body, 7)?.result, { ok: true });
    assert.equal(parseSse(body, 8), null);
    assert.equal(parseSse("event: x\ndata: not json\n\n", 1), null);
  });

  it("extracts JSON after a text prefix, and rejects results without data", () => {
    assert.deepEqual(toolPayload({ content: [{ type: "text", text: 'Data from X.\n{"a":1}' }] }), { a: 1 });
    assert.deepEqual(toolPayload({ content: [{ type: "text", text: "[1,2]" }] }), [1, 2]);
    assert.throws(() => toolPayload({ content: [{ type: "text", text: "no json here" }] }), McpError);
    assert.throws(() => toolPayload({ content: [{ type: "text", text: "{broken" }] }), McpError);
    assert.throws(() => toolPayload({ isError: true, content: [{ type: "text", text: "bad" }] }), /bad/);
  });
});
