// Live check of the remote (connector) server, exactly as Claude reaches it: MCP over HTTPS.
// Run: CRACK_MCP_URL=https://<host>/<secret>/mcp node test/http.live.ts
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.CRACK_MCP_URL;
if (!URL_?.endsWith("/mcp")) throw new Error("CRACK_MCP_URL=https://<host>/<secret>/mcp 를 넣어 주세요.");
const base = URL_.slice(0, -"/mcp".length);
const origin = new URL(URL_).origin;
const step = (label: string, ok: boolean, info = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label}${info ? " — " + info : ""}`); assert(ok, label); };

const client = new Client({ name: "http-live-test", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
const tools = (await client.listTools()).tools.map((t) => t.name).sort();
step("tools/list", tools.length === 7, tools.join(", "));

const r: any = await client.callTool({ name: "list_my_stories", arguments: { limit: 5 } });
const list = r.isError ? null : JSON.parse(r.content[0].text);
step("list_my_stories (크랙 API 도달)", !!list?.stories?.length, r.isError ? r.content[0].text : `${list.totalCount}개`);

const lim: any = await client.callTool({ name: "get_limits", arguments: {} });
step("get_limits", JSON.parse(lim.content[0].text).startingSets === 3);
await client.close();

// Everything outside /<secret>/ must look like nothing is there.
const secret = new URL(URL_).pathname.split("/")[1];
const nearMiss = secret.slice(0, -1) + (secret.endsWith("0") ? "1" : "0"); // same length, one char off
for (const p of ["/", "/mcp", "/setup", `/${"x".repeat(64)}/mcp`, `/${nearMiss}/mcp`, `/${nearMiss}/setup`]) {
  const s = (await fetch(origin + p)).status;
  step(`비밀 키 없는 주소 ${p.slice(0, 20)} → 404`, s === 404, String(s));
}
const setup = await fetch(base + "/setup");
const page = setup.ok ? await setup.text() : "";
step("설정 페이지", page.includes("javascript:"));
step("북마크는 crack.wrtn.ai 에서만 동작", page.includes("location.hostname!=='crack.wrtn.ai'"));
const bad = await fetch(base + "/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: "not-a-token" }) });
step("가짜 토큰은 거부", bad.status === 400);

// The bad token must not have replaced the good one.
const c2 = new Client({ name: "http-live-test", version: "0" });
await c2.connect(new StreamableHTTPClientTransport(new URL(URL_)));
const again: any = await c2.callTool({ name: "list_my_stories", arguments: { limit: 1 } });
step("가짜 토큰 뒤에도 정상 동작", !again.isError);
await c2.close();
