# Cellar Assistant v2

기존 Notion 셀러를 그대로 읽고 쓰는 개인용 UI와 MCP. SQLite도 선택할 수 있습니다. v1 스킬/기본 Notion MCP 워크플로는 그대로 유지합니다.

## 현재 기능

- 중성적인 다크 그레이 UI: 갤러리/목록, 검색, 주종 필터, 개별 병 상세, 소비 이력.
- 사진을 크게 표시하고 라벨 색을 상세 사진 주변에만 옅게 반영. 사진이 없으면 명시적인 빈 상태. Notion 병 사진 추가 지원(10 MB 이하 JPEG/PNG/WebP/GIF), 기존 첨부 유지.
- 기존 제품에 병 추가 또는 새 제품 + 병 등록, 가격/용량/구매일/보관 위치/메모 수정, 소비 기록.
- 변경 초안 → 사용자 검토 → 적용. UI와 MCP가 동일한 store 메서드를 호출합니다.
- Notion은 기존 페이지, 관계, 옵션, 첨부를 유지하고 변경한 속성만 씁니다. DB를 새로 만들거나 자동 복제하지 않습니다.
- SQLite는 원자적 변경/중복 실행 방지, Notion은 별도의 영속 작업 기록으로 성공한 작업을 재사용하고 불확실한 재시도를 차단합니다.
- AI용 실제 셀러/취향 문맥 복사, MCP의 recommendation_context 및 search_sake. **앱 내부 AI 대화·사진 OCR은 아직 미구현**입니다.

## 실행

Node 22.13 이상 (`node:sqlite`; Node 22에서는 experimental 경고 가능).

```sh
npm --prefix v2 ci
npm --prefix v2 test
# SQLite: 기본 경로 ~/.local/share/cellar-assistant/cellar.sqlite
npm --prefix v2 run web
# MCP
node v2/mcp-server.mjs
```

UI는 `http://127.0.0.1:8877`에서 열립니다. `PORT`로 변경할 수 있습니다. 서버는 loopback에만 바인딩하며 Host/Origin/CSRF를 검사합니다. 외부 공개용 서버가 아닙니다.

## 기존 Notion 연결

`notion.example.json`을 저장소 밖 또는 무시된 `.data/`에 복사하고 실제 **병 데이터 소스 ID**와 **제품 카탈로그 데이터 소스 ID**를 지정하세요. 실제 속성 이름이 다르면 properties를 수정합니다. 기본 매핑은 기존 사케 셀러입니다. 쓰기 전에 스키마와 관계 대상을 확인합니다.

```sh
CELLAR_BACKEND=notion \
CELLAR_NOTION_CONFIG=/absolute/private/notion.json \
CELLAR_JOURNAL=/absolute/private/notion-journal.sqlite \
node --env-file=/absolute/private/.env v2/web-server.mjs
```

`.env`에는 `NOTION_TOKEN`을 설정합니다. 토큰은 서버에만 있고 브라우저/응답/소스 저장소로 전달하지 않습니다. MCP도 동일한 환경변수를 사용합니다. UI와 MCP는 같은 Notion 설정과 **같은 journal 경로**를 지정해야 작업 기록을 공유합니다.

Styx에서 실행할 때는 서버를 loopback에 유지하고 Mac에서 `ssh -N -L 8877:127.0.0.1:8877 Styx`로 접속합니다. SSH 연결이 종료되면 Mac의 URL도 연결되지 않습니다. 자동 실행 서비스는 설치하지 않았습니다.

현재 한 Notion 컬렉션 설정당 한 주종입니다. 기존 사케 DB를 다른 술용으로 변형하지 않습니다. 와인/위스키 등은 해당 DB와 속성 매핑을 별도 설정해야 하며, 여러 Notion 컬렉션을 한 화면에 합치는 기능은 후속 작업입니다. SQLite는 모든 지원 주종을 한 셀러에 저장할 수 있습니다.

## 쓰기 및 복구 경계

- 제품과 개별 병을 구분합니다. 같은 이름의 제품은 후보로 표시하고 자동 병합하지 않습니다.
- requestId는 작업마다 한 번 정하고 재시도 때 유지합니다. 새 ID는 새 작업입니다.
- Notion 초안은 로컬 journal에만 저장되고 검토 후 적용됩니다. 초안은 한 시간 유효합니다.
- Notion에는 여러 페이지를 묶는 트랜잭션이 없습니다. 중간 실패 시 이미 생성된 제품/병은 남을 수 있습니다. 불확실한 결과나 실행 중 프로세스 종료 시 journal 상태가 running/needs_review로 남고 자동 재생성을 차단합니다. **Notion과 journal을 대조한 수동 복구가 필요하며 복구 UI는 아직 없습니다.** 이때 새 ID로 같은 등록을 반복하지 마세요.
- 수정/소비 전에 대상 페이지 소속과 변경 필드의 현재 값을 다시 검사합니다. 마지막 읽기와 쓰기 사이 경쟁은 Notion의 CAS 부재로 완전히 막을 수 없으므로 같은 병을 여러 클라이언트에서 동시에 수정하지 마세요.
- 셀러의 기존 select 옵션만 사용합니다. 지원하지 않는 용량은 Notion에 옵션을 먼저 추가해야 합니다. 기본 Price 매핑은 KRW입니다.
- 사진은 명시적 파일 선택 시 바로 첨부합니다. 업로드 결과가 불확실하면 Notion에서 확인한 뒤 재시도하세요. 외부 이미지 프록시는 Notion/AWS 이미지 호스트만 지원합니다.
- 선호도는 명시적인 preferences 변경으로 journal에 저장합니다. 대화 메모리나 실제 Notion 재고와 자동 혼합하지 않습니다.

## 검증

v1 회귀 테스트, SQLite 변경/재시도, 실제 stdio MCP 호출, Notion 가상 API 쓰기(관계/첨부 보존·충돌·불확실한 결과), HTTP Origin/CSRF 검증 포함. 실제 Notion에서는 재고 조회와 소비 초안 검토까지 확인했으며 운영 재고 쓰기/사진 업로드는 수행하지 않았습니다.

[Notion 페이지 수정](https://developers.notion.com/reference/patch-page), [파일 업로드](https://developers.notion.com/guides/data-apis/uploading-small-files), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server)를 참고했습니다.
