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
