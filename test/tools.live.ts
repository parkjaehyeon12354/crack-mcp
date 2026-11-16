// Live end-to-end: every MCP tool over stdio, on a throwaway test story. Creates drafts there, deletes them after.
// Run: CRACK_TEST_STORY_ID=<id> node test/tools.live.ts
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert";
import { api } from "../src/index.ts";

// A throwaway story of yours to write test drafts into (drafts are deleted after). Never use a real story.
const SID = process.env.CRACK_TEST_STORY_ID;
if (!SID) throw new Error("CRACK_TEST_STORY_ID 에 테스트용 스토리 ID를 넣어주세요 (README '테스트' 참고).");
const p = spawn("node", [fileURLToPath(new URL("../src/index.ts", import.meta.url))], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "", n = 0;
const wait = new Map<number, (m: any) => void>();
p.stdout.on("data", (d) => {
  buf += d;
  for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) { const m = JSON.parse(buf.slice(0, i)); wait.get(m.id)?.(m); }
});
const rpc = (method: string, params: any) => new Promise<any>((r) => { wait.set(++n, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
const call = async (name: string, args: any) => {
  const m = await rpc("tools/call", { name, arguments: args });
  const t = m.result.content[0].text;
  return { error: !!m.result.isError, text: t, json: m.result.isError ? null : JSON.parse(t) };
};
const step = (label: string, ok: boolean, info = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label}${info ? " — " + info : ""}`); assert(ok, label); };

const made: string[] = [];
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const tools = (await rpc("tools/list", {})).result.tools.map((t: any) => t.name).sort();
  step("tools/list", tools.join() === "get_limits,get_story,get_story_draft,list_my_stories,list_story_drafts,login,save_story_draft", tools.join(", "));

  const list = await call("list_my_stories", { limit: 30 });
  step("list_my_stories (30)", !list.error && list.json.stories.length > 0, `${list.json?.totalCount}개`);
  step("list_my_stories 31은 막힘", (await call("list_my_stories", { limit: 31 })).error);

  const pub = list.json.stories[0].storyId;
  const story = await call("get_story", { storyId: pub });
  step("get_story", !story.error && typeof story.json.customPrompt === "string", `${story.json?.name}, 프롬프트 ${story.json?.customPrompt?.length}자`);

  const limits = await call("get_limits", {});
  step("get_limits", limits.json?.keywordBook?.keywordLength === 10);

  // Save rich content, then change only the name: everything else must survive.
  const rich = {
    tags: ["테스트", "MCP"],
    chatExamples: [{ user: "안녕", character: "반가워" }],
    shortcutCommands: [{ name: "상태", description: "상태창 보기", prompt: "현재 상태를 보여줘" }],
    startingSets: [{
      name: "기본 설정", initialMessages: ["안녕"], situationPrompt: "교실", playGuide: "가이드",
      replySuggestions: ["응", "아니"],
      keywordBook: [{ name: "학교", prompt: "학교 설정", keywords: ["학교", "교실"] }],
      parameters: [{ name: "호감도", unit: "", min: 0, max: 100, initialValue: 0, prompt: "다정하면 증가" }],
      ending: { endings: [{ name: "해피엔딩", conditionPrompt: "호감도 100", epilogueExample: "행복했다", hint: "잘해줘" }] },
    }],
  };
  const s0 = await call("save_story_draft", { storyId: SID, changes: { promptTemplate: "default" } });
  made.push(s0.json.draftId);
  const s1 = await call("save_story_draft", { storyId: SID, changes: { name: "MCP테스트", customPrompt: "테스트 프롬프트", ...rich } });
  step("save_story_draft (전체 항목)", !s1.error, s1.error ? s1.text : s1.json.draftId);
  made.push(s1.json.draftId);

  const s2 = await call("save_story_draft", { storyId: SID, changes: { name: "MCP테스트 이름만" } });
  step("save_story_draft (이름만)", !s2.error, s2.error ? s2.text : s2.json.draftId);
  made.push(s2.json.draftId);

  const back = (await call("get_story_draft", { draftId: s2.json.draftId })).json;
  const ss = back.startingSets[0];
  step("이름 바뀜", back.name === "MCP테스트 이름만");
  step("프롬프트 쓰면 템플릿이 custom으로", back.promptTemplate === "custom" && back.customPrompt === "테스트 프롬프트", back.promptTemplate);
  step("해시태그 유지", JSON.stringify(back.tags) === JSON.stringify(rich.tags), JSON.stringify(back.tags));
  step("전개 예시 유지", back.chatExamples?.[0]?.character === "반가워");
  step("단축어 유지", back.shortcutCommands?.[0]?.prompt === "현재 상태를 보여줘");
  step("플레이 가이드 유지", ss.playGuide === "가이드");
  step("추천 답변 유지", JSON.stringify(ss.replySuggestions) === JSON.stringify(["응", "아니"]));
  step("키워드북 유지", ss.keywordBook?.[0]?.prompt === "학교 설정" || back._keywordBook?.[0]?.prompt === "학교 설정", JSON.stringify(ss.keywordBook ?? back._keywordBook).slice(0, 120));
  step("스탯 유지", ss.parameters?.[0]?.name === "호감도");
  step("엔딩 유지", ss.ending?.endings?.[0]?.name === "해피엔딩", JSON.stringify(ss.ending).slice(0, 120));

  const drafts = await call("list_story_drafts", { storyId: SID, limit: 40 });
  step("list_story_drafts (40)", !drafts.error && drafts.json[0].draftId === s2.json.draftId);
  step("list_story_drafts 41은 막힘", (await call("list_story_drafts", { storyId: SID, limit: 41 })).error);

  const over = await call("save_story_draft", { storyId: SID, changes: { startingSets: [{ name: "a", initialMessages: ["a"], keywordBook: [{ name: "k", prompt: "p", keywords: ["가".repeat(11)] }] }] } });
  step("제한 초과는 저장 전 차단", over.error && over.text.includes("키워드[0]: 11자"), over.text.split("\n")[1]);
} finally {
  if (made.length) await api("POST", "/story-drafts/delete-many", { storyDraftIds: made }).then(() => console.log(`정리: 테스트 임시저장본 ${made.length}개 삭제`));
  p.kill();
}
