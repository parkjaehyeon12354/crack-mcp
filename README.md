# crack-mcp

[크랙(crack.wrtn.ai)](https://crack.wrtn.ai) 스토리를 Claude 같은 AI에서 읽고, 만들고, 고칠 수 있게 해 주는 MCP 서버입니다.

> **비공식 도구입니다.** 크랙 사이트가 내부적으로 쓰는 API를 그대로 호출합니다. 크랙이 업데이트되면 언제든 깨질 수 있고,
> 자동화가 크랙 이용약관에 맞는지는 직접 판단해야 합니다. 내 계정으로 내 작품만 다룹니다.

- **임시저장까지만 합니다.** 공개·수정 반영(등록하기)은 크랙 사이트에서 직접 누르세요.
- 저장하기 전에 크랙의 글자 수·개수 제한을 먼저 검사해서, 넘으면 저장하지 않고 어느 항목이 몇 자 넘었는지 알려 줍니다.

## 사용 범위와 주의

이 도구는 **개인용**입니다. 아래 범위 안에서만 쓰세요.

- **본인 계정의 본인 작품만** 다룹니다. 하는 일은 본인 로그인 토큰 연결, 내 작품 읽기, 임시저장까지입니다.
- **다른 사람의 토큰을 받거나, 모으거나, 공유하는 용도로 쓰지 마세요.**
- **여러 사람이 함께 쓰는 공용 호스팅 서버로 운영하지 마세요.** 휴대폰용 커넥터 서버도 한 사람 전용입니다. 각자 자기 서버에 올려서 씁니다.
- **필요한 만큼만** 호출합니다. 크랙 요청 사이에는 최소 0.5초 간격을 두고(`CRACK_MIN_INTERVAL_MS` 환경변수로 조정, 단위 ms), 도구를 한 번 부를 때 보내는 요청은 20회까지로 막아 둡니다. 반복 실행, 대량 작업, 조회수·좋아요 같은 지표를 올리는 데 쓰지 마세요.
- 크랙에는 뤼튼과 같은 「[뤼튼 서비스 이용약관](https://login.wrtn.ai/policy/service)」이 적용됩니다 (2026.9.1 시행본 기준). 이 도구와 관련된 조항:
  - **제8조 제1항** — 리버스엔지니어링 등으로 서비스를 복제·분해·모방하는 행위, 자동 접속 프로그램 등으로 서버에 부하를 일으켜 서비스를 방해하는 행위, 제3자에게 계정 접속권한을 주는 행위, 다른 회원의 계정정보를 무단으로 수집·저장하는 행위를 금지합니다.
  - **제9조 (공정사용정책)** — 비정상적인 API 확장과 봇 제작, 계정 돌려쓰기 같은 악의적 사용을 금지합니다. 과도한 사용량이나 로그인 정보 공유가 적발되면 **사전 통보 없이 계정이 차단되거나 영구 삭제**될 수 있습니다.
  - **제12조·제15조** — 위반하면 이용 정지, 회원자격 상실, 이용계약 해지가 가능합니다. 비정상적인 이용이 감지되면 **작품 등 데이터를 삭제**할 수도 있습니다. 중대하거나 긴급한 경우에는 통지가 조치 뒤에 옵니다.
  - **제28조** — 약관 위반으로 회사에 손해가 생기면 회원이 배상해야 합니다.
- 크랙 운영정책(사이트 안에서 확인)은 자동화로 지표를 조작하는 행위도 금지합니다.
- 이 도구를 쓰는 것이 위 조항에 해당하는지는 크랙이 판단합니다. 본인 작품을 조금씩 임시저장하는 데만 써도 "비정상적인 API 확장·봇"으로 볼 여지가 있어서, **제재를 받을 수 있고 책임은 쓰는 사람에게 있습니다.** 잃으면 곤란한 계정이나 작품이라면 먼저 뤼튼 고객센터에 문의하고, 작품은 따로 백업해 두세요.
- 이 내용은 **법률 자문이 아닙니다.** 약관은 바뀔 수 있으니, 판단이 필요하면 이용약관과 운영정책 원문을 직접 확인하세요.

## 필요한 것

- **Node.js 24.2 이상** (빌드 과정 없이 TypeScript를 바로 실행합니다)
- **Chrome** (처음 로그인할 때만 씁니다)

## 설치

```bash
git clone <이 저장소 주소> crack-mcp
cd crack-mcp
npm install
```

Claude Code에 등록 (경로는 실제 위치로 바꾸세요):

```bash
claude mcp add -s user crack -- node "/절대/경로/crack-mcp/src/index.ts"
```

Claude Desktop이라면 `claude_desktop_config.json`에:

```json
{ "mcpServers": { "crack": { "command": "node", "args": ["/절대/경로/crack-mcp/src/index.ts"] } } }
```

### 스킬 (`/crack`)

`.claude/skills/crack/`에 Claude Code 스킬이 들어 있습니다. 설치하면 두 가지로 쓸 수 있습니다.

- **직접 부르기:** `/crack 목록`, `/crack 보기 아아`, `/crack 수정 아아 첫 메시지를 …로`, `/crack 새로 만들기 …`, `/crack 제한`
- **자동:** "크랙에 있는 내 스토리 첫 메시지 뭐였지?"처럼 말하면 Claude가 알아서 스킬을 씁니다.

모든 프로젝트에서 쓰려면 사용자 스킬 폴더에 연결하세요. 복사가 아니라 링크라서, 저장소를 업데이트하면 스킬도 같이 바뀝니다.

```powershell
# Windows (PowerShell)
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\crack" -Target "<crack-mcp 폴더>\.claude\skills\crack"
```

```bash
# macOS / Linux
ln -s "<crack-mcp 폴더>/.claude/skills/crack" ~/.claude/skills/crack
```

- 이 저장소 폴더 안에서 Claude Code를 열면 연결하지 않아도 스킬이 잡힙니다.
- 읽기 도구(목록·보기·제한)는 스킬이 미리 허용해 둡니다. 저장(`save_story_draft`)은 매번 승인을 묻습니다.
- `~/.claude/crack-skill.local.md`를 만들어 두면 스킬이 작업 전에 읽고 따릅니다. 저장소에 넣지 않을 개인 지시(예: 내 서브 에이전트에게 초안을 맡기기)를 여기에 둡니다.
- 처음 `/crack`을 쓸 때 스킬 실행 승인을 한 번 묻습니다. `claude -p` 같은 비대화형 실행에서는 `--allowedTools "Skill(crack)"`을 붙이세요.

## 휴대폰에서 쓰기 (커스텀 커넥터, PC 불필요)

Claude 커스텀 커넥터로 등록하면 **Claude 휴대폰 앱**에서도 쓸 수 있습니다. 서버는 클라우드에서 돌고, 로그인도 휴대폰 브라우저로 합니다.

**처음부터 따라 하는 단계별 안내(로그인 북마크 만들기, 커넥터 추가, 채팅에서 쓰기, 문제 해결)는 [docs/mobile-connector.md](docs/mobile-connector.md)에 있습니다.**

> **Cloudflare Workers에는 올릴 수 없습니다.** 크랙이 Workers에서 오는 요청을 봇으로 차단합니다(403 "Attention Required").
> 일반 클라우드 서버(Google Cloud Run, Azure 등)에서는 동작하는 것을 확인했습니다.

### 1. Google Cloud Run에 올리기 (한 번만)

결제 계정이 연결된 Google Cloud 프로젝트가 필요합니다. 무료 사용량 안에서 돌아갑니다.

```bash
P=<프로젝트 ID>; R=asia-northeast3; B=$P-crack-mcp
gcloud storage buckets create gs://$B --location=$R --uniform-bucket-level-access --public-access-prevention
SA=$(gcloud iam service-accounts list --filter='displayName:Compute Engine default' --format='value(email)')
gcloud storage buckets add-iam-policy-binding gs://$B --member=serviceAccount:$SA --role=roles/storage.objectUser
SECRET=$(openssl rand -hex 32)   # 비밀 키 — 커넥터 주소에 들어갑니다
gcloud run deploy crack-mcp --source . --region $R --allow-unauthenticated \
  --max-instances 1 --min-instances 0 --memory 512Mi --execution-environment gen2 \
  --add-volume name=data,type=cloud-storage,bucket=$B --add-volume-mount volume=data,mount-path=/data \
  --set-env-vars "CRACK_SECRET=$SECRET,CRACK_TOKEN_FILE=/data/tokens.json"
URL=$(gcloud run services describe crack-mcp --region $R --format='value(status.url)')
gcloud run services update crack-mcp --region $R --update-env-vars "CRACK_PUBLIC_URL=$URL"
echo "커넥터 주소: $URL/$SECRET/mcp"
echo "로그인 페이지: $URL/$SECRET/setup"
```

- Windows의 Git Bash에서는 `/data`가 Windows 경로로 바뀌어 배포가 실패합니다. PowerShell에서 실행하세요.
- 토큰은 비공개 버킷의 `tokens.json`에 저장됩니다. 인스턴스가 꺼졌다 켜져도 유지됩니다.

### 2. 휴대폰으로 로그인 (처음 한 번, 그리고 14일 넘게 안 썼을 때)

휴대폰 브라우저로 **로그인 페이지**를 열고, 안내대로 북마크를 하나 만듭니다. 크랙에 로그인한 탭에서 그 북마크를 누르면 "연결 완료"가 뜹니다.
그 뒤로는 서버가 토큰을 알아서 갱신합니다. 토큰이 끊기면 Claude가 로그인 페이지 주소를 알려 줍니다.

### 3. Claude에 커넥터 추가

claude.ai(휴대폰 브라우저로도 가능) → **설정 → 커넥터 → 커스텀 커넥터 추가** → 이름 `crack`, URL에 **커넥터 주소**를 넣습니다.
웹에서 추가하면 휴대폰 앱에도 나타납니다.

### 보안

- 모든 주소에 비밀 키가 들어갑니다. 키가 없으면 전부 404입니다. **커넥터 주소와 로그인 페이지 주소는 비밀번호처럼 다루세요.**
- 키를 바꾸려면 `CRACK_SECRET`을 새 값으로 업데이트하고 커넥터를 다시 등록하면 됩니다.
- Cloud Run 요청 로그에는 주소(비밀 키 포함)가 남습니다. 프로젝트 소유자만 볼 수 있습니다.
- 로그인 북마크는 정확히 `crack.wrtn.ai` 페이지에서만 동작합니다 (북마크 코드에 비밀 키가 들어 있기 때문).
- 비밀 키는 시간차로 추측할 수 없게 고정 시간 비교를 합니다.
- 이 서버는 한 사람 전용입니다. 여러 사람의 토큰을 받는 서버로 확장하려면 OAuth 등 별도 설계와 크랙의 허락이 필요합니다.

## 로그인

따로 할 일은 없습니다. 처음 도구를 쓸 때 **크롬 창이 크랙 페이지로 뜨면 로그인하고 창을 닫으세요.** 그걸로 끝입니다.

- 로그인 정보는 이 MCP 전용 크롬 프로필(`~/.crack-mcp/chrome-profile`)에 남고, 토큰은 `~/.crack-mcp/tokens.json`에 저장됩니다.
  **이 폴더는 비밀번호처럼 다루세요** — 저장소 밖에 있어서 커밋되지는 않습니다.
- 1시간짜리 토큰은 알아서 갱신되고, 14일짜리 갱신 토큰이 만료돼도 저장된 프로필에서 다시 읽어 옵니다. 그래도 안 될 때만 창이 다시 뜹니다.
- 로그인 창에는 디버깅 연결을 붙이지 않습니다. 그래서 구글 로그인이 막히지 않습니다. 쿠키는 창을 닫은 뒤 화면 없는 크롬으로 읽습니다.
- 미리 로그인해 두려면 `npm run login`.
- 크롬을 못 찾으면 `CRACK_BROWSER` 환경변수에 `chrome.exe` 경로를 넣으세요.

## 도구

| 도구 | 하는 일 |
|---|---|
| `list_my_stories` | 내 스토리 목록 (한 번에 최대 30개, `cursor`로 다음 페이지) |
| `get_story` | 등록된 스토리의 전체 설정 — 프롬프트, 시작설정, 키워드북, 스탯, 엔딩, 단축어 |
| `list_story_drafts` | 스토리의 임시저장 목록 (최대 40개) |
| `get_story_draft` | 임시저장본 하나의 전체 설정 |
| `save_story_draft` | 임시저장. `storyId`가 있으면 최신 임시저장본(없으면 등록본)에 `changes`만 덮어쓰고, 없으면 새 스토리를 만듭니다 |
| `get_limits` | 글자 수·개수 제한 전체 표 |
| `login` | 로그인 창을 다시 띄웁니다 (보통은 자동이라 필요 없음) |

이렇게 말하면 됩니다:

- "내 크랙 스토리 목록 보여줘"
- "○○ 스토리 프롬프트 보여줘"
- "새 스토리 만들어 줘. 제목은 …, 프롬프트는 …"
- "○○ 첫 메시지를 이걸로 바꿔서 임시저장해 줘"

`changes`에 프롬프트(`customPrompt`)를 넣으면 템플릿이 자동으로 **제작자 커스텀**이 됩니다. 기본 템플릿에서는 크랙이 `customPrompt`를 쓰지 않기 때문입니다.

## 제한

글자 수는 서버 기준 **문자 수**입니다. 공백·줄바꿈도 1자, Windows 줄바꿈(`\r\n`)은 2자, 이모지는 1자입니다. 사이트 입력칸은 이모지를 2자로 세서 더 엄격하고, 이 MCP도 입력칸 기준으로 검사합니다.

모두 크랙 서버의 검사 API로 "딱 한계치는 통과, +1은 거부"를 확인한 값입니다 (2026-11-16). 입력칸이 서버보다 엄격한 항목은
입력칸 값을 따릅니다. 그래야 MCP로 저장한 내용이 사이트 편집기에서도 그대로 고쳐집니다.

| 항목 | 제한 |
|---|---|
| 이름 / 한 줄 소개 | 2~30자 / 30자 |
| 프롬프트 | 7000자 (구버전 이미지 방식은 5000) |
| 스토리 상세 | 5000자 (구버전 3000) |
| 설명 / 상세 설명 | 1000자 |
| 해시태그 | 10개 × 10자 (길이는 입력칸 기준 — 서버는 제한 없음) |
| 전개 예시 | 3개, 유저·캐릭터 각 500자 |
| 단축어 | 20개, 이름 10자 · 설명 30자 · 내용 400자 |
| 시작설정 | **최대 3개**, 이름 12자 · 프롤로그 1000자 · 시작 상황 1000자 · 플레이 가이드 500자 · 추천 답변 3개 × 200자 (서버는 500) |
| 키워드북 | **시작설정마다 20개**, 키워드 5개 × 10자, 정보 400자 |
| 스탯 | 시작설정마다 7개, 이름 10자 · 단위 3자 · 설명 500자 |
| 스탯 레벨 | 4개, 이름 10자 · 프롬프트 100자. 구간은 이어져야 합니다 — 첫 최소값 = 스탯 최소값, 마지막 최대값 = 스탯 최대값, 다음 최소값 = 이전 최대값 (예: 0–50, 50–100) |
| 엔딩 | 시작설정마다 10개, 이름 20자 · 조건 500자 · 에필로그 1000자 · 힌트 20자 |

## 테스트

```bash
npm test                 # 오프라인 자체 검사 (네트워크 안 씀)
npm run test:live        # 실제 크랙 서버로 검사
CRACK_MCP_URL=<커넥터 주소> npm run test:http   # 배포한 커넥터를 Claude처럼 HTTPS로 검사
```

`test:live`는 두 부분입니다.

- `test/limits.live.ts` — 위 제한을 전부 크랙의 검사 API(`/stories/validate-inputs/v2`)에 대 봅니다. **아무것도 저장하지 않습니다.**
  크랙이 제한을 바꾸면 여기서 `DIFF`로 바로 드러납니다.
- `test/tools.live.ts` — 모든 도구를 실제로 실행합니다. **버려도 되는 테스트용 스토리**에 임시저장본을 만들었다가 끝나면 지웁니다.
  그 스토리 ID를 `CRACK_TEST_STORY_ID`에 넣어야 돌아갑니다. 테스트용 스토리는 AI에게 "빈 테스트 스토리 하나 만들어 줘"라고 하면
  `save_story_draft`가 만들어 주고 `storyId`를 돌려줍니다. **진짜 작품 ID는 넣지 마세요.**

```bash
CRACK_TEST_STORY_ID=<테스트용 스토리 ID> npm run test:live
```

## 라이선스

[MIT](LICENSE) — 출처(저작권 표시와 라이선스 문구)만 남기면 누구나 쓰고, 고치고, 다시 배포할 수 있습니다.
라이선스는 이 코드에 대한 것입니다. 크랙 서비스 이용은 크랙 이용약관을 따르고, 그 책임은 쓰는 사람에게 있습니다.
