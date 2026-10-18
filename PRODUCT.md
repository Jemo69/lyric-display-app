# Product

## Register

product

## Users

LyricDisplay is used by church media teams, worship projection operators, live-stream volunteers, production leads, and event operators running lyrics during services, rehearsals, concerts, and broadcasts. They work in dim rooms, under time pressure, often across multiple displays, streaming software, and remote controllers. Some users are experienced production techs; others are rotating volunteers who need the interface to stay understandable when the room is live.

## Product Purpose

LyricDisplay provides real-time lyric control for worship and live production environments. It helps operators load, edit, format, search, trigger, and display lyrics across independent output and stage views, with mobile controllers for secondary operators. Success means lyrics appear at the right moment, on the right screen, with minimal hesitation, minimal cognitive load, and enough confidence that the operator can stay focused on the service rather than the software.

## Brand Personality

Fast, worshipful, precise. The product should feel calm enough for ministry settings and serious enough for broadcast workflows. It should communicate reliability, clarity, and quiet confidence rather than spectacle. Dark mode is the primary physical fit: operators use the app in dim control rooms and worship environments where glare is distracting and high-contrast status cues matter.

## Anti-references

Do not make LyricDisplay look like a generic SaaS dashboard, gamer or neon dark mode, church bulletin clip-art, toy-like volunteer software, or cluttered legacy AV-rack software. Avoid decorative complexity that slows scanning, vague icon-only controls, fragile-looking live states, and visual treatments that compete with the worship context.

## Design Principles

1. Live confidence over decoration: every primary control must help the operator make the next correct live decision faster.
2. Worshipful restraint, broadcast-grade clarity: the UI should feel composed, reverent, and production-ready without becoming bland.
3. Volunteer-safe by default: flows should be forgiving, clearly labeled, and easy to recover from under pressure.
4. Critical actions must be glanceable and reversible: output visibility, active lyric, selected line, connection state, and display routing should never be ambiguous.
5. Remote controllers are trusted instruments: mobile and secondary control surfaces should feel intentional, fast, and safe, not like reduced versions of the desktop app.

## Accessibility & Inclusion

Target readable contrast in dark mode, strong keyboard support, visible focus states, reduced-motion-safe interactions, and color-blind-safe status cues that never rely on color alone. Controls should remain legible in low-light environments and on secondary screens with varied resolution and viewing distance.

## Live Sermon Assist — design decisions worth not undoing

These came out of a direct comparison with FreeShow's Smart feature. Each is
recorded with what was taken and what was refused, because the next person to
read that code will otherwise assume the alternatives were never considered.

1. **The detector returns match quality, not a confidence score.** It is one
   factor of `match x segmentWeight`, gated at 0.6. FreeShow's single 1-100
   number mixes match quality, ambiguity, and a threshold that puts text on the
   projection screens; one number cannot carry all three. No auto-present ladder
   is coming, and a test asserts the 85 floor and 75/50 thresholds never appear.

2. **Four hallucination gates, and they stay authoritative.** Energy, no-speech
   probability, repetition, and segment-weighted confidence. FreeShow's answer to
   hallucination is a well-worded LLM prompt; a prompt is not a system property.
   Nothing added by later phases re-opens the door those gates close.

3. **Nothing reaches an output window without a press.** Every suggestion is a
   proposal. The quote lane is the strictest case: it has no output action at
   all, because its content is a model's opinion about what the pastor meant to
   say and cannot be verified against an installed translation.

4. **Mishearing corrections are context-gated.** A spoken-reference detector
   only acts beside a reference, so its confusion table is safe. A whole-
   transcript table is not: FreeShow's maps `ask` to `exodus` unconditionally, and
   "we ask, and it is given" becomes "we exodus, and it is given". Every row here
   declares its own gate.

5. **Canned output may never look like transcription.** `engineTruth.js` exists
   because a green badge over a process emitting a string it wrote itself is
   worse than no feature. It matters more now that real engines exist, because
   now a stale fake engine could answer a real start request.

6. **The quote lane is off until someone says yes, per service.** It is the only
   thing here that would send the pastor's words — not audio, not a transcript of
   the published recording, but the live feed — to a model. Consent is per
   service, is not persisted, and names the provider.

7. **German and Dutch compounds stay unresolved.** "einundzwanzig" is one word.
   Silence is the right answer; a guessed reference is the failure this feature
   exists to prevent.

Anti-reference for this feature specifically: a smart-looking suggestion rail
that quietly gets a verse wrong is worse than a plain one that says nothing.
