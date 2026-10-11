# Nightfront TD Values

A community trading value list for Nightfront TD, hosted on GitHub Pages and powered by a shared Supabase database.

**Live site:** https://loreseekerl.github.io/nightfront-td-values/

## How this works

- `index.html` — homepage, all-unit list and W/F/L calculator.
- `style.css` — black-and-blue responsive design.
- `app.js` — reads unit values from Supabase and powers filters and trades.
- `updates.js` — renders the public database-backed Update History changelog.
- `suggestions.js` — public value submission form that sends validated suggestions to an owner-only queue.
- `assets/` — public character artwork.
- Supabase `public.units` — database table with unit records.

**Currency rule: 1 ticket = 1 value.** Store values as numbers only (e.g. `10`), not strings like `10 tickets`.

## Official rarity list

Only these seven rarities are accepted by the Supabase database and shown in the All Units filter:

| Rarity | Color | Example supplied by owner |
| --- | --- | --- |
| Common | Gray | Freddy |
| Uncommon | Green | — |
| Rare | Blue | Ignited Chica |
| Epic | Purple | Ignited Foxy |
| Mythic | Yellow | Ignited Bonnie |
| Secret | Red/orange | Ignited Freddy |
| Glitched | Animated rotating dark-blue/purple gradient | The Creation |

The examples are **rarity references**, not automatically published units. Add their actual images, ticket values and demand before listing them as tradable units. The Glitched animation respects reduced-motion preferences.

## Unpriced units: N/A

On the private Admin Dashboard's **Units & Images** editor, the **Normal value** and **Shiny value** ticket fields can both be left empty. Saving a blank field stores SQL `NULL` in `public.units.value` or `public.units.shiny_value` and shows **N/A** throughout the public website. This is not a new currency and **not zero tickets**.

- A typed **0** is a real numeric zero-ticket value; clearing the input entirely means **N/A**.
- The homepage featured unit, All Units cards, picker listings, admin list and Demand & Value Trends show N/A where a value is missing, without appending "tickets".
- The W/F/L picker will not confirm a normal/shiny variant whose own value is N/A, even if an enchant adds bonus tickets. A unit with an N/A **normal** value but a known **shiny** value can still be traded as shiny.
- If an existing trade contains a unit whose value is subsequently cleared, totals and the trade verdict become **N/A**, never a misleading 0/Fair/Win/Loss result. Other priced entries still calculate with their normal enchant bonuses.
- Sorting by highest/lowest ticket value puts unpriced units last. History and Update History record N/A as a missing numeric value, while the Value History graph skips missing price points instead of graphing them as zero.

The database migrations made `public.units.value` and `public.unit_value_history.new_value` nullable and removed the normal-value default of 0. The existing nonnegative checks, history trigger, owner-only edit permissions, and all existing ticket values remain unchanged.

## Separate normal and shiny demand

Each unit now has **two independently editable demand ratings**: `public.units.demand` for **Normal**, and `public.units.shiny_demand` for **Shiny ★**. The owner controls both from **Admin → Units & Images**, in the **Normal demand** and **Shiny demand** fields.

- Both demand inputs are optional. Leave either blank to save **NULL**, which displays **N/A** on that version's unit card, homepage normal-demand summary, suggestions-page unit preview, and Demand & Value Trends. No demand is copied automatically between variants.
- Previously recorded **normal** demand ratings are preserved. Existing shiny demand starts as **N/A** until manually set. The ticket values, enchant bonuses, artwork, and W/F/L prices are separate and unchanged.
- Tapping ★ on All Units switches **both the displayed ticket value and the displayed demand** independently. Even if a shiny ticket value is N/A, the preview works; an unpriced variant still cannot be added to the W/F/L calculator.
- The separate **normal/shiny demand** values are visible together on Demand & Value Trends, with independent demand meters and recorded movement badges. Demand Trend and Highest Demand sorting can target either variant using **Demand Version**.
- The existing Supabase unit history trigger records normal or shiny demand edits independently, without backdating historical records. Value History can filter **Normal demand** or **Shiny demand** changes; Update History shows which variant changed.
- Missing demand is not a numeric zero rating; trends show **Not enough history** when no valid `1/10` through `10/10` demand value exists. Other custom demand text remains displayable without a numerical trend.

## Player value suggestions and owner approval

**Public page:** `#suggestions` (MORE → **Suggest a Value**), plus a shortcut on each All Units card and on the homepage. Players don't need an account. They choose an existing unit, **normal** or **shiny**, and either:

- **Suggest a ticket value** — enter a nonnegative ticket amount and explain the recommendation.
- **Report an incorrect value** — explain the issue, optionally including a proposed number.

The form shows the current listed value, using **N/A** when no ticket value has been published. This is a submission for review, **not** a live price edit, vote, public discussion board or instantly published change.

**Private owner queue:** Sign into `?admin=1#admin` with the claimed Q&A owner account, then open **VALUE SUGGESTIONS**. The owner sees the unit, rarity, normal/shiny variant, submission timestamp, original ticket value, suggested value, current live value, and written explanation. Search and filter Pending/Approved/Rejected. Optional owner notes are private.

- **APPROVE & APPLY** (when a numeric value was submitted) runs `public.review_unit_value_suggestion`, which verifies the owner in `qa_editors`, checks that the current value has **not changed since the report**, updates only that selected normal or shiny ticket value, and marks the report approved. Existing unit-value-history triggers record real changes.
- **MARK REVIEWED** approves a report without a proposed number and **does not change the unit**.
- **REJECT** marks a submission rejected without touching values. Already-reviewed submissions cannot be applied again.

**Database privacy:** `public.unit_value_suggestions` is protected by RLS. **Only the claimed owner can read the queue**; anonymous users cannot select, insert into, update, or delete the table directly. The public RPC `submit_unit_value_suggestion` performs server-side validation before inserting into the private queue. The review RPC is owner-only and runs the approval atomically. No private keys are shipped with the client.

**Abuse safeguards:** A hidden honeypot field, a minimum explanation length, a 500-character cap, numeric limits, a short browser-side cooldown, and a **server-side limit of five submissions per hour per source** help reduce spam. The server stores a salted opaque fingerprint for rate limiting, not the raw visitor IP. Moderation is still advised if the page attracts abuse; stronger CAPTCHA can be added later.

**Shiny/N/A preview fix:** Tapping ★ on All Units now previews the shiny treatment and shows **N/A** even if `shiny_value` is null and no separate shiny image exists. The original portrait is reused when no shiny image is supplied. **Shiny preview is not permission to trade an unpriced unit:** the W/F/L picker still requires a real shiny numeric value. Both variants use ordinary **tickets**.

## Mobile & UI polish

The public site keeps the handmade Nightfront trading-board style while improving phone usability:

- **Unit cards:** On phones, the actual unit portrait sits beside the name, rarity, **normal/shiny variant**, ticket value, demand, trend labels and value-history link. Desktops keep a grid. The shiny star remains interactive, with its label and value changed together.
- **Faster large lists:** All Units initially renders 60 cards, followed by **SHOW MORE UNITS** in batches of 60. Search, rarity filters and sorting always search the complete fetched data set and start at the first batch. No units are deleted or hidden permanently.
- **Loading & refresh:** The first unit fetch shows matching card skeletons and a small loading strip. Refreshing preserves the existing cards while checking for new values; offline errors show a retry action and retain previously loaded data. Value History, Demand & Trends and Update History show understated loading placeholders instead of abruptly empty sections.
- **Phone controls:** Navigation collapses on tablet and phone, the menu is scrollable, trade buttons are easier to tap, and the unit picker fits the available mobile viewport. Inputs use at least 16px text on phones to avoid unwanted iOS zoom; filters can scroll horizontally.
- **Motion & accessibility:** Cards have a quick, restrained entrance on first load; loading indicators are subtle and CSS honors `prefers-reduced-motion: reduce`. Shiny toggles preserve keyboard focus, and loading indicators expose their state through text and accessibility status attributes.

All ticket calculations, Supabase records, owner-only permissions, enchant bonuses and unit artwork stay unchanged. Normal and shiny versions both use **tickets**.

## Homepage artwork and rarity covers

The **Main Page** now has a cinematic hero using the existing Nightfront header artwork and a real featured unit portrait (or the Nightfront logo if no unit portrait is available). It displays the current unit count and links to All Units and the W/F/L calculator. It does not invent character artwork for rarities without uploaded portraits.

Each official rarity has a cover slot (Common, Uncommon, Rare, Epic, Mythic, Secret and Glitched). The live site resolves a cover in this order:

1. An owner-uploaded or URL-supplied cover from `public.homepage_rarity_artwork`.
2. A real unit portrait from the **same rarity**, if that rarity has one with a usable `image_url`.
3. A designed rarity-colored emblem and an **AWAITING UNITS** message. It is an abstract placeholder, not official unit artwork.

**To set cover art:** After claiming your existing Q&A owner account, go to `https://loreseekerl.github.io/nightfront-td-values/?admin=1#admin` → **HOMEPAGE ART**. Choose a rarity, upload a PNG/JPG/WebP/GIF (max 5 MB) or paste an HTTPS image URL, and click **SAVE COVER**. **USE AUTO** saves a blank cover and switches the homepage back to its same-rarity unit portrait or emblem. You do not need to edit the GitHub source to change the images. Uploads use the existing owner-restricted `nightfront-unit-art` Storage bucket.

**Permissions:** This table can be read by everyone. Only the single verified owner from `public.qa_editors` can update its image URLs. Visitors can't upload files or change covers. Cover changes do not touch unit values, shiny data, or the W/F/L calculator.

## Owner sign-in — email code + password (October 2026)

The Q&A owner editor and private Admin Dashboard share one Supabase Auth session and a single protected owner membership in `public.qa_editors`. An unclaimed owner code is **not** an authenticated account: you must verify your email and then claim ownership using the previously issued one-time code. The owner code and any passwords must never be committed to GitHub.

### First-time setup

1. Open [Supabase Authentication → Email Templates → Magic Link](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/auth/templates). Add `Sign-in code: {{ .Token }}` to the Magic Link email body, and **keep its existing `{{ .ConfirmationURL }}` login link**. Save. This is a project setting and cannot be changed through the website's public publishable key.
2. Confirm [Auth URL Configuration](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/auth/url-configuration): Site URL `https://loreseekerl.github.io/nightfront-td-values/`; redirect URL `https://loreseekerl.github.io/nightfront-td-values/?qa=edit` allowed.
3. Visit `https://loreseekerl.github.io/nightfront-td-values/?qa=edit#qa`. Enter your own email and click **EMAIL ME A SIGN-IN CODE**. Use the *latest* six-digit code in the same browser. If the email contains only a link, that link is still supported. Do not spam the send button: Supabase's built-in SMTP has strict email rate limits.
4. Once signed in, the Q&A owner tools will show **Claim Q&A ownership** if ownership is still unclaimed. Enter the **existing private one-time owner code**. This claim is secured by a restricted database RPC and can happen only once.
5. As the verified owner, open **SET OR CHANGE YOUR OWNER PASSWORD** in Q&A or Admin, choose a unique password of at least 12 characters, and save it.
6. Visit `https://loreseekerl.github.io/nightfront-td-values/?admin=1#admin`. Use **SIGN IN WITH PASSWORD** on later visits. If you forgot it, use the email-code/link option once you regain email access.

**Important:** Installing these changes does **not** automatically claim your owner account, sign you in, send email or change Supabase email templates. The owner personally completes those steps in the Supabase dashboard/browser. Both auth pages also contain a collapsed reminder of the exact email template variable.

**Security:** The public website holds only a Supabase publishable key. Email codes are verified by Supabase via `verifyOtp({email,token,type:"email"})`. Password sign-in uses `signInWithPassword`, and the verified owner can set a password through `updateUser`. Credentials are never saved in the repository. The owner must also be a member of `qa_editors` before any dashboard write is authorized by RLS.

## Owner-only website Admin Dashboard

**Private dashboard URL:** `https://loreseekerl.github.io/nightfront-td-values/?admin=1#admin`

Only a verified Supabase Auth account already listed in `public.qa_editors` (the single claimed **Q&A owner**) can open the editor or write changes. The normal navigation does not expose the admin dashboard. A verified Q&A owner will also see a private dashboard shortcut in the **Q&A owner editor**.

**IMPORTANT — Claim ownership first:** If the owner hasn't completed the one-time Q&A claim, the site has **no authorized admin** yet. Visit `https://loreseekerl.github.io/nightfront-td-values/?qa=edit#qa`, sign in with the email used for the Q&A, and use the existing privately supplied one-time owner claim code. Then open the private dashboard. Do not put the claim code into GitHub, source code, or public documentation.

**Editing units from the website**

1. Open the private dashboard URL, sign in using the same Supabase email as your Q&A owner account if necessary, and wait for owner verification.
2. On **Units & Images**, click **Edit** on an existing unit or **+ Add Unit** to create one.
3. Edit its name, official rarity, normal value in tickets, optional shiny value in tickets, demand, and normal/shiny image URLs.
4. You can instead select a PNG/JPG/WebP/GIF (5 MB max) from your PC for each image. The owner-only upload saves public artwork in the Supabase Storage bucket `nightfront-unit-art` and fills the image link when saving the unit.
5. **Save Unit** updates the shared value list immediately. **Delete Unit** asks for confirmation; it removes the database row but does not automatically delete uploaded artwork.

On **Enchant Bonuses**, edit and save the bonus ticket value for any of the five existing enchantments. Those changes affect the W/F/L calculator for visitors when the list refreshes.

**Security / permissions:** Read access stays public on `units` and `enchants`. Supabase RLS checks authenticated membership in `public.qa_editors` for unit INSERT/UPDATE/DELETE, enchant bonus UPDATE and artwork uploads. Anonymous and other logged-in users have no write access. The admin JS bundle is public like all GitHub Pages source; secrecy of the URL alone is *not* security. No private API keys or service-role keys belong in the browser. The normal and shiny ticket fields are separate from enchant bonuses.

## Adding or editing units

1. Sign in to the [Supabase Table Editor](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/editor).
2. Select `public.units`.
3. Select **Insert row**, or edit an existing row.
4. Enter values:

| Column | Example | Notes |
| --- | --- | --- |
| `name` | `Freddy` | Must be unique. |
| `rarity` | `Common` | Displayed under the name. |
| `category` | `Other` | Legacy database field. No longer used for website filters; you can leave it unchanged. |
| `value` | `10` or *(leave blank)* | Numeric ticket value; blank = N/A (NULL), not 0. |
| `shiny_value` | *(leave blank until known)* | Optional value for the shiny version (in tickets); required for adding a shiny unit to a trade. |
| `shiny_image_url` | *(leave blank or use a public HTTPS image link)* | Optional artwork shown only when shiny is selected. |
| `demand` | `1/10` or *(blank)* | Normal demand; blank = N/A. |
| `shiny_demand` | `3/10` or *(blank)* | Independent shiny demand; blank = N/A. |
| `image_url` | `https://.../assets/freddy.webp` | Public HTTPS URL for artwork. |

Do **not** manually fill `id` or `created_at`; the database generates them.

After saving a row, reload the website or click **Refresh values** to see the update. The homepage's **Newly Added Units** section shows the most recently created units.

## Adding artwork

Images hosted in the same GitHub Pages repository are reliable and free:

1. Commit an image to `assets/`, for example `assets/bonnie.png`.
2. Wait for GitHub Pages to deploy.
3. Set `image_url` for the unit to:
   `https://loreseekerl.github.io/nightfront-td-values/assets/bonnie.png`

Use transparent PNG or WebP where possible. Keep files reasonably small to improve load time.

### Shiny variants

- A unit's normal artwork is stored in `image_url`, and its optional shiny artwork is stored separately in `shiny_image_url`.
- The shiny star on the **All Units** card toggles between normal and shiny if there is a value for the shiny version **or** a shiny image. While shiny is selected, the image and star rotate, a rainbow border glows, and a SHINY label appears. Reduced-motion users see a static variant.
- If no `shiny_image_url` exists, the normal artwork is reused with shiny effects; **there is no need to upload duplicate artwork**.
- Set `shiny_value` to enable the shiny version **in the W/F/L calculator**. If only shiny artwork exists, players can preview it but cannot put it in a trade at an unknown price.
- Leave `shiny_value` and `shiny_image_url` blank until you know the actual shiny value and/or have an image. Don't put enchant names, icons or effects in these fields: enchantments will get a separate system later.
- Rotating effects apply only to the shiny variant; they do not alter the original character's stored image.

## Demand & Value Trends

The public **MORE → Demand & Trends** page is at `#trends`. Every unit card also shows separate normal/shiny unit-value trend and demand trend badges. In the All Units list, clicking ★ switches the value trend badge to the shiny variant while keeping demand separate.

**Meaning of the labels:** Trends are calculated from actual records in `public.unit_value_history` over the most recent **30 days**. For each unit, the site sums recorded differences between old and new values for normal unit values, shiny unit values (both in tickets), and numeric demand ratings. The result is **Rising** when net movement is positive, **Dropping** when negative, and **Stable** when recorded net movement is zero. **New units start as Stable by default** when a starting snapshot and valid value/rating exist (such as Freddy's initial 10-ticket record). This starting Stable is only a display default, **not proof that a price stayed constant**. Real updates override the starting status. Missing shiny values or invalid demand ratings still show **Not enough history** instead of pretending an unavailable value is Stable.

Demand scores support the explicit `1/10` … `10/10` format; other text like `Medium` is still displayed but can't be converted into a numeric movement or demand bar. The user can filter by value and demand trends, sort by demand rating, unit price, name or largest net ticket gain, and open the detailed historical graph.

The overview fetches live units and the newest **1,000** history entries. It shows this cap when reached. Trend labels are indicators of recorded ticket/demand movements, not market predictions, and don't alter any W/F/L calculation. Visitors only have read access; they cannot edit history or manually assign fake trends.

## Public Update History / changelog

The new public **MORE → Update History** page is at `#updates`, with a homepage shortcut in **MORE THAN JUST VALUES**. It is a chronological, handmade-style update log combining two read-only database sources:

- `public.unit_value_history` — records **new units**, changes to **normal/shiny unit ticket values**, and **demand**. This table already tracked values before the changelog was added.
- `public.enchant_change_history` — records **new enchantments**, changes to their **ticket bonus**, and enchant renames. This second table is filled automatically by an AFTER INSERT/UPDATE trigger on `public.enchants`.

Every entry includes a real timestamp and any available before/after values. The page supports filters for new units, value changes, demand changes, enchant activity and tracking-started snapshots; searchable names; a **Refresh** button; **Show More** pagination; and links to the existing per-unit Value History detail page.

**No invented history:** Changes made before logging was enabled cannot be reconstructed. Existing units/enchantments get an explicitly labeled **TRACKING STARTED** baseline, not a fictional `UNIT ADDED` or `ENCHANT UPDATED` entry. Future changes made by an authorized owner or directly in Supabase are logged without any manual changelog entry. Current records remain unchanged by setting up the log.

**Security:** Both history tables allow public read access but no direct client writes. Enchant history is written by a restricted database trigger, and unit history by the existing trigger. Ordinary visitors cannot forge updates. The public changelog fetches the newest 400 unit events and newest 250 enchant events before combining them, and it states when those limits are reached. No editing interface or private credentials are exposed.

## Automatic Value History

**Value History** is a public page under **MORE → Value History** at `#history`. Individual unit cards also have a **Value history** button that opens that unit's timeline and normal/shiny unit-value graph.

Supabase table `public.unit_value_history` is filled automatically by an AFTER INSERT/UPDATE trigger on `public.units` (including edits made directly in the Supabase Table Editor or the owner dashboard). It records:

- Timestamp, unit name and rarity snapshot
- Old and new normal ticket values
- Old and new values of shiny units (in tickets) (when shiny values exist)
- Old and new demand
- A special event type for initial tracking, new units, or actual changes

**Honest starting point:** Tracking was enabled on October 10, 2026. Existing units received a snapshot marked **TRACKING STARTED** on that date, not a made-up backdated change. A new unit gets **UNIT ADDED**; changing ticket values, shiny values or demand gets **VALUE UPDATED** automatically. Renaming or changing artwork alone doesn't create a misleading value-change record.

The public site reads only the **newest 400 entries** for fast loading. Filtering and graphing operate on those fetched entries; older history is still in Supabase and is not deleted by the website. If a unit is deleted, its history rows are preserved and retain the last recorded unit name.

**Security:** RLS permits anonymous and logged-in visitors to SELECT historical entries, but neither may INSERT/UPDATE/DELETE this history directly. The trigger writes entries as a privileged database function whenever a permitted owner edit or authorized database edit changes `public.units`. Visitors cannot fake history events through the public website.

## Trade calculator

The Nightfront-style calculator is at `#calculator`:

1. Open **W/F/L CALCULATOR**, then press **+** in the **ME** or **YOU** panel.
2. Search for a unit, optionally filter by rarity, and click its tile.
3. Choose a quantity (1–99). Shiny can be selected only if the unit has a value for the shiny version.
4. Open the **Enchantment** menu and choose No Enchantment, Engineered, Pizza Party, Phantom, Fazbear Entertainment, or Afton Robotics. This choice is separate from Shiny.
5. Click **Add to ME / Add to YOU**. Each offer entry includes **Edit** (change its unit, quantity, shiny status or enchant without removing it) and **×** (remove it).
6. Below the trade columns you'll see **base tickets + enchant bonus tickets**, two proportional value bars, and the W/F/L difference with a percentage of **your side's** total. **W** = their offer is worth more, **F** = equal ticket values, **L** = your offer is worth more. The percentage is omitted if your total is zero.
7. **Clear** empties one column, **Clear entire trade** resets both, and **Swap sides** exchanges the offers.
8. Use **Copy** in the **Trade Text** section to share the selected units, enchantments, both total ticket values and the W/F/L difference.

The unit picker displays a live **total for quantity × (base + enchant)** before you add or save the item. Ticket calculations use current unit values and live enchant bonuses from Supabase; nothing needs to be saved to a separate trade database. Trades are local to the open page, so refreshing clears the offers. These results compare listed ticket values, **not** demand, rarity preferences or liquidity.

### Enchantment ticket bonuses

A unit can carry **one enchantment**. Each enchantment adds a flat ticket bonus **per unit** to the normal or shiny value:

| Enchantment | Extra tickets per unit |
| --- | ---: |
| No Enchantment | +0 |
| Engineered | +20 |
| Pizza Party | +50 |
| Phantom | +60 |
| Fazbear Entertainment | +100 |
| Afton Robotics | +1,000 |

Trade total formula: `(normal OR shiny unit value (in tickets) + enchant ticket bonus) × quantity`.
For example, two 10-ticket Freddys each with Pizza Party are worth `(10 + 50) × 2 = 120` tickets; a 25-ticket Shiny Freddy with Afton Robotics is worth `25 + 1000 = 1025` tickets. W/F/L automatically includes both sides' bonuses. No Enchantment uses the base value.

**Edit enchant bonuses in Supabase:** Open [Supabase Table Editor](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/editor), then `public.enchants`. Change `bonus_tickets` to update the live calculator for everyone (they can reload/refresh). `sort_order` changes the menu order. Don't change an enchant's `id` unless you also intend to change the identifier the site stores for that enchant.

The public site only has permission to **read** enchantments. Website visitors cannot change enchant values through the browser. These are additional ticket values, not shiny values, and they do not alter the unit's database `value`.

The **Last Updated** section uses `units.updated_at`, automatically set by a Supabase trigger whenever a unit record is edited.

## Homepage categories & rarity filters

The homepage features the official **seven Nightfront rarity tiers** (Common, Uncommon, Rare, Epic, Mythic, Secret, and Glitched). A rarity tile automatically displays a real unit portrait when that rarity contains an image-backed unit; otherwise the tile displays a styled rarity name, without fake character artwork or empty unit counts. Clicking the tile filters the All Units page by that rarity. Glitched has an animated blue/purple treatment that honors reduced-motion settings.

The old FNTD collection filters (Developer/ARG, Forgottens, Apexes, and similar) are no longer part of the website. The **All Units** page has one custom dropdown for the official seven rarities, plus matching rarity chips.

## Developer Q&A — exclusive owner

The **MORE → Developer Q&A** page is powered by `public.qa_entries` in Supabase. Regular visitors can see **published** questions, but they **cannot see the owner editor controls**. The owner signs in with the private link `https://loreseekerl.github.io/nightfront-td-values/?qa=edit` and only a verified owner session unlocks **Edit Q&A**.

### One-time owner claim

1. Go to [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/auth/url-configuration). Set the site URL to `https://loreseekerl.github.io/nightfront-td-values/` and add the exact redirect URL `https://loreseekerl.github.io/nightfront-td-values/?qa=edit`.
2. Visit the **private editor URL** `https://loreseekerl.github.io/nightfront-td-values/?qa=edit#qa` and sign in by email.
3. After sign-in, enter the **one-time owner claim code**, which must be delivered privately to the owner. **Never commit or share the code in GitHub.**
4. Once a valid claim is made, the one and only owner account can edit the Q&A. All other logged-in accounts are denied, and the claim form disappears after ownership has been claimed.

Ownership is enforced in Supabase, not merely by hiding the edit button. A unique database index permits **exactly one** `qa_editors` record. The owner-claim code's hash is stored in a private non-public schema and is invalidated on first successful claim.

### Editing questions after claiming

The owner can add, edit, delete, reorder, and publish/unpublish Q&A items from the website. They can also use the authenticated [Supabase Table Editor](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/editor) to maintain `qa_entries`:

- `question`: 3–220 characters; red on the public page
- `answer`: 1–5,000 characters; white on the public page
- `sort_order`: smaller values appear earlier
- `published`: false hides an entry from the public page

Optional inline color tags `[green]text[/green]`, `[red]text[/red]`, `[orange]text[/orange]`, and `[blue]text[/blue]` are supported; the site escapes arbitrary HTML.

**Security:** Public sessions may read published `qa_entries` only. The unique, privately claimed authenticated owner alone has database permission to insert, update, or delete through row-level security. No private Supabase keys or claim codes are shipped in website assets. Changing website CSS cannot bypass these permissions.

## Security

- Supabase Row Level Security (RLS) is enabled on `public.units`.
- The public website uses only the Supabase *publishable* API key and **read-only** access to units.
- Never place a Supabase service-role key, database password or private API token in this repository.
- Owners currently edit values through the authenticated Supabase dashboard. Do **not** add an unauthenticated admin form or grant anonymous INSERT/UPDATE/DELETE policies.

## Updating the live website

GitHub Pages deploys the `main` branch from the repository root. After changing CSS or JavaScript, increment the version query string in `index.html` (e.g. `style.css?v=2`) if browsers keep an older cached version.

Thanks for helping build Nightfront TD Values!
