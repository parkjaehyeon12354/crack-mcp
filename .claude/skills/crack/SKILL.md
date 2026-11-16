---
name: crack
description: 크랙(crack.wrtn.ai) 사이트에 있는 내 스토리를 crack MCP로 읽고, 새로 만들고, 고쳐서 임시저장한다. 사용자가 크랙/crack.wrtn.ai/뤼튼 크랙의 내 스토리·작품 목록, 프롬프트·첫 메시지(프롤로그)·시작설정·키워드북·스탯·엔딩·단축어·해시태그를 보거나 바꾸거나, 크랙에 새 스토리를 올려 달라고(임시저장) 할 때, 또는 크랙의 글자 수 제한을 물을 때 쓴다. 로컬 파일에 RP 프롬프트 초안만 쓰는 작업에는 쓰지 않는다.
argument-hint: "[목록 | 보기 <스토리> | 새로 만들기 <내용> | 수정 <스토리> <내용> | 제한]"
allowed-tools: mcp__crack__list_my_stories, mcp__crack__get_story, mcp__crack__list_story_drafts, mcp__crack__get_story_draft, mcp__crack__get_limits
---

# 크랙 스토리 작업

요청: $ARGUMENTS

`crack` MCP 도구(`mcp__crack__*`)로 작업한다. 저장은 **임시저장까지만** 된다. 등록·공개는 사용자가 사이트에서 직접 누른다.
도구가 안 보이면 MCP가 등록되지 않은 것이다. 사용자에게 아래 명령을 안내하고 멈춘다.
`claude mcp add -s user crack -- node "<crack-mcp 폴더>/src/index.ts"`

## 요청 해석

| 요청 | 할 일 |
|---|---|
| 비어 있음 / `목록` | `list_my_stories` → 이름·공개 상태·버전을 표로 보여준다 |
| `보기 <스토리>` | 이름으로 storyId를 찾아 `get_story`. 임시저장이 더 최신이면 `list_story_drafts` → `get_story_draft` |
| `새로 만들기 …` | 아래 「저장 순서」. `storyId` 없이 `save_story_draft` |
| `수정 <스토리> …` | 아래 「저장 순서」. 먼저 현재 내용을 읽는다 |
| `제한` | `get_limits` 결과를 표로 보여준다 |

스토리 이름이 겹치면(같은 이름이 여러 개) 어느 것인지 사용자에게 묻는다. 추측하지 않는다.

## 저장 순서

1. **읽는다.** 수정이면 `list_story_drafts`로 최신 임시저장본을 찾아 `get_story_draft`. 없으면 `get_story`.
2. **바꿀 내용을 만든다.** `changes`는 **최상위 키 단위로 통째로 덮어쓴다.**
   - 시작설정 하나만 고칠 때도, 읽어 온 `startingSets` **배열 전체**를 복사해서 그 안의 한 항목만 고쳐서 보낸다.
     일부만 보내면 나머지 시작설정이 지워진다.
   - 기존 시작설정의 `baseSetId`는 그대로 둔다. 새로 추가하는 시작설정에는 넣지 않는다.
   - 제한(`get_limits`) 안에서 쓴다. 자주 걸리는 것: 이름 30자, 한 줄 소개 30자, 시작설정 이름 12자,
     시작설정 최대 3개, 키워드북 시작설정마다 20개, 키워드 10자, 추천 답변 200자, 스탯 레벨 4개.
   - 스탯 레벨 구간은 이어져야 한다 — 첫 최소값 = 스탯 min, 마지막 최대값 = 스탯 max, 다음 최소값 = 이전 최대값.
3. **사용자에게 확인받는다.** 기존 스토리를 고칠 때는 무엇이 바뀌는지(특히 지워지거나 줄어드는 내용)를 짧게 보여주고 진행 여부를 묻는다.
   사용자가 처음 요청에서 바꿀 내용을 구체적으로 다 말했으면 묻지 않고 진행한다.
4. **저장한다.** `save_story_draft { storyId?, changes }`.
   - 제한 초과 에러가 나면 저장은 안 된 상태다. 에러에 적힌 항목을 줄여서 다시 보낸다.
5. **확인한다.** 응답의 `draftId`로 `get_story_draft`를 호출한다. 보낸 값이 들어갔는지, 바꾸지 않은 항목이 남아 있는지 본다.
6. **알린다.** 무엇을 바꿨는지 + 응답의 `editUrl`(크랙 빌더 링크)을 준다.
   "사이트에서 확인하고 등록은 직접 눌러야 한다"고 한 줄 덧붙인다.

## 필드 이름 (사이트 화면 → changes 키)

- 프롬프트 → `customPrompt`. 넣으면 템플릿이 자동으로 제작자 커스텀이 된다.
- 등록 탭 설명 → `detailDescription`. `description`은 화면에 안 보인다.
- 해시태그 → `tags`
- 전개 예시 → `chatExamples [{user, character}]`
- 단축어 → `shortcutCommands [{name, description, prompt}]`
- 시작설정 → `startingSets[]`. 그 안에:
  - 프롤로그 `initialMessages[0]`
  - 시작 상황 `situationPrompt`
  - 플레이 가이드 `playGuide`
  - 추천 답변 `replySuggestions`
  - 키워드북 `keywordBook [{name, prompt, keywords}]`
  - 스탯 `parameters [{name, unit, min, max, initialValue, prompt, levels}]`
  - 엔딩 `ending.endings [{name, conditionPrompt, epilogueExample, hint}]`

## 하지 않는 것

- 등록·공개·삭제. 이 MCP에는 그런 기능이 없고, 다른 방법(브라우저 클릭 등)으로 하지도 않는다.
- 사용자 비밀번호 입력. 로그인 창이 뜨면 사용자에게 로그인하고 창을 닫아 달라고 말한다.
- 토큰 파일(`~/.crack-mcp/`) 내용 출력.
