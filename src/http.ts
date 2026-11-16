// Remote MCP server for Claude custom connectors (works from the Claude mobile app, no PC needed).
// 단일 사용자 전용, 다중 사용자 지원 금지 (single user only): one server holds one person's own crack login,
// deployed by that person. Don't add multi-user support (accounts, per-user tokens, shared hosting): taking
// other people's tokens would give third parties access to crack accounts, which crack's terms forbid.
// Run: CRACK_SECRET=<long random> CRACK_PUBLIC_URL=https://<host> node src/http.ts
//
// Every route sits under /<CRACK_SECRET>/ — anyone without the secret gets a bare 404.
//   /<secret>/mcp     MCP endpoint (Streamable HTTP, stateless) — the URL you paste into Claude
//   /<secret>/setup   phone login page: a bookmarklet that hands the crack refresh token to this server
//   /<secret>/token   POST target of the setup page
// ponytail: secret-in-URL instead of OAuth — Claude custom connectors take either no auth or OAuth, not a header.
// The path (secret included) lands in Cloud Run request logs, readable by the project's owners only.
// Fine for one person's connector. Serving others would need its own design (OAuth etc.) and crack's permission.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, hooks, loadTokens, saveTokens, tryRefresh, maskTokens, TOKEN_FILE } from "./index.ts";

const SECRET = process.env.CRACK_SECRET ?? "";
const PUBLIC_URL = (process.env.CRACK_PUBLIC_URL ?? "").replace(/\/$/, "");
if (SECRET.length < 32) throw new Error("CRACK_SECRET 은 32자 이상이어야 해요 (예: openssl rand -hex 32).");
const SETUP_URL = `${PUBLIC_URL}/${SECRET}/setup`;

// "/<secret>/<route>" → "<route>", secret compared in constant time; anything else → undefined (404).
export function route(path: string, secret = SECRET): string | undefined {
  const i = path.indexOf("/", 1);
  if (i < 0) return undefined;
  const got = Buffer.from(path.slice(1, i));
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want) ? path.slice(i + 1) : undefined;
}

// A server has no browser: when tokens run out, tell the user (through Claude) where to log in again.
hooks.loginHelp = `토큰이 만료되면 휴대폰 브라우저에서 설정 페이지(${SETUP_URL})를 열어 안내대로 하면 돼요.`;
hooks.login = async () => {
  throw new Error(`크랙 로그인이 필요해요. 휴대폰 브라우저에서 이 페이지를 열어 안내대로 해 주세요: ${SETUP_URL}`);
};

const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((res, rej) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 1_000_000) req.destroy(); });
    req.on("end", () => res(b)).on("error", rej);
  });

const bookmarklet = () =>
  `javascript:(()=>{const m=document.cookie.match(/(?:^|; )refresh_token=([^;]+)/);` +
  // Exact host: the bookmarklet carries the secret, so it must never run on any page but crack itself.
  `if(location.hostname!=='crack.wrtn.ai'||!m)return alert('crack.wrtn.ai 에 로그인한 상태로, 크랙 페이지에서 눌러 주세요.');` +
  `location.href=${JSON.stringify(SETUP_URL)}+'#'+m[1]})()`;

const setupPage = () => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>crack-mcp 로그인</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#222}
code,textarea{font:13px ui-monospace,monospace}textarea{width:100%;height:110px;box-sizing:border-box}
button{font-size:16px;padding:10px 16px;margin:6px 0}#msg{padding:12px;border-radius:8px;display:none}
.ok{background:#e6f6ea;display:block!important}.err{background:#fde8e8;display:block!important}li{margin:8px 0}</style></head>
<body><h1>crack-mcp 로그인</h1>
<div id="msg"></div>
<p>이 서버가 내 크랙 계정에 접근하려면 로그인 토큰이 한 번 필요해요. <b>14일 안에 한 번이라도 쓰면</b> 서버가 알아서 계속 갱신해서, 다시 할 필요가 없어요.</p>
<ol>
<li>아래 <b>코드 복사</b>를 눌러요.</li>
<li>아무 페이지나 <b>북마크(즐겨찾기)</b>로 저장하고, 그 북마크를 편집해서 이름은 <code>crackmcp</code>, <b>주소(URL)는 복사한 코드</b>로 바꿔 저장해요.</li>
<li>새 탭에서 <a href="https://crack.wrtn.ai" target="_blank" rel="noopener">crack.wrtn.ai</a>에 <b>로그인</b>해요.</li>
<li>그 크랙 탭의 주소창에 <code>crackmcp</code>를 입력하고, 목록에 뜬 <b>북마크를 눌러요</b>. (주소창에 코드를 직접 붙여 넣으면 브라우저가 막아요.)</li>
<li>이 페이지로 돌아오면서 "연결 완료"가 뜨면 끝이에요.</li>
</ol>
<textarea id="code" readonly>${bookmarklet().replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('code').value).then(()=>this.textContent='복사됨')">코드 복사</button>
<p style="color:#666;font-size:14px">이 페이지 주소에는 비밀 키가 들어 있어요. 다른 사람에게 보여 주지 마세요.</p>
<script>
const t = location.hash.slice(1);
if (t) {
  history.replaceState(null, "", location.pathname); // drop the token from the address bar / history
  const msg = document.getElementById("msg");
  msg.textContent = "연결 중…"; msg.className = "ok";
  fetch(location.pathname.replace(/setup$/, "token"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: decodeURIComponent(t) }) })
    .then(async (r) => { msg.textContent = await r.text(); msg.className = r.ok ? "ok" : "err"; })
    .catch((e) => { msg.textContent = "실패: " + e; msg.className = "err"; });
}
</script></body></html>`;

createServer(async (req, res) => {
  const r = route(new URL(req.url ?? "/", "http://x").pathname);
  try {
    if (r === "mcp") {
      // Stateless: a fresh server + transport per request, so no session state to lose between Cloud Run instances.
      const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "null") : undefined;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const server = buildServer();
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
    if (r === "setup" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      return res.end(setupPage());
    }
    if (r === "token" && req.method === "POST") {
      const { refreshToken } = JSON.parse(await readBody(req));
      if (typeof refreshToken !== "string" || refreshToken.split(".").length !== 3) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("토큰 형식이 아니에요. 크랙에 로그인한 탭에서 북마크를 눌렀는지 확인해 주세요.");
      }
      // Swap in the new token only if crack accepts it (this also proves crack doesn't block this server).
      const prev = loadTokens();
      let ok = false;
      try { saveTokens({ refreshToken }); ok = await tryRefresh(); } finally { if (!ok) saveTokens(prev); }
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(ok ? "연결 완료! 이제 Claude에서 크랙 커넥터를 쓸 수 있어요. 이 창은 닫아도 돼요." : "크랙이 이 토큰을 거부했어요. 크랙에서 로그아웃 후 다시 로그인하고 북마크를 다시 눌러 주세요.");
    }
    res.writeHead(404).end();
  } catch (e: any) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(maskTokens(String(e?.message ?? e))); // a JSON.parse error quotes part of the body, which may be a token
  }
}).listen(Number(process.env.PORT ?? 8080), () => console.log(`crack-mcp http on :${process.env.PORT ?? 8080}, tokens at ${TOKEN_FILE}`));
