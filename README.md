# RANK WHAT YOU KNOW 🏆

Btown's monthly community power ranking — part of the Btown Games arcade.

Every month gets a category of real Burlington-area places (creemee stands,
swimming holes, pizza joints…). You check off only the places you've
**actually been**, drag-rank those, and the site computes a weighted
community ranking designed to make the whole town argue.

**Play it:** https://btownbrief.github.io/rank-what-you-know/

## How the math works

On a ballot ranking *n* items, the item in position *r* earns
`(n − r + 1) / n`. An item's community score is the mean of its earnings
across every ballot that included it; items need **3+ ballots** to chart.
Longer ballots spread credit more finely, so ranking something 1st out of
12 says more than 1st out of 2. Your **% match with Burlington** is the
Spearman rank correlation between your ballot and the community order on
your shared items, mapped to 0–100%.

## Stack

Plain static site — no build step. `index.html` + `style.css` + `js/` ES
modules, deployed by GitHub Actions to Pages. Ballots live in the shared
Btown Games Supabase project (`supabase/schema.sql`, RLS-locked,
RPC-only access). Player identity is the shared arcade identity
(`btown-*` localStorage keys), so your name follows you across games.

- `data/categories.json` — the 12 monthly categories (edit freely; the
  live month is picked by `YYYY-MM` key)
- `?month=YYYY-MM` — preview/test any month
- Past months render as frozen results pages with a
  "copy results as text" button for the newsletter

A Btown Games production · [Read the Btown Brief →](https://www.btownbrief.com)
