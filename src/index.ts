// Crack (crack.wrtn.ai) story MCP server. Unofficial: uses the site's internal API, may break on site updates.
// Writes drafts only (임시저장). Publishing stays manual on the site.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, chmodSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import assert from "node:assert";

const GW = "https://crack-api.wrtn.ai";
const DIR = join(homedir(), ".crack-mcp");
export const TOKEN_FILE = process.env.CRACK_TOKEN_FILE ?? join(DIR, "tokens.json"); // cloud: a mounted bucket path

export type Tokens = { accessToken?: string; refreshToken?: string };

export function loadTokens(): Tokens {
  try { return JSON.parse(readFileSync(TOKEN_FILE, "utf8")); } catch { return {}; }
}

export function saveTokens(t: Tokens) {
  tokens = t;
  mkdirSync(dirname(TOKEN_FILE), { recursive: true });
  // `mode` only applies when the file is created, so tighten an existing file before new tokens go in.
  // Best effort: Windows has no POSIX modes and a mounted bucket may refuse chmod.
  try { chmodSync(TOKEN_FILE, 0o600); } catch {}
  writeFileSync(TOKEN_FILE, JSON.stringify(t), { mode: 0o600 });
}

// Crack tokens are JWTs ("eyJ…"). Hides any of them, even a cut-off piece, before text goes into an error or log.
export const maskTokens = (s: string) => s.replace(/eyJ[\w-]*(?:\.[\w-]*){0,2}/g, "[토큰 가림]");

export function jwtExp(t?: string): number {
  if (!t) return 0;
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).exp * 1000; } catch { return 0; }
}

let tokens = loadTokens();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Keep traffic to crack small (its terms forbid automated access that loads the server). Every crack request
// waits for pace(): at least MIN_INTERVAL_MS between request starts across this whole process, and at most
// MAX_REQUESTS_PER_TOOL_CALL requests per tool call. Today a tool call needs at most ~12
// (save_story_draft: 4 requests, each may refresh the token and retry once after a 401).
const intervalEnv = Number(process.env.CRACK_MIN_INTERVAL_MS?.trim() || NaN);
export const MIN_INTERVAL_MS = Number.isFinite(intervalEnv) && intervalEnv >= 0 ? intervalEnv : 500;
export const MAX_REQUESTS_PER_TOOL_CALL = 20;
const callBudget = new AsyncLocalStorage<{ used: number }>(); // set per tool call in buildServer()
let nextSlot = 0;
async function pace() {
  const budget = callBudget.getStore();
  if (budget && ++budget.used > MAX_REQUESTS_PER_TOOL_CALL)
    throw new Error(`도구 한 번에 크랙 요청이 ${MAX_REQUESTS_PER_TOOL_CALL}회를 넘어서 멈췄어요 (크랙 서버 부하 방지).`);
  const now = Date.now();
  const at = Math.max(now, nextSlot); // reserve the slot synchronously so parallel calls queue up
  nextSlot = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

// Returns false when the refresh token is rejected (→ needs a fresh login).
// One refresh at a time: two parallel tool calls must not both spend the same refresh token.
let refreshing: Promise<boolean> | undefined;
export const tryRefresh = () => (refreshing ??= doRefresh().finally(() => (refreshing = undefined)));
async function doRefresh(): Promise<boolean> {
  const rt = tokens.refreshToken!;
  await pace();
  const r = await fetch(`${GW}/auth/v2/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Platform: "web", Refresh: rt },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (r.status === 401 || r.status === 403) return false;
  const j: any = await r.json().catch(() => ({}));
  // Response: { access_token: "Bearer eyJ…", refresh_token, expires_in } — the site strips "Bearer " too.
  const strip = (v?: string) => v?.replace(/^Bearer\s+/i, "");
  const at = strip(j.access_token);
  if (!r.ok || !at) throw new Error(`토큰 갱신 실패 (${r.status})`);
  saveTokens({ accessToken: at, refreshToken: strip(j.refresh_token) ?? rt });
  return true;
}

const CHROME = [
  process.env.CRACK_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));
const PROFILE = join(DIR, "chrome-profile");

// Reads crack tokens from our Chrome profile by starting it headless with DevTools on.
// The visible login window never has DevTools on, so Google sign-in treats it as a normal browser.
async function readProfileTokens(): Promise<Tokens | undefined> {
  const portFile = join(PROFILE, "DevToolsActivePort");
  rmSync(portFile, { force: true });
  const proc = spawn(CHROME!, [`--user-data-dir=${PROFILE}`, "--headless=new", "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" });
  let ws: WebSocket | undefined;
  try {
    const deadline = Date.now() + 20_000;
    let url = "";
    while (!url) {
      if (Date.now() > deadline || proc.exitCode !== null) throw new Error("크롬(헤드리스)을 띄우지 못했어요. 로그인 창이 열려 있으면 닫아주세요.");
      try { const [port, path] = readFileSync(portFile, "utf8").split("\n"); url = `ws://127.0.0.1:${port}${path}`; } catch { await sleep(200); }
    }
    ws = new WebSocket(url);
    await new Promise((res, rej) => { ws!.onopen = res; ws!.onerror = rej; });
    const { result } = await new Promise<any>((res) => { ws!.onmessage = (e) => res(JSON.parse(String(e.data))); ws!.send(JSON.stringify({ id: 1, method: "Storage.getCookies" })); });
    const get = (n: string) => {
      const v = result.cookies.find((c: any) => c.name === n && c.domain.endsWith("wrtn.ai"))?.value;
      return v ? decodeURIComponent(v) : undefined;
    };
    const rt = get("refresh_token");
    return rt && jwtExp(rt) > Date.now() ? { accessToken: get("access_token"), refreshToken: rt } : undefined;
  } finally {
    ws?.close();
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r(0) : proc.once("exit", r)));
  }
}

// Logs in via our own Chrome profile. Already logged in there → no window at all.
// Otherwise opens a normal Chrome window; the user logs in and closes it.
export async function browserLogin(timeoutMs = 10 * 60_000) {
  if (!CHROME) throw new Error("크롬을 못 찾았어요. CRACK_BROWSER 환경변수에 chrome.exe 경로를 넣어주세요.");
  mkdirSync(PROFILE, { recursive: true });
  let t = await readProfileTokens();
  if (!t) {
    const win = spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "https://crack.wrtn.ai/"], { stdio: "ignore" });
    const timer = setTimeout(() => win.kill(), timeoutMs);
    await new Promise((r) => win.once("exit", r));
    clearTimeout(timer);
    t = await readProfileTokens();
  }
  if (!t) throw new Error("크랙 로그인 정보를 못 찾았어요. 창에서 로그인한 뒤 창을 닫아야 해요.");
  saveTokens(t);
}

// How to get fresh tokens when refresh fails. Local: Chrome login. Cloud (src/http.ts) swaps this for
// "open the setup page on your phone", since a server has no browser.
export const hooks = { login: browserLogin as () => Promise<void>, loginHelp: "로그인 창이 뜨면 로그인하고 창을 닫아 주세요." };

async function ensureAccess() {
  if (jwtExp(tokens.accessToken) > Date.now() + 60_000) return;
  if (jwtExp(tokens.refreshToken) > Date.now() && (await tryRefresh())) return;
  await hooks.login();
}

export async function api(method: string, path: string, body?: unknown, retried = false): Promise<any> {
  await ensureAccess();
  await pace();
  const r = await fetch(`${GW}/crack-api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      platform: "web",
      "wrtn-locale": "ko-KR",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && !retried) { tokens.accessToken = undefined; return api(method, path, body, true); }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(maskTokens(`${method} ${path} → ${r.status}: ${j.message ?? JSON.stringify(j).slice(0, 300)}`));
  return j.data;
}


// Shape the site sends to POST /story-drafts/v2 — field list taken from the site's own serializer (2026-11-16),
// so editing a story keeps its tags, chat examples, play guide, stats, endings, etc.
export function toDraftBody(s: any) {
  return {
    storyId: s.storyId ?? s._id,
    name: s.name,
    simpleDescription: s.simpleDescription,
    description: s.description,
    detailDescription: s.detailDescription,
    storyDetails: s.storyDetails,
    customPrompt: s.customPrompt,
    tags: s.tags ?? [],
    chatExamples: (s.chatExamples ?? []).map((e: any) => ({ user: e.user, character: e.character })),
    promptTemplate: typeof s.promptTemplate === "object" ? s.promptTemplate?.template : s.promptTemplate,
    genreId: s.genreId ?? s.genre?._id,
    target: s.target,
    chatType: s.chatType,
    chatModelId: s.chatModelId,
    defaultCrackerModel: s.defaultCrackerModel,
    visibility: s.visibility,
    isAdult: s.isAdult,
    isCommentBlocked: s.isCommentBlocked,
    isMovingPortraitImage: s.isMovingPortraitImage ?? false,
    portraitImageUrl: s.portraitImageUrl ?? s.portraitImage?.origin,
    situationImageVersion: s.situationImageVersion ?? "v2",
    shortcutCommands: s.shortcutCommands ?? [],
    creatorRecommendedMaxOutput: s.creatorRecommendedMaxOutput,
    _keywordBook: s.keywordBook ?? [],
    _situationImages: s.situationImages ?? [],
    startingSets: (s.startingSets ?? []).map((ss: any) => ({
      baseSetId: ss.baseSetId,
      name: ss.name,
      initialMessages: ss.initialMessages ?? [],
      situationPrompt: ss.situationPrompt ?? "",
      playGuide: ss.playGuide ?? "",
      replySuggestions: ss.replySuggestions ?? [],
      situationImages: ss.situationImages ?? [],
      keywordBook: ss.keywordBook ?? [],
      parameters: ss.parameters ?? [],
      ...(ss.ending ? { ending: ss.ending } : {}),
      ...(ss.imageMatrix ? { imageMatrix: ss.imageMatrix } : {}),
    })),
  };
}

// Crack's limits (2026-11-16). Every value below was checked against the server's own validator by
// test/limits.live.ts — limit passes, limit+1 is rejected. Where the site's input box is stricter than
// the server, we keep the stricter value so what MCP saves still edits cleanly in the site.
// Length = JS string length (UTF-16 units), same as the site's maxLength.
export const LIMITS = {
  api: { listStories: 30, listDrafts: 40 },
  name: [2, 30], // 특수문자·이모지 불가 (서버가 검사)
  simpleDescription: 30,
  customPrompt: { v2: 7000, v1: 5000 }, // situationImageVersion 기준
  storyDetails: { v2: 5000, v1: 3000 },
  description: 1000, // description, detailDescription 둘 다 서버 1000
  tags: { count: 10, length: 10 }, // 길이 10은 입력칸 기준 — 서버는 길이 제한 없음
  chatExamples: { count: 3, user: 500, character: 500 },
  shortcutCommands: { count: 20, name: 10, description: 30, prompt: 400 },
  keywordBook: { perSet: 20, total: 60, keywords: 5, keywordLength: 10, prompt: 400 }, // 시작설정마다 20개 (전체 60 = 3×20). 키워드 10자는 서버 기준 (사이트 코드의 20은 틀림)
  startingSets: 3, // 기본 + 추가 2개. 서버 메시지는 "2개까지"라고 나오지만 3개까지 통과
  startingSet: { name: 12, prologue: 1000, situationPrompt: 1000, playGuide: 500, replySuggestions: 3, replyLength: 200 }, // 추천 답변 200자는 입력칸 기준 — 서버는 500
  stat: { perSet: 7, name: 10, unit: 3, prompt: 500, levels: 4, levelName: 10, levelPrompt: 100 },
  // 레벨 구간: 첫 levelMinValue = 스탯 min, 마지막 levelMaxValue = 스탯 max, 다음 min = 이전 max (예: 0-50, 50-100). 화면은 레벨을 켜면 최소 2개
  ending: { perSet: 10, name: 20, conditionPrompt: 500, epilogueExample: 1000, hint: 20 },
  // 아래는 MCP가 다루지 않는 항목 — 참고용
  image: { mb: 5, profilePx: "1080x1620", situationImages: 1600, perUpload: 1000, axisName: 10, axes: 80 },
  addon: { name: 12, description: 1000, perCategory: 100, categories: 10 },
} as const;

export function checkLimits(b: any): string[] {
  const L = LIMITS;
  const errs: string[] = [];
  const str = (v: any, max: number, label: string, min = 0) => {
    if (typeof v === "string" && (v.length > max || v.length < min))
      errs.push(`${label}: ${v.length}자 (허용 ${min ? `${min}~` : ""}${max}자)`);
  };
  const arr = (v: any, max: number, label: string): any[] => {
    if (!Array.isArray(v)) return [];
    if (v.length > max) errs.push(`${label}: ${v.length}개 (최대 ${max}개)`);
    return v;
  };
  const val = (x: any) => (typeof x === "string" ? x : x?.value);
  const kb = (list: any[], label: string) =>
    list.forEach((k, i) => {
      arr(k?.keywords, L.keywordBook.keywords, `${label}[${i}] 키워드`).forEach((w, j) =>
        str(val(w), L.keywordBook.keywordLength, `${label}[${i}] 키워드[${j}]`));
      str(k?.prompt, L.keywordBook.prompt, `${label}[${i}] 정보`);
    });
  const v = (b.situationImageVersion ?? "v2") === "v2" ? "v2" : "v1";

  str(b.name, L.name[1], "이름", L.name[0]);
  str(b.simpleDescription, L.simpleDescription, "한 줄 소개");
  str(b.customPrompt, L.customPrompt[v], "프롬프트");
  str(b.storyDetails, L.storyDetails[v], "스토리 상세");
  str(b.description, L.description, "설명");
  str(b.detailDescription, L.description, "상세 설명");
  arr(b.tags, L.tags.count, "해시태그").forEach((t, i) => str(val(t), L.tags.length, `해시태그[${i}]`));
  arr(b.chatExamples, L.chatExamples.count, "전개 예시").forEach((e, i) => {
    str(e?.user, L.chatExamples.user, `전개 예시[${i}] 유저`);
    str(e?.character, L.chatExamples.character, `전개 예시[${i}] 캐릭터`);
  });
  arr(b.shortcutCommands, L.shortcutCommands.count, "단축어").forEach((c, i) => {
    str(c?.name, L.shortcutCommands.name, `단축어[${i}] 이름`);
    str(c?.description, L.shortcutCommands.description, `단축어[${i}] 설명`);
    str(c?.prompt, L.shortcutCommands.prompt, `단축어[${i}] 내용`);
  });
  kb(arr(b._keywordBook, L.keywordBook.total, "키워드북 전체"), "키워드북");
  arr(b.startingSets, L.startingSets, "시작설정").forEach((s: any, i: number) => {
    const p = `시작설정[${i}]`, S = L.startingSet;
    str(s?.name, S.name, `${p} 이름`);
    (s?.initialMessages ?? []).forEach((m: any) => str(val(m), S.prologue, `${p} 프롤로그`));
    str(s?.situationPrompt, S.situationPrompt, `${p} 시작 상황`);
    str(s?.playGuide, S.playGuide, `${p} 플레이 가이드`);
    arr(s?.replySuggestions, S.replySuggestions, `${p} 추천 답변`).forEach((r, j) => str(val(r), S.replyLength, `${p} 추천 답변[${j}]`));
    arr(s?.parameters, L.stat.perSet, `${p} 스탯`).forEach((st, j) => {
      str(st?.name, L.stat.name, `${p} 스탯[${j}] 이름`);
      str(st?.unit, L.stat.unit, `${p} 스탯[${j}] 단위`);
      str(st?.prompt, L.stat.prompt, `${p} 스탯[${j}] 설명`);
      arr(st?.levels, L.stat.levels, `${p} 스탯[${j}] 레벨`).forEach((lv, k) => {
        str(lv?.name, L.stat.levelName, `${p} 스탯[${j}] 레벨[${k}] 이름`);
        str(lv?.levelPrompt, L.stat.levelPrompt, `${p} 스탯[${j}] 레벨[${k}] 프롬프트`);
      });
    });
    arr(s?.ending?.endings, L.ending.perSet, `${p} 엔딩`).forEach((e, j) => {
      str(e?.name, L.ending.name, `${p} 엔딩[${j}] 이름`);
      str(e?.conditionPrompt, L.ending.conditionPrompt, `${p} 엔딩[${j}] 조건`);
      str(e?.epilogueExample, L.ending.epilogueExample, `${p} 엔딩[${j}] 에필로그`);
      str(e?.hint, L.ending.hint, `${p} 엔딩[${j}] 힌트`);
    });
    kb(arr(s?.keywordBook, L.keywordBook.perSet, `${p} 키워드북`), `${p} 키워드북`);
  });
  return errs;
}

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

export function buildServer() {
const server = new McpServer({ name: "crack", version: "0.1.0" });
// Every tool call runs with its own request budget (see pace()).
const register = server.registerTool.bind(server);
server.registerTool = ((name: string, config: any, cb: (...a: any[]) => any) =>
  register(name, config, (...a: any[]) => callBudget.run({ used: 0 }, () => cb(...a)))) as typeof server.registerTool;

server.registerTool("list_my_stories", {
  description: "내 크랙 스토리 목록. storyId는 다른 도구에 넘길 ID.",
  inputSchema: { limit: z.number().int().min(1).max(LIMITS.api.listStories).default(20), cursor: z.string().optional() },
}, async ({ limit, cursor }) => {
  const q = new URLSearchParams({ limit: String(limit), type: "story", sort: "createdAt", ...(cursor ? { cursor } : {}) });
  const d = await api("GET", `/content/me?${q}`);
  return text({
    stories: d.contents.map((c: any) => ({ storyId: c.sourceId, name: c.name, simpleDescription: c.simpleDescription, visibility: c.visibility, latestVersion: c.latestVersion })),
    nextCursor: d.nextCursor, totalCount: d.totalCount,
  });
});

server.registerTool("get_story", {
  description: "공개된(최신 버전) 스토리의 편집용 전체 설정. 프롬프트, 시작 설정(첫 메시지) 포함.",
  inputSchema: { storyId: z.string() },
}, async ({ storyId }) => text(toDraftBody(await api("GET", `/stories/me/${storyId}`))));

server.registerTool("list_story_drafts", {
  description: "스토리의 임시저장 목록 (최신순).",
  inputSchema: { storyId: z.string(), limit: z.number().int().min(1).max(LIMITS.api.listDrafts).default(10) },
}, async ({ storyId, limit }) => {
  const d = await api("GET", `/story-drafts?storyId=${storyId}&limit=${limit}`);
  return text(d.storyDrafts.map((x: any) => ({ draftId: x._id, name: x.name, updatedAt: x.updatedAt })));
});

server.registerTool("get_story_draft", {
  description: "임시저장본 하나의 전체 설정.",
  inputSchema: { draftId: z.string() },
}, async ({ draftId }) => text(toDraftBody(await api("GET", `/story-drafts/${draftId}`))));

server.registerTool("save_story_draft", {
  description:
    "스토리를 임시저장한다 (공개/수정 반영은 사이트에서 직접). storyId가 있으면 최신 임시저장본(없으면 공개본)을 불러와 changes만 덮어쓴다. " +
    "storyId가 없으면 새 스토리를 만든다. changes 키는 get_story 출력과 같은 이름 (name, simpleDescription, description, detailDescription, customPrompt, startingSets 등). " +
    "저장 전에 크랙 제한을 검사해 넘으면 저장하지 않고 초과 항목을 알려준다. 주요 제한: 이름 2~30자, 한 줄 소개 30자, 프롬프트 7000자, " +
    "시작설정 이름 12자·프롤로그 1000자·시작 상황 1000자·추천 답변 3개×200자, 시작설정 최대 3개, 키워드북 시작설정당 20개·키워드 5개×10자·정보 400자, 해시태그 10개×10자. 전체 표는 get_limits.",
  inputSchema: { storyId: z.string().optional(), changes: z.record(z.string(), z.unknown()) },
}, async ({ storyId, changes }) => {
  let base: any;
  let published = false; // never-published stories only open via type=create on the site
  if (storyId) {
    const drafts = await api("GET", `/story-drafts?storyId=${storyId}&limit=1`);
    const latest = drafts.storyDrafts[0];
    const live = await api("GET", `/stories/me/${storyId}`).catch(() => undefined);
    published = !!live;
    if (!latest && !live) throw new Error("스토리를 찾을 수 없어요: " + storyId);
    base = toDraftBody(latest ? await api("GET", `/story-drafts/${latest._id}`) : live);
  } else {
    // New story: the site first reserves an id with POST /temp-stories, then drafts against it.
    base = { storyId: await api("POST", "/temp-stories"), visibility: "private", startingSets: [] };
  }
  const body = { ...base, ...changes, storyId: base.storyId };
  // The site only uses customPrompt under the "custom" template; new stories start on "default",
  // where a written prompt would be saved but silently ignored.
  if (typeof changes.customPrompt === "string" && changes.promptTemplate === undefined) body.promptTemplate = "custom";
  const over = checkLimits(body);
  if (over.length) throw new Error("크랙 제한 초과라 저장하지 않았어요:\n- " + over.join("\n- "));
  const d = await api("POST", "/story-drafts/v2", body);
  return text({
    storyId: body.storyId,
    draftId: d.storyDraftId,
    editUrl: `https://crack.wrtn.ai/builder/story?type=${published ? "edit" : "create"}&storyId=${body.storyId}`,
  });
});

server.registerTool("get_limits", {
  description: "크랙 스토리 빌더의 글자 수·개수 제한 전체 표.",
  inputSchema: {},
}, async () => text(LIMITS));

server.registerTool("login", {
  description: "크랙 로그인을 다시 한다. " + hooks.loginHelp + " 보통은 필요할 때 자동으로 안내되니 직접 부를 일은 거의 없음.",
  inputSchema: {},
}, async () => { await hooks.login(); return text("로그인 완료"); });

return server;
}

if (!import.meta.main) {
  // imported (e.g. by test/live.ts): expose functions only, no server
} else if (process.argv[2] === "--login") {
  await browserLogin();
  console.log("로그인 완료, 토큰 저장됨:", TOKEN_FILE);
} else if (process.argv[2] === "--selftest") {
  // Offline checks: no network.
  const fake = `x.${Buffer.from(JSON.stringify({ exp: 2000000000 })).toString("base64url")}.y`;
  assert(jwtExp(fake) === 2000000000000, "jwtExp");
  const b = toDraftBody({ _id: "s1", promptTemplate: { template: "custom" }, genre: { _id: "g" }, portraitImage: { origin: "u" }, startingSets: [{ name: "a" }] });
  assert(b.storyId === "s1" && b.promptTemplate === "custom" && b.genreId === "g" && b.portraitImageUrl === "u", "toDraftBody map");
  assert(b.startingSets[0].situationPrompt === "" && Array.isArray(b.startingSets[0].parameters), "startingSets defaults");
  const ok = { name: "가나", customPrompt: "x".repeat(7000), startingSets: [{ name: "x".repeat(12), replySuggestions: ["a", "b", "c"] }] };
  assert.deepEqual(checkLimits(ok), [], "at-limit passes");
  const bad = checkLimits({
    name: "가", customPrompt: "x".repeat(7001), tags: Array(11).fill("t"),
    startingSets: [{ name: "x".repeat(13), keywordBook: [{ keywords: ["a", "b", "c", "d", "e", "f"], prompt: "x".repeat(401) }] }],
  });
  assert.deepEqual(checkLimits({ startingSets: Array(4).fill({ name: "a" }) }).length, 1, "starting set count");
  assert.deepEqual(checkLimits({ startingSets: [{ parameters: [{ levels: Array(5).fill({ name: "x".repeat(11) }) }] }] }).length, 6, "levels count + names");
  assert.equal(bad.length, 6, "each over-limit field reported: " + bad.join(" | "));
  assert.deepEqual(checkLimits({ situationImageVersion: "v1", customPrompt: "x".repeat(5001) }).length, 1, "v1 prompt cap");
  console.log("selftest ok");
} else {
  await buildServer().connect(new StdioServerTransport());
}
