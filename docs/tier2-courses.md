# TeeItUp Platform Courses

TeeItUp support is fully implemented. The adapter fetches from `https://phx-api-be-east-1b.kenna.io/tee-times?date=YYYY-MM-DD&courseIds={id}` with an `x-be-alias: {slug}` header. Player filtering is client-side (`maxPlayers - bookedPlayers >= required`). Prices come from `rates[0].greenFeeWalking` and `rates[0].greenFeeRiding` (both in cents).

## Active TeeItUp Courses

### DC Municipal (alias: `play-dc-golf-public`)

| Code | Course | Notes |
|---|---|---|
| DC1 | East Potomac Golf Links | Hains Point on the Potomac. Very high weekend demand. |
| DC2 | Langston Golf Course | Historic course in NE DC. |
| DC3 | Rock Creek Golf Course | NW DC, 18 holes. |

Booking window: 7 days ahead (no early-access window).

### Fairfax County (alias: `fairfax-county-mco`)

| Code | Course | CourseId |
|---|---|---|
| FC1 | Laurel Hill Golf Club | 4595 |
| FC2 | Twin Lakes Golf Course — Oaks | 7743 |
| FC3 | Twin Lakes Golf Course — Lakes | 7756 |
| FC4 | Jefferson District Golf Course | 17001 |
| FC5 | Greendale Golf Course | 7742 |
| FC6 | Burke Lake Golf Center | 3485 |
| FC7 | Oakmont Golf Center | 17002 |
| FC8 | Pinecrest Golf Course | 17005 |

IDs derived from GolfNow facility URLs (same NBC Sports Next infrastructure). Confirmed: Laurel Hill = 4595 via `golfnow.com/facility/4595-laurel-hill-golf-club`.

### NOVA Parks (alias: `nova-parks`)

| Code | Course | CourseId |
|---|---|---|
| NP1 | Algonkian Regional Golf Course | 1136 |
| NP2 | Brambleton Regional Golf Course | 1137 |
| NP3 | Pohick Bay Regional Golf Course | 1172 |

### Carroll County (alias: `westminster-national-golf-club`)

| Code | Course | CourseId |
|---|---|---|
| CA1 | Westminster National Golf Course | 11304 |

ID derived from GolfNow pattern — verify at runtime that the API returns tee times. If 11304 is wrong, capture a network request from `westminster-national-golf-club.book.teeitup.golf` to find the correct courseId.

## Courses Investigated But Not Added

**Clustered Spires Golf Club** (Frederick, MD): Uses TeeItUp but with a MongoDB-style hex course ID (`54f14e2c0c8ad60378b04a80`) instead of a numeric ID. The `phx-api-be-east-1b.kenna.io` endpoint expects numeric IDs — hex format may not work. Do not add until verified via DevTools network capture on the booking page.

**University of Maryland Golf Course**: Booking routes through Chronogolf, not ForeUp or TeeItUp. Not compatible with current adapters.
