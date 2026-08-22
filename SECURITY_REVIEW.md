# Codex Security Targeted Diff Review — 心跳回忆 0.8.2

## Scope

Targeted review of the 0.8.1 → 0.8.2 changes: settings UI overrides, Connection Manager model discovery/model override, background generation, and one-request base bundle generation. The previously remediated 0.8.1 boundaries were regression-tested again.

## New behavior reviewed

### Settings UI

The extension now force-overrides SillyTavern `.menu_button` sizing/writing direction only under the Heartbeat settings root. This is a presentation change and does not add an execution sink.

### Model discovery

The extension adds one browser `fetch` target only:

`POST /api/backends/chat-completions/status`

The URL is a hard-coded same-origin SillyTavern endpoint. The request body is constructed from the selected Connection Manager Profile and includes `secret_id`, provider type, and provider endpoint metadata where required. The extension does **not** call a Secret-value reader and does not direct-fetch the Profile's third-party API URL. Returned model IDs are normalized as untrusted strings before being inserted as option text/value.

Generation still goes through `ConnectionManagerRequestService.sendRequest()`. A selected Heartbeat model is passed only as an override payload for that request; it does not mutate the user's main chat model.

### Background generation

Close/home actions remain usable while `busy=true`. Hiding the overlay no longer means abandoning the task: successful base bundle, single-mode, archive, ADV and daily-room results save to the original chat-bound session and notify through toast. Cross-chat/archive guards remain mandatory after every await. Settings and chooser generation buttons are disabled while a task is active, so background mode does not create parallel duplicate requests.

### One-request base bundle

On a fresh archive cache, one model response now contains butterfly + album + room. The ADV event index is derived locally from unlocked album entries, so no fourth model call is required. Each normalized subsection is independently validated and saved. Long ADV prose and the date-specific room-life plan remain intentionally on-demand requests.

## Regression checks

Local mock tests passed for the 0.8.1 findings:

- H-1 placeholder normalization;
- H-2 room-life failure fuse;
- H-3 stale-chat cache write rejection;
- M-1 unsafe SillyTavern macro neutralization;
- M-2 source memory semantic evidence;
- M-3 input budget;
- M-4 stale archive persistence rejection.

Additional 0.8.2 tests passed:

- a compliant fresh base bundle makes exactly **one** Connection Manager generation call and produces caches for butterfly / album / derived ADV / room;
- model override is forwarded to the Heartbeat request without changing the Profile;
- model discovery calls only the hard-coded same-origin SillyTavern status endpoint;
- model discovery sends a Secret ID reference, not an API Key value;
- both JavaScript entry files pass Node syntax checks.

## Remaining runtime validation

The older M-6 compatibility item remains: if no Connection Manager Profile is selected, “one-click import current connection” snapshots current settings through official slash-command callbacks. This must still be verified on a real SillyTavern 1.18.x+ instance for providers/templates in actual use. It is not an API-key exposure finding.

The new model refresh should also be tested against at least one real Custom/OpenAI-compatible Profile and one non-Custom provider because some provider status endpoints intentionally do not enumerate models; in that case the UI is expected to fall back to models already present in equivalent saved Profiles.

## Conclusion

No new arbitrary third-party browser fetch, plaintext API-key read path, model-output execution sink, or cross-chat persistence bypass was identified in the reviewed 0.8.2 diff. The release remains a candidate pending the real SillyTavern compatibility checks above.
