// Live check: every LIMITS value against Crack's own validator (POST /stories/validate-inputs/v2).
// Saves nothing. For each limit: exactly-at-limit must raise no length/count error, limit+1 must.
// Run: node test/limits.live.ts
import { api, LIMITS as L } from "../src/index.ts";

const s = (n: number) => "가".repeat(n);
const id = (i = 0) => `t${i}`;
const set = (extra: any) => ({ startingSets: [{ id: id(), name: "a", initialMessages: [{ id: id(), value: "a" }], ...extra }] });
// Valid stat with contiguous levels: 0-x, x-y, …, -1000 (server rule: next min = previous max)
const levels = (k: number, name = "lv", prompt = "p") => Array.from({ length: k }, (_, i) => ({
  name: i === 0 ? name : `l${i}`, levelPrompt: i === 0 ? prompt : "p", levelMinValue: Math.round((1000 * i) / k), levelMaxValue: Math.round((1000 * (i + 1)) / k) }));
const stat = (extra: any) => ({ name: "호감도", unit: "", min: 0, max: 1000, initialValue: 0, prompt: "p", iconUrl: "x", colorHexCode: "#000000", ...extra });
const many = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

// [label, limit, body builder for value n]
const cases: [string, number, (n: number) => any][] = [
  ["이름", L.name[1], (n) => ({ name: s(n) })],
  ["한 줄 소개", L.simpleDescription, (n) => ({ simpleDescription: s(n) })],
  ["프롬프트(v2)", L.customPrompt.v2, (n) => ({ situationImageVersion: "v2", customPrompt: s(n) })],
  ["프롬프트(v1)", L.customPrompt.v1, (n) => ({ situationImageVersion: "v1", customPrompt: s(n) })],
  ["스토리 상세(v2)", L.storyDetails.v2, (n) => ({ situationImageVersion: "v2", storyDetails: s(n) })],
  ["스토리 상세(v1)", L.storyDetails.v1, (n) => ({ situationImageVersion: "v1", storyDetails: s(n) })],
  ["설명", L.description, (n) => ({ description: s(n) })],
  ["상세 설명", L.description, (n) => ({ detailDescription: s(n) })],
  ["해시태그 개수", L.tags.count, (n) => ({ tags: many(n, (i) => `t${i}`) })],
  // 해시태그 길이: 입력칸 기준 10자라 서버는 안 막음 → 서버 테스트 제외. ["해시태그 길이", L.tags.length, (n) => ({ tags: [s(n)] })],
  ["전개 예시 개수", L.chatExamples.count, (n) => ({ chatExamples: many(n, (i) => ({ id: id(i), user: "a", character: "b" })) })],
  ["전개 예시 유저", L.chatExamples.user, (n) => ({ chatExamples: [{ id: id(), user: s(n), character: "b" }] })],
  ["전개 예시 캐릭터", L.chatExamples.character, (n) => ({ chatExamples: [{ id: id(), user: "a", character: s(n) }] })],
  ["단축어 개수", L.shortcutCommands.count, (n) => ({ shortcutCommands: many(n, (i) => ({ id: id(i), name: `c${i}`, description: "d", prompt: "p" })) })],
  ["단축어 이름", L.shortcutCommands.name, (n) => ({ shortcutCommands: [{ id: id(), name: s(n), description: "d", prompt: "p" }] })],
  ["단축어 설명", L.shortcutCommands.description, (n) => ({ shortcutCommands: [{ id: id(), name: "c", description: s(n), prompt: "p" }] })],
  ["단축어 내용", L.shortcutCommands.prompt, (n) => ({ shortcutCommands: [{ id: id(), name: "c", description: "d", prompt: s(n) }] })],
  ["시작설정 이름", L.startingSet.name, (n) => ({ startingSets: [{ id: id(), name: s(n), initialMessages: [{ id: id(), value: "a" }] }] })],
  ["프롤로그", L.startingSet.prologue, (n) => set({ initialMessages: [{ id: id(), value: s(n) }] })],
  ["시작 상황", L.startingSet.situationPrompt, (n) => set({ situationPrompt: s(n) })],
  ["플레이 가이드", L.startingSet.playGuide, (n) => set({ playGuide: s(n) })],
  ["추천 답변 개수", L.startingSet.replySuggestions, (n) => set({ replySuggestions: many(n, (i) => ({ id: id(i), value: `r${i}` })) })],
  ["추천 답변 길이(서버 500)", 500, (n) => set({ replySuggestions: [{ id: id(), value: s(n) }] })],
  ["키워드북 개수", L.keywordBook.perSet, (n) => set({ keywordBook: many(n, (i) => ({ id: id(i), name: `k${i}`, prompt: "p", keywords: [{ value: `w${i}` }] })) })],
  ["키워드 개수", L.keywordBook.keywords, (n) => set({ keywordBook: [{ id: id(), name: "k", prompt: "p", keywords: many(n, (i) => ({ value: `w${i}` })) }] })],
  ["키워드 길이", L.keywordBook.keywordLength, (n) => set({ keywordBook: [{ id: id(), name: "k", prompt: "p", keywords: [{ value: s(n) }] }] })],
  ["키워드북 정보", L.keywordBook.prompt, (n) => set({ keywordBook: [{ id: id(), name: "k", prompt: s(n), keywords: [{ value: "w" }] }] })],
  ["시작설정 개수", L.startingSets, (n) => ({ startingSets: many(n, (i) => ({ id: id(i), name: `s${i}`, initialMessages: [{ id: id(i), value: "a" }] })) })],
  ["키워드북 개수(시작설정 3개 각각)", L.keywordBook.perSet, (n) => ({ startingSets: many(3, (j) => ({ id: id(j), name: `s${j}`, initialMessages: [{ id: id(j), value: "a" }],
    keywordBook: many(j === 2 ? n : L.keywordBook.perSet, (i) => ({ id: `k${j}_${i}`, name: `k${i}`, prompt: "p", keywords: [{ value: `w${i}` }] })) })) })],
  ["스탯 개수", L.stat.perSet, (n) => set({ parameters: many(n, (i) => ({ name: `s${i}`, unit: "", prompt: "p", min: 0, max: 100, initialValue: 0 })) })],
  ["스탯 이름", L.stat.name, (n) => set({ parameters: [{ name: s(n), unit: "", prompt: "p", min: 0, max: 100, initialValue: 0 }] })],
  ["스탯 단위", L.stat.unit, (n) => set({ parameters: [{ name: "s", unit: s(n), prompt: "p", min: 0, max: 100, initialValue: 0 }] })],
  ["스탯 설명", L.stat.prompt, (n) => set({ parameters: [{ name: "s", unit: "", prompt: s(n), min: 0, max: 100, initialValue: 0 }] })],
  ["스탯 레벨 개수", L.stat.levels, (n) => set({ parameters: [stat({ levels: levels(n) })] })],
  ["스탯 레벨 이름", L.stat.levelName, (n) => set({ parameters: [stat({ levels: levels(2, s(n)) })] })],
  ["스탯 레벨 프롬프트", L.stat.levelPrompt, (n) => set({ parameters: [stat({ levels: levels(2, "lv", s(n)) })] })],
  ["엔딩 개수", L.ending.perSet, (n) => set({ ending: { endings: many(n, (i) => ({ name: `e${i}`, conditionPrompt: "c", epilogueExample: "e", hint: "h" })) } })],
  ["엔딩 이름", L.ending.name, (n) => set({ ending: { endings: [{ name: s(n), conditionPrompt: "c", epilogueExample: "e", hint: "h" }] } })],
  ["엔딩 조건", L.ending.conditionPrompt, (n) => set({ ending: { endings: [{ name: "e", conditionPrompt: s(n), epilogueExample: "e", hint: "h" }] } })],
  ["엔딩 에필로그", L.ending.epilogueExample, (n) => set({ ending: { endings: [{ name: "e", conditionPrompt: "c", epilogueExample: s(n), hint: "h" }] } })],
  ["엔딩 힌트", L.ending.hint, (n) => set({ ending: { endings: [{ name: "e", conditionPrompt: "c", epilogueExample: "e", hint: s(n) }] } })],
];

// Only length/count complaints matter; "required" noise from the partial bodies is ignored.
const LIMIT_MSG = /글자|이하|이내|최대|초과|개까지|at most|must contain no more|longer than|less than or equal/i;
async function limitErrors(body: any): Promise<string[]> {
  let res: any;
  try { res = await api("POST", "/stories/validate-inputs/v2", body); }
  catch (e: any) { return LIMIT_MSG.test(e.message) ? [e.message] : [`(요청 실패) ${e.message}`]; }
  const out: string[] = [];
  const walk = (v: any, p: string) => {
    if (typeof v === "string") { if (LIMIT_MSG.test(v)) out.push(`${p}: ${v}`); }
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(res, "");
  return out;
}

let bad = 0;
for (const [label, max, build] of cases) {
  const at = await limitErrors(build(max));
  const over = await limitErrors(build(max + 1));
  const ok = at.length === 0 && over.length > 0;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "DIFF"} ${label} (${max}) | 한계치: ${at.length ? at.join("; ") : "통과"} | +1: ${over.length ? over.join("; ") : "통과(서버가 안 막음)"}`);
}
console.log(bad ? `\n${bad}개 항목이 저장한 값과 서버가 다름` : `\n전체 ${cases.length}개 항목 일치`);
process.exitCode = bad ? 1 : 0;
