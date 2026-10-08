# Conversation reading and mobile layout

Kites uses a shared conversation renderer for web, Electron desktop, and Capacitor mobile.

## Reading state

- `shared/reading.mjs` selects committed text, images, errors, and initial bot questions. It excludes token deltas, thinking, tools, status events, duplicate question updates, and user messages from unread counts. User messages still contribute to previews and last activity.
- `server/reading.mjs` loads runtime tapes incrementally and persists a monotonically increasing `readSeq` in the Kites SQLite document store. Concurrent devices cannot move the cursor backwards.
- `GET /api/kites/reading?ids=...` returns preview, last activity, first unread sequence, and unread count. `PUT /api/kites/reading/:sessionId` validates and advances the cursor. Both routes use existing Kites authorization and runtime selection; local and Alpha stores stay separate.
- `src/useReading.ts` saves visible responses only in a focused, visible app. A long response is considered read when its end enters the scroll viewport. Read positions synchronize every five seconds and when the app resumes or regains focus. Failed synchronization leaves a visible notice and retries through synchronization.
- Each conversation visit preserves its original NEW boundary. Reopening positions the view at the first unread item; fully read conversations open at the latest content. Incoming content preserves the scroll position when the reader is away from the bottom, and updates a counted jump button.

The current server has one owner per connection. Reading positions are shared by devices connected to that owner's server, not separate user accounts. A future multi-user service must scope storage by authenticated user identity. Jumping to the latest content acknowledges preceding content through the read cursor; this is a reading position, not a record of every individually inspected message.

## Presentation

`src/Conversation.tsx` adds day separators, consecutive-speaker grouping, quiet completion timestamps, a group avatar overflow count, and a conversation overflow menu. `src/ConversationWork.tsx` keeps tools, plans, and collaborators expandable. Provider-supplied question option descriptions are displayed without inventing additional options.

`src/conversation.css` uses 17px mobile bot replies and 16px user messages, white answer surfaces, a compact header with workspace access, and an expanding composer. The jump button follows the actual composer height. Group recipient selection, mentions, attachments, drag/drop, Stop, and file previews remain functional. Native keyboard resizing uses the existing Capacitor Keyboard configuration.

## Verification

Automated checks cover meaningful unread items, cursor persistence, backwards and concurrent updates, incremental history, foreground visibility, long responses, message grouping, NEW placement, and overflow actions. Existing composer, question, workspace, streaming, and service tests remain in the suite.

Live browser verification used the existing Codex verification chat with English and Chinese replies and an actual pwd tool call. A second response delivered in the background preserved the reader's scrollTop at 893 and displayed `1 new message`. Screenshots are in `evidence/conversation-mobile/`.

Desktop is packaged as an unsigned macOS app. iOS and Android web assets are synchronized; physical-device keyboard behavior and native installation were not tested in this change.
