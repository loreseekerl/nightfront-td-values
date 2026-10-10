# Nightfront TD Values

A community trading value list for Nightfront TD, hosted on GitHub Pages and powered by a shared Supabase database.

**Live site:** https://loreseekerl.github.io/nightfront-td-values/

## How this works

- `index.html` — homepage, all-unit list and W/F/L calculator.
- `style.css` — black-and-blue responsive design.
- `app.js` — reads unit values from Supabase and powers filters and trades.
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
| `value` | `10` | Numeric value in tickets. |
| `shiny_value` | *(leave blank)* | Optional. Until entered, the unit's shiny star is disabled. |
| `demand` | `1/10` | Displayed as text. |
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

## Trade calculator

The Nightfront-style calculator is at `#calculator`:

1. Open **W/F/L CALCULATOR**, then press **+** in the **ME** or **YOU** panel.
2. Search for a unit, optionally filter by rarity, and click its tile.
3. Choose a quantity (1–99). Shiny can be selected only if the unit has a shiny ticket value.
4. Click **Add to ME / Add to YOU**. Remove a unit using its × button when necessary.
5. Compare the tickets shown below each offer. **W** means their offer is higher; **F** means equal; **L** means your offer is higher.
6. Use **Copy** in the **Trade Text** section to share the two offers.

The **Last Updated** section uses `units.updated_at`, automatically set by a Supabase trigger whenever a unit record is edited.

## Homepage categories & rarity filters

The homepage features the official **seven Nightfront rarity tiers** (Common, Uncommon, Rare, Epic, Mythic, Secret, and Glitched). A rarity tile automatically displays a real unit portrait when that rarity contains an image-backed unit; otherwise the tile displays a styled rarity name, without fake character artwork or empty unit counts. Clicking the tile filters the All Units page by that rarity. Glitched has an animated blue/purple treatment that honors reduced-motion settings.

The old FNTD collection filters (Developer/ARG, Forgottens, Apexes, and similar) are no longer part of the website. The **All Units** page has one custom dropdown for the official seven rarities, plus matching rarity chips.

## Developer Q&A — owner-editable

The **MORE → Developer Q&A** page is powered by `public.qa_entries` in Supabase, not hardcoded website text.

### Fastest editing method (works right away)

Open the [Supabase Table Editor](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/editor) and choose `qa_entries`. Insert or edit a row:

- `question`: the question in red (3–220 characters)
- `answer`: white answer text (1–5,000 characters)
- `sort_order`: smaller numbers appear first
- `published`: turn off to hide a question from the public page
- `id`, `created_at`, `updated_at`: leave their automatically generated values alone

Visitors see published changes after refreshing the Q&A page. Owner-only editing is also built into the website, but requires an approved Supabase Auth account.

### Activate the website editor

1. In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/edmijiqrwtuakmpqnepw/auth/url-configuration), set **Site URL** to `https://loreseekerl.github.io/nightfront-td-values/` and add this exact **Redirect URL**: `https://loreseekerl.github.io/nightfront-td-values/?qa=edit`.
2. On the website, open **MORE → Developer Q&A → Edit Q&A (owner only)** and request an email sign-in link.
3. Open the sign-in link, then approve that exact Supabase Auth user ID. A privileged editor in the Supabase SQL Editor can run the following, with the owner's email substituted:

   ```sql
   insert into public.qa_editors (user_id)
   select id from auth.users where email = 'owner@example.com'
   on conflict (user_id) do nothing;
   ```

4. Refresh the Q&A page. The website editor then offers **Add**, **Save changes**, **Delete**, **Order**, and **Published** controls.

For inline color accents in answers, optional tags `[green]text[/green]`, `[red]text[/red]`, `[orange]text[/orange]`, and `[blue]text[/blue]` are supported. The website escapes all other HTML.

**Security:** `public.qa_editors` is owner-managed and cannot be written by visitors. RLS on `public.qa_entries` allows public read of published entries only; only approved authenticated users may insert, update, or delete Q&A entries. The publishable key in browser code is not an admin secret. Never add a `service_role` key to GitHub.

## Security

- Supabase Row Level Security (RLS) is enabled on `public.units`.
- The public website uses only the Supabase *publishable* API key and **read-only** access to units.
- Never place a Supabase service-role key, database password or private API token in this repository.
- Owners currently edit values through the authenticated Supabase dashboard. Do **not** add an unauthenticated admin form or grant anonymous INSERT/UPDATE/DELETE policies.

## Updating the live website

GitHub Pages deploys the `main` branch from the repository root. After changing CSS or JavaScript, increment the version query string in `index.html` (e.g. `style.css?v=2`) if browsers keep an older cached version.

Thanks for helping build Nightfront TD Values!
