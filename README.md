# Cellar Tools

양조장·브랜드로 사케를 검색하고 맛 프로필을 조회하며, 이미지 파일을 Notion 페이지의 파일 속성에 추가하는 CLI 도구입니다.

## 코드 구조

| 경로 | 역할 |
|---|---|
| `src/sake-search.mjs` | 브랜드 필터·맛 프로필 연결·조회 |
| `src/notion-images.mjs` | 이미지 업로드와 기존 첨부 유지 |
| `bin/search-sake.mjs` | 사케 조회 CLI |
| `bin/upload-image.mjs` | 이미지 업로드 CLI |
| `test/tools.test.mjs` | 가상 HTTP 응답을 사용한 검증 |

## 실행

```bash
node bin/search-sake.mjs BREWERY BRAND
node bin/upload-image.mjs /path/to/image.png PAGE_ID Bottle
node --test
```

Node.js 20 이상을 사용합니다. Notion 업로드는 NOTION_TOKEN 환경변수와 사용자가 전달한 페이지 ID를 사용합니다. 대상 파일 속성이 있어야 하며 기존 첨부 목록을 보존한 채 새 이미지를 추가합니다. 동시에 같은 속성을 수정하는 작업과의 동기화는 제공하지 않습니다. API 요청 오류는 상태 코드로 보고합니다. [Notion 파일 속성](https://developers.notion.com/reference/page-property-values#files)과 [파일 업로드](https://developers.notion.com/guides/data-apis/uploading-small-files)를 따릅니다.

## Source and license

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for project origins and third-party licenses.
