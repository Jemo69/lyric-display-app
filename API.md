# REST API — Local Network Access

Adds REST endpoints to the existing Express server (`server/index.js`) on port 4000 (bound to `0.0.0.0`) so external programs on the local network can control the lyric display app.

All `/api/v1/*` endpoints require JWT Bearer authentication.

## Authentication

Generate a token via existing auth endpoint:

```bash
curl -X POST http://192.168.1.100:4000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "clientType": "api",
    "deviceId": "my-script-001",
    "adminKey": "your-admin-key"
  }'
```

- In development (`NODE_ENV != production`), adminKey is optional.
- In production, adminKey must match server's ADMIN_ACCESS_KEY.
- Use token in subsequent calls:

```bash
curl -H "Authorization: Bearer <token>" http://192.168.1.100:4000/api/v1/status
```

`clientType: api` has full permissions (`lyrics:read/write/delete`, `setlist:read/write/delete`, `output:control`, `settings:write`, `admin:full`).

## Endpoints

### GET /api/v1/status
Current app status.

**Auth:** Bearer token required.

Response:
```json
{
  "success": true,
  "status": {
    "lyricsFile": "Amazing Grace",
    "selectedLine": 2,
    "isOutputOn": true,
    "output1Enabled": true,
    "output2Enabled": true,
    "stageEnabled": true,
    "setlistCount": 5,
    "lyricsCount": 12,
    "activeLyrics": ["..."],
    "fileName": "Amazing Grace",
    "hasLyrics": true
  }
}
```

### GET /api/v1/setlist
All setlist items.

Response:
```json
{
  "success": true,
  "count": 3,
  "setlist": [
    { "id": "setlist_...", "name": "Amazing Grace", "displayName": "Amazing Grace", "originalName": "Amazing Grace.txt", "fileType": "txt", "addedAt": 123, "metadata": null }
  ]
}
```

### POST /api/v1/setlist/load
Load a setlist item to display.

Body:
```json
{ "fileId": "setlist_123" }
```

### POST /api/v1/setlist/add
Add txt/lrc file to setlist.

Body:
```json
{
  "name": "song.txt",
  "content": "Verse line 1\nVerse line 2\n..."
}
```

Optional: `fileType`, `metadata`, `originalName`.

### POST /api/v1/setlist/reorder
Reorder setlist.

Body:
```json
{ "orderedIds": ["id2", "id1", "id3"] }
```

### DELETE /api/v1/setlist/:fileId
Remove item from setlist.

### POST /api/v1/setlist/clear
Clear entire setlist. Body empty.

### POST /api/v1/lyrics/next
Advance to next line.

### POST /api/v1/lyrics/prev
Go to previous line.

### POST /api/v1/lyrics/goto
Jump to specific line.

Body:
```json
{ "lineIndex": 5 }
```

### POST /api/v1/lyrics/load-text
Load raw text directly as lyrics (no setlist add).

Body:
```json
{
  "title": "My Song",
  "content": "Line 1\nLine 2\n..."
}
```

### POST /api/v1/output/toggle
Toggle output on/off.

Body:
```json
{ "on": true }
```
If `on` omitted, toggles current state.

### POST /api/v1/bible/reference
Load Bible reference into display.

Body:
```json
{ "reference": "John 3:16" }
```

Optional:
- `text`: override verse text
- `slides`: array of strings for multi-slide verses
- `bible`: bible name

If a bible is loaded on server (`uploads/bibles/` directory), the reference is resolved via `shared/bible/index.js` `searchBible`. The resolved text is converted to lyrics like frontend does: `${verseText}\n\n${reference}`.

If no bible is loaded, the reference string itself is used as lyric content.

### GET /api/v1/bible/search?q=...&limit=20
Search active Bible.

Query params:
- `q` (required): search query or reference (e.g., "John 3:16" or "love")
- `limit` (optional): max results, default 20, max 100
- `searchAll` (optional): true to search all bibles

Response example:
```json
{
  "success": true,
  "query": "John 3:16",
  "count": 1,
  "results": [
    { "bookName": "John", "chapter": 3, "verse": 16, "text": "For God so loved...", "reference": "John 3:16", "bibleId": "...", "bibleName": "KJV" }
  ],
  "activeBible": { "id": "...", "name": "KJV" },
  "bibles": [{ "id": "...", "name": "KJV", "bookCount": 66 }]
}
```

If no bible loaded:
```json
{
  "success": true,
  "query": "John 3:16",
  "results": [],
  "count": 0,
  "message": "No bible loaded on server. Place bible files in uploads/bibles directory."
}
```

### GET /api/v1/bible/list
List loaded bibles.

Response:
```json
{
  "success": true,
  "bibles": [{ "id": "bible_kjv", "name": "KJV", "bookCount": 66 }],
  "activeBibleId": "bible_kjv",
  "activeBible": { "id": "bible_kjv", "name": "KJV", "bookCount": 66 }
}
```

## Server Binding

Server now listens on `0.0.0.0` to allow local network access:

```js
server.listen(PORT, '0.0.0.0', ...)
```

Access via `http://<local-ip>:4000`.

## Bible Integration

- Server-side bible manager: `server/bibleManager.js`
- Uses `shared/bible/index.js` `searchBible` for reference resolution
- Loads bible files from `uploads/bibles/` on startup (supports Zefania, OSIS, Beblia, OpenSong formats via `parseBible`)
- Place `.xml` bible files into that folder and restart server, or API will load them automatically

## Error Handling

All endpoints return JSON with `success: false` and `error` message on failure, with appropriate HTTP status:
- 400: bad request / validation error
- 401: missing/invalid auth
- 403: insufficient permissions
- 404: not found
- 500: server error

## Example Usage

Get token and navigate lyrics via JS:

```js
const res = await fetch('http://192.168.1.100:4000/api/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientType: 'api', deviceId: 'my-script' })
});
const { token } = await res.json();

await fetch('http://192.168.1.100:4000/api/v1/lyrics/next', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

Upload TXT file:

```bash
curl -X POST http://192.168.1.100:4000/api/v1/setlist/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Amazing Grace.txt","content":"Amazing grace how sweet the sound\nThat saved a wretch like me"}'
```

Bible reference:

```bash
curl -X POST http://192.168.1.100:4000/api/v1/bible/reference \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reference":"John 3:16"}'
```
