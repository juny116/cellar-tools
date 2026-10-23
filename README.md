# Cellar Tools

기존 개인 셀러 관리 워크플로를 정리하고 확장하는 프로젝트입니다.

- **v1 — Notion workflow package:** Notion이 DB와 UI, 호스트 AI가 라벨 해석과 대화를 담당합니다. 기존 Notion MCP + 스킬 + 검색/사진 CLI를 사용합니다.
- **v2 — Cellar Assistant (개발 시작):** 공통 셀러 로직과 저장소 인터페이스를 두고 자체 MCP, 별도 UI, 선택적 앱 내 AI로 확장합니다. 현재 구현 범위는 [v2 문서](v2/README.md)를 확인하세요.

## v1 사용

Node 20 이상. `config.example.json`을 `config.json`으로 복사하고 기존 Notion 데이터 소스 ID를 넣습니다. 이 파일과 `.env`는 커밋하지 않습니다. 호스트에서 기본 Notion MCP를 연결합니다.

Claude Code에서는 저장소에서 `/log-sake 사진경로` 또는 `/log-wine 사진경로`를 사용합니다. 다른 스킬 지원 호스트에서는 [Cellar Logger 스킬](skills/cellar-logger/SKILL.md)을 로드하고 저장소의 절대 경로를 알려주세요. 이 스킬은 저장소의 CLI와 설정을 참조하므로 SKILL.md 하나만 복사하면 완전한 설치가 아닙니다. 로컬 파일/실행을 지원하지 않는 호스트는 사진 CLI를 별도로 실행해야 합니다.

```sh
node bin/search-sake.mjs '上川大雪' '十勝'
# 선택적 24시간 캐시
CELLAR_CACHE_DIR=.cache node bin/search-sake.mjs '上川大雪'
# 사진 업로드만 별도 Notion integration token 필요
node --env-file=.env bin/upload-image.mjs /path/to/image.png PAGE_ID Bottle
node --test test/*.test.mjs
```

`.env`에는 `NOTION_TOKEN=...`을 넣고 파일 권한을 제한하세요. 호스트 MCP 인증은 이 토큰과 별개입니다. 사진 업로드는 기존 첨부를 보존하고 동시 변경을 감지하지만, 동일 페이지를 여러 실행에서 동시에 수정하지 마세요. 오류 뒤 재실행 전에는 실제 반영 여부를 확인합니다.

사케는 Sakenowa 브랜드 검색/맛 프로필을 사용합니다. 와인은 호스트가 라벨과 생산자 공식 자료를 대조하는 워크플로이며 기존 와인 DB 설정이 필요합니다. 새로운 와인 API나 자동 크롤러는 포함하지 않습니다. [v1 점검 결과와 한계](docs/v1-audit.md), [실제 등록 절차](skills/cellar-logger/references/notion-workflow.md)를 참고하세요.

## 출처

기존 `cellar-logger`의 기능과 운영 지침을 유지·보완한 패키지입니다. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 원본 출처를 기록합니다. 사진 보존 처리는 [Notion 파일 속성 문서](https://developers.notion.com/reference/page-property-values)와 [업로드 문서](https://developers.notion.com/guides/data-apis/uploading-small-files)를 따릅니다.
