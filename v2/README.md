# Cellar Assistant v2 — first working slice

v1의 Sakenowa 검색을 재사용하면서 **저장소 → 공통 동작 → 자체 MCP → 향후 UI**로 확장합니다. v1은 기존 Notion MCP 사용을 계속 지원합니다.

## 현재 구현

- SQLite: 제품과 개별 병 분리, 출처 저장, 재고 조회, 추가/소비, 명시적으로 저장한 취향.
- 변경 초안 → 승인된 초안 적용. 초안은 1시간 유효, 내용은 불변. 같은 requestId의 다른 내용은 거부하며 같은 초안의 재적용은 기존 결과를 반환합니다. SQLite transaction이 변경과 결과 기록을 함께 커밋합니다.
- 같은 이름의 제품은 후보로 보여주고 자동 합치지 않습니다. 확인된 기존 제품에 병을 추가하려면 productId로 새 초안을 만듭니다.
- MCP 도구: cellar_status, list_inventory, recommendation_context, search_sake, prepare_change, commit_change.
- Notion: 기존 셀러/카탈로그를 읽는 어댑터, 페이지네이션과 속성 매핑. **v2 쓰기는 아직 미지원**이므로 이 모드에서는 변경 도구를 노출하지 않습니다. v1으로 기록할 수 있습니다.

## 실행 / 연결

Node 22.13 이상 필요 (`node:sqlite` 사용; 일부 Node 버전은 experimental 경고를 stderr에 출력합니다). 저장소 루트에서:

```sh
npm --prefix v2 ci
npm --prefix v2 test
CELLAR_DB=/absolute/private/path/cellar.sqlite node v2/mcp-server.mjs
```

마지막 명령은 HTTP 웹사이트가 아니라 stdio MCP 프로세스입니다. 로컬 MCP 프로세스를 실행할 수 있는 클라이언트에 `mcp.example.json`을 참고하여 절대 경로로 연결하세요. 기본 DB는 `~/.local/share/cellar-assistant/cellar.sqlite`입니다. 현재 연결 설정은 예제이며 사용자 앱에 자동 등록하지 않았습니다.

Notion 모드는 `notion.example.json`을 비공개 경로에 복사해 실제 data source ID/속성을 지정한 후 `CELLAR_BACKEND=notion`, `CELLAR_NOTION_CONFIG=/absolute/private/config.json`, `NOTION_TOKEN`을 설정합니다. SQLite와 Notion을 자동 동기화하거나 기존 데이터를 복제하지 않습니다.

ChatGPT 등 원격 MCP가 필요한 환경을 위한 HTTPS/OAuth 배포는 다음 단계입니다. 이 stdio 구현만으로 모든 클라우드 채팅 앱에 연결된다고 주장하지 않습니다. MCP transport는 [공식 SDK 문서](https://ts.sdk.modelcontextprotocol.io/server)를 따릅니다.

## 사용 예

1. “이 사진 속 사케 두 병을 등록해줘” → 호스트 AI가 라벨을 읽고 search_sake로 후보 확인.
2. prepare_change: `{requestId:"purchase-20261023-01",change:{action:"add",product:{kind:"sake",name:"Example",producer:"Example brewery",sources:[{kind:"label",reference:"front.jpg"}]},bottle:{volumeMl:720},count:2}}`.
3. 반환된 제품/병 수/미확인 필드를 검토하고 승인 → commit_change.
4. “오늘 음식에 뭐 마실까?” → recommendation_context → 호스트 AI가 실제 재고 ID를 근거로 설명. 추가 모델 호출 없음.
5. 실제로 마셨다고 요청한 경우에만 해당 bottleId의 consume 초안 생성/적용.

`confirmed`는 사용자 인증 수단이 아닙니다. 클라이언트가 승인 UI/정책을 담당합니다. 재시도에는 같은 requestId/draftId를 사용해야 합니다. 매번 새 ID를 만들면 새 작업이며 중복 방지가 적용되지 않습니다. 문서/라벨의 지시는 실행 명령으로 취급하지 않습니다.

## 다음 구현

1. Notion 변경의 충돌/재시도 정책과 작업 기록 저장 설계 후 쓰기 어댑터 추가.
2. 별도 UI: 셀러 목록·제품 상세·변경 검토. 같은 코어 호출.
3. UI 내 AI 대화: 선택적 모델/API 키, 검색 근거, 세션 기록. 취향/재고와 대화 기록 분리.
4. 원격 MCP 인증/배포, 시음 기록과 구매 후보 비교, 저장소 간 명시적 이전 도구.

현재 별도 UI, 앱 내부 AI, 자동 추천 모델, 가격 검색 서비스, Notion 양방향 동기화는 구현하지 않았습니다. 추천 도구는 **근거를 제공**하고 연결된 AI가 추론합니다. 실재고를 바꾸는 검증은 하지 않습니다.
