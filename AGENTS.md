# AGENTS.md — crack-mcp 작업 지침 (AI 에이전트용)

이 문서는 이 저장소를 받은 AI 에이전트(Claude, GLM 등)가 **위에서부터 순서대로** 따라 하도록 쓴 것이다.
사람용 소개는 `README.md`에 있다. 코드는 `src/index.ts` 한 파일이다.

---

## 0. 절대 규칙 — 먼저 읽고 시작한다

1. **공개·등록은 하지 않는다.** 이 MCP는 임시저장(`POST /story-drafts/v2`)까지만 한다. 크랙의 등록 API
   (`POST /stories/v2`, `PATCH /stories/:id/v2`)는 코드에 넣지 않는다. 사용자가 사이트에서 직접 누른다.
2. **진짜 작품으로 테스트하지 않는다.** 실험과 테스트는 사용자가 지정한 테스트용 스토리(`CRACK_TEST_STORY_ID`)에서만 한다.
3. **토큰을 출력하지 않는다.** `~/.crack-mcp/tokens.json`과 `~/.crack-mcp/chrome-profile/`은 비밀번호와 같다.
   내용을 `cat`하거나 로그·커밋·채팅에 넣지 않는다. 토큰을 확인해야 하면 만료 시각만 본다 (6-3 참고).
4. **구글 로그인 차단을 우회하지 않는다.** 디버깅 포트가 붙은 크롬에서는 구글이 로그인을 막는다.
   이건 보안 장치다. 우회하지 말고 지금 방식(5-2)을 유지한다.
5. **추측으로 한계치를 고치지 않는다.** 한계치는 서버 검사 API로 확인한 값만 쓴다 (7단계).

---

## 1단계. 환경 확인

```bash
node -v          # v24.2 이상이어야 한다 (TypeScript를 빌드 없이 바로 실행, import.meta.main 사용)
npm install
npm test         # "selftest ok" 가 나와야 한다 (네트워크 안 씀)
```

- `npm test` 가 실패하면 다른 작업을 하기 전에 먼저 고친다.
- Windows 경로에 한글이 있어도 된다. 경로를 URL로 바꿀 때는 `fileURLToPath`를 쓴다 (`.pathname`은 한글을 `%EC…`로 깨뜨림).

## 2단계. MCP 등록

```bash
claude mcp add -s user crack -- node "<이 폴더의 절대 경로>/src/index.ts"
claude mcp get crack      # Status: ✔ Connected 확인
```

- `<…>` 자리를 **실제 경로로 바꿔서** 실행한다. 그대로 넣으면 등록은 되는데 동작하지 않는다.
- 등록한 세션에는 도구가 안 보인다. **새 세션**부터 보인다.
- 지금 세션에서 도구를 바로 써야 하면 3-4의 stdio 방식으로 호출한다.

## 3단계. 로그인

1. 도구를 처음 호출하면 크롬 창이 `crack.wrtn.ai`로 뜬다.
2. **사용자에게** 그 창에서 로그인하고 창을 닫아 달라고 말한다. 비밀번호는 에이전트가 입력하지 않는다.
3. 창이 닫히면 MCP가 화면 없는 크롬으로 쿠키를 읽어 `~/.crack-mcp/tokens.json`에 저장한다.

미리 로그인해 두려면 `npm run login` (백그라운드로 실행하고, 사용자가 창을 닫을 때까지 기다린다).

### 3-4. 등록 없이 지금 세션에서 도구 호출하기

MCP 클라이언트가 하는 일을 그대로 한다. 서버를 stdio로 띄우고 JSON-RPC 한 줄씩 보낸다.
`initialize` → `notifications/initialized` → `tools/call`. 예시 구현은 `test/tools.live.ts`의 `rpc`, `call` 함수를 보면 된다.

---

## 4단계. 스토리 작업하는 순서

### 4-1. 읽기

1. `list_my_stories` → `storyId`를 고른다. 목록의 `storyId`는 크랙의 `sourceId`다.
   콘텐츠 목록의 `_id`와 다르니 섞지 않는다.
2. `get_story` (등록본) 또는 `list_story_drafts` → `get_story_draft` (임시저장본)로 **현재 전체 내용을 먼저 읽는다.**
3. `get_limits`로 제한 표를 받는다.

### 4-2. 바꿀 내용 만들기 — 가장 중요

`save_story_draft`의 `changes`는 **최상위 키 단위로 통째로 덮어쓴다.** 배열은 합쳐지지 않는다.

- 시작설정 하나만 고칠 때도, 읽어 온 `startingSets` **배열 전체**를 복사해서 그 안의 한 항목만 고친 뒤 통째로 보낸다.
  일부만 보내면 나머지 시작설정이 사라진다.
- 각 시작설정의 **`baseSetId`는 그대로 둔다.** 이게 바뀌면 크랙은 다른 설정으로 본다.
  기존 설정으로 대화 중인 사용자에게 영향이 갈 수 있다.
- 새 시작설정을 추가할 때는 `baseSetId`를 넣지 않는다.
- `customPrompt`를 보내면서 `promptTemplate`을 따로 정하지 않으면, MCP가 템플릿을 `"custom"`으로 바꾼다.
  기본 템플릿에서는 크랙이 `customPrompt`를 쓰지 않기 때문이다.

`changes` 형식 (크랙 사이트가 실제로 보내는 형식):

```jsonc
{
  "name": "스토리 이름",                    // 2~30자, 특수문자·이모지 불가
  "simpleDescription": "한 줄 소개",        // 30자
  "customPrompt": "# Goal\n...",           // 7000자 (situationImageVersion "v1"이면 5000)
  "detailDescription": "등록 탭에 보이는 설명", // 1000자. "description"은 저장되지만 화면 어디에도 안 보임
  "tags": ["학원물", "일상"],               // 10개 × 10자
  "chatExamples": [{ "user": "...", "character": "..." }],             // 3개, 각 500자
  "shortcutCommands": [{ "name": "상태", "description": "...", "prompt": "..." }], // 20개, 10/30/400자
  "startingSets": [{                        // 최대 3개
    "baseSetId": "기존 값 그대로 (새 설정이면 생략)",
    "name": "전학 첫날",                    // 12자
    "initialMessages": ["프롤로그"],         // 1000자
    "situationPrompt": "시작 상황",          // 1000자
    "playGuide": "플레이 가이드",            // 500자
    "replySuggestions": ["추천 답변"],       // 3개 × 200자
    "keywordBook": [{ "name": "학교", "prompt": "정보", "keywords": ["학교", "한빛고"] }], // 20개, 정보 400자, 키워드 5개 × 10자
    "parameters": [{                         // 스탯 7개
      "name": "호감도", "unit": "", "min": 0, "max": 100, "initialValue": 10,
      "prompt": "증감 규칙",                 // 500자
      "levels": [                            // 4개. 구간은 이어져야 함 (아래 규칙)
        { "name": "어색함", "levelMinValue": 0,  "levelMaxValue": 30,  "levelPrompt": "..." },
        { "name": "친구",   "levelMinValue": 30, "levelMaxValue": 100, "levelPrompt": "..." }
      ]
    }],
    "ending": { "endings": [{ "name": "해피엔딩", "conditionPrompt": "조건", "epilogueExample": "에필로그", "hint": "힌트" }] } // 10개, 20/500/1000/20자
  }]
}
```

스탯 레벨 구간 규칙 (서버가 검사함):
- 첫 레벨의 `levelMinValue` = 스탯 `min`
- 마지막 레벨의 `levelMaxValue` = 스탯 `max`
- 다음 레벨의 `levelMinValue` = 이전 레벨의 `levelMaxValue` (0–50, 50–100 은 통과 / 0–49, 50–100 은 거부)

### 4-3. 저장

- `save_story_draft { storyId, changes }` — 기존 스토리를 고친다 (최신 임시저장본이 기준, 없으면 등록본).
- `save_story_draft { changes }` — 새 스토리를 만든다 (MCP가 `POST /temp-stories`로 ID를 먼저 받는다).
- 제한을 넘으면 **저장하지 않고** `크랙 제한 초과라 저장하지 않았어요: - 이름: 31자 (허용 2~30자)` 형식으로 에러가 난다.
  그 목록대로 줄여서 다시 보낸다. 서버에 보내서 확인해 보는 식으로 시도하지 않는다.

### 4-4. 확인 — 저장했다고 끝내지 않는다

1. 응답의 `draftId`로 `get_story_draft`를 호출해서, 보낸 값이 그대로 들어갔는지 확인한다.
   특히 바꾸지 않은 시작설정, 키워드북, 스탯, 엔딩이 남아 있는지 본다.
2. 응답의 `editUrl`을 사용자에게 준다.
   - 한 번도 등록 안 한 스토리는 `type=create`, 등록된 스토리는 `type=edit`이다. MCP가 알아서 고른다.
3. 브라우저를 쓸 수 있으면 `editUrl`에 `&step=<탭>`을 붙여 화면에서 확인한다. 탭 이름:
   `profile` · `detail`(프롬프트) · `starting_set` · `stats` · `media` · `keyword_book` · `slash_command` · `ending` · `register`(해시태그·설명)

---

## 5단계. 동작 원리 (고칠 때 필요한 지식)

### 5-1. API

모두 `https://crack-api.wrtn.ai`. 헤더는 `Authorization: Bearer <access>`, `platform: web`.

| 용도 | 요청 |
|---|---|
| 내 작품 목록 | `GET /crack-api/content/me?limit≤30&type=story&sort=createdAt&cursor=` |
| 스토리 편집용 전체 | `GET /crack-api/stories/me/:storyId` (공개 상세인 `/stories/:id`에는 프롬프트가 없음) |
| 임시저장 목록 | `GET /crack-api/story-drafts?storyId=&limit≤40` |
| 임시저장 하나 | `GET /crack-api/story-drafts/:draftId` |
| 임시저장 | `POST /crack-api/story-drafts/v2` → `{ storyDraftId }` (서버가 글자 수 검사함) |
| 임시저장 삭제 | `POST /crack-api/story-drafts/delete-many` `{ storyDraftIds: [...] }` |
| 새 스토리 ID 발급 | `POST /crack-api/temp-stories` (본문 없음) → `data` 가 storyId |
| **검사만** (저장 안 함) | `POST /crack-api/stories/validate-inputs/v2` → 항목별 에러 맵, 문제 없으면 `{}` |
| 토큰 갱신 | `POST /auth/v2/token/refresh`, 헤더 `Refresh: <refresh>` → `{ access_token: "Bearer eyJ…", refresh_token, expires_in }` |

- 검사 API는 사이트 폼 형식을 기대한다. 그래서 `id` 필드를 넣고, `initialMessages`·`replySuggestions`·`keywords`를
  `{ value }` 객체로 감싸야 한다. 안 그러면 "required" 에러가 섞여 나온다. `test/limits.live.ts`의 `set()` 함수가 그 형식이다.
- 등록 관련(`POST /stories/v2`, `PATCH /stories/:id/v2`)은 주소만 알고 쓰지 않는다 (0단계 규칙 1).

### 5-2. 로그인 흐름 (`ensureAccess` → `tryRefresh` → `browserLogin`)

1. access 토큰(1시간)이 60초 넘게 남았으면 그대로 쓴다.
2. 아니면 refresh 토큰(14일)으로 갱신한다. **응답 토큰 앞의 `"Bearer "`를 떼야 한다.** 안 떼면 모든 요청이 401이 난다.
3. 갱신이 401/403이면 `browserLogin`으로 넘어간다.
   1. 먼저 화면 없는 크롬(`--headless=new --remote-debugging-port=0`)을 MCP 전용 프로필로 띄워서
      `Storage.getCookies`로 `refresh_token`, `access_token` 쿠키를 읽는다.
   2. 쿠키가 없으면 **디버깅 포트 없는 평범한 크롬 창**을 띄우고, 사용자가 로그인 후 창을 닫을 때까지 기다린 뒤 1번을 다시 한다.
- Edge는 실행하자마자 첫 프로세스가 종료돼서 "창이 닫혔다"로 오판한다. 그래서 크롬만 쓴다.
- 크롬 경로를 못 찾으면 `CRACK_BROWSER` 환경변수를 쓴다.

### 5-3. 데이터 변환 (`toDraftBody`)

- `get_story`, `get_story_draft`, `save_story_draft`는 모두 `toDraftBody`를 거친다. 서버 응답을 임시저장 형식으로 바꾸는 함수다.
- 필드 목록은 크랙 사이트의 직렬화 코드에서 그대로 가져왔다.
  **여기서 빠진 필드는 수정할 때마다 조용히 사라진다.** 크랙에 새 항목이 생기면 이 함수에 추가하고,
  `test/tools.live.ts`에 "유지" 확인을 추가한다.

---

## 6단계. 테스트

```bash
npm test                                            # 오프라인. 항상 먼저.
CRACK_TEST_STORY_ID=<테스트용 스토리> npm run test:live  # 실제 서버. 약 2~3분
```

- 6-1. `test/limits.live.ts`: `LIMITS`의 모든 값을 검사 API에 대 본다. 한계치는 통과하고 +1은 거부돼야 `OK`다.
  **저장은 안 한다.**
- 6-2. `test/tools.live.ts`: 도구 7개를 stdio로 실제 호출한다. 테스트용 스토리에 임시저장본을 만들고,
  끝나면(실패해도) `delete-many`로 지운다.
- 6-3. 토큰 상태는 이렇게 본다 (값은 찍지 않는다):
  ```bash
  node -e 'const t=require(require("os").homedir()+"/.crack-mcp/tokens.json");const e=x=>x&&new Date(JSON.parse(Buffer.from(x.split(".")[1],"base64url")).exp*1000).toISOString();console.log({access:e(t.accessToken),refresh:e(t.refreshToken)})'
  ```
- 테스트를 새로 넣거나 고쳤으면, 일부러 버그를 심어서 그 테스트가 `FAIL`이 나는지 한 번 확인하고 되돌린다.
  실패할 수 없는 테스트는 테스트가 아니다.

---

## 7단계. 크랙이 바뀌었을 때 고치는 순서

1. `npm run test:live`를 돌린다. `DIFF`(한계치가 다름)나 `FAIL`(도구 동작이 다름)이 난 줄만 본다.
2. **한계치가 바뀐 경우**
   1. 검사 API에 값을 직접 넣어서 진짜 한계를 찾는다. 이분 탐색으로 "통과하는 최대값"과 "거부되는 최소값"을 찾는다.
   2. `src/index.ts`의 `LIMITS`를 고치고, 근거(서버 값인지 입력칸 값인지)를 주석으로 단다.
   3. `checkLimits`가 그 필드를 검사하는지 확인한다.
   4. `npm test` → `test:live` 순서로 돌린다.
   5. README의 제한 표도 같이 고친다.
   - 입력칸이 서버보다 엄격하면 입력칸 값을 쓴다 (예: 추천 답변 화면 200 / 서버 500).
     그래야 MCP로 저장한 내용이 사이트 편집기에서도 고쳐진다.
3. **API 형식이 바뀐 경우** (401, 404, 새 필드 등)
   1. 브라우저에서 크랙 빌더(`https://crack.wrtn.ai/builder/story?type=edit&storyId=…`)를 연다.
   2. 페이지에서 `XMLHttpRequest`를 가로채 요청 주소와 본문을 기록한다. 그 상태에서 **테스트용 스토리**에서만 "임시저장"을 누른다.
      - 브라우저 네트워크 탭에는 `crack-api` 요청이 안 잡힐 수 있다. 가로채기가 확실하다.
      - 인증 헤더 값은 기록하지 않는다. 헤더 이름과 길이만 본다.
   3. 필드 이름과 형식은 크랙의 JS 번들(`/_next/static/chunks/pages/builder/story-*.js`)에서 `maxLength:`, `.length>=`,
      직렬화 코드(`startingSets.map`)를 찾으면 가장 정확하다.
   4. `toDraftBody`, `checkLimits`, 테스트를 함께 고친다.
4. 고친 뒤 `test/tools.live.ts`가 테스트용 스토리에 남긴 임시저장본이 없는지 `list_story_drafts`로 확인한다.

---

## 알려진 함정 (이미 한 번씩 걸렸던 것)

| 증상 | 원인 | 해결 |
|---|---|---|
| 토큰 갱신 후 모든 요청 401 | 갱신 응답 토큰 앞에 `"Bearer "`가 붙어 있음 | 떼고 저장 (`tryRefresh`) |
| 새 스토리 임시저장 404 "스토리를 찾을 수 없습니다" | ID를 직접 만들어서 보냄 | `POST /temp-stories`로 먼저 발급 |
| `/stories/:id` 404 | 콘텐츠 `_id`를 넣음 | 목록의 `sourceId`가 storyId |
| 저장했는데 프롬프트가 화면에 없음 | 템플릿이 `default` | `promptTemplate: "custom"` (자동 처리됨) |
| 수정하니 해시태그·엔딩이 사라짐 | `toDraftBody`에 필드 누락 | 사이트 직렬화 코드 기준으로 필드 추가 (처리됨) |
| `type=edit` 링크가 "스토리 수정" 빈 칸으로 열림 | 한 번도 등록 안 한 스토리 | `type=create` (자동 처리됨) |
| 키워드 11자 거부 | 서버 한계는 10자. 사이트 코드의 20은 틀린 값 | `LIMITS.keywordBook.keywordLength = 10` |
| 시작설정 4개 거부, 메시지는 "2개까지" | 메시지는 추가 설정 수 기준. 실제 최대는 3개 | `LIMITS.startingSets = 3` |
| 목록 limit 50 → 400 | 서버 상한: 목록 30, 임시저장 40 | `LIMITS.api` |
| 구글 로그인 "브라우저가 안전하지 않음" | 디버깅 포트가 붙은 창에서 로그인함 | 로그인 창은 디버깅 없이, 쿠키는 나중에 화면 없는 크롬으로 읽기 |
| 테스트 하네스가 서버를 못 찾음 (`%EC%BD…`) | `URL.pathname`이 한글 경로를 인코딩함 | `fileURLToPath` 사용 |
