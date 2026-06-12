# Tier 2 Courses — TeeItUp Platform

These courses require a new platform adapter. TeeItUp has a structured public API similar to ForeUp, so supporting it would unlock all courses below in one implementation. The booking pattern is `https://{slug}.book.teeitup.golf`.

## DC Municipal Courses (National Links Trust / playDCgolf.com)

High weekend demand — real competition for prime morning slots. All three are operated under the same system and would come online together with one adapter.

| Course | Slug | Notes |
|---|---|---|
| East Potomac Golf Links | `play-dc-golf-public` | 18-hole + 9-hole par-3, Hains Point on the Potomac. Very popular. |
| Langston Golf Course | `play-dc-golf-public` | Historic course in NE DC. High demand. |
| Rock Creek Golf Course | `play-dc-golf-public` | NW DC, 18 holes. Competitive weekend slots. |

Booking window: **7 days ahead** (no early-access equivalent).
All three share the same TeeItUp tenant: `play-dc-golf-public.book.teeitup.golf`

## Carroll County

| Course | Slug | Notes |
|---|---|---|
| Westminster National Golf Course | `westminster-national-golf-club` | 18 holes, par 71, Carroll County. Affordable daily fee, moderate demand. |

## Implementation Notes

To add TeeItUp support, a new `fetchTeeItUpSlots(course, dateStr, players)` function is needed alongside the existing `fetchCourseSlots` (ForeUp). The `CourseSource` interface would need a `platform: "foreup" | "teeitup"` discriminator, and the monitor would route calls accordingly.

TeeItUp API endpoint to investigate:
```
https://play-dc-golf-public.book.teeitup.golf/api/...
```
Capture a network request from the booking page (DevTools → Network) to identify the exact endpoint and parameters.

