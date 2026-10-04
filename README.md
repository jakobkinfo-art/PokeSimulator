# Pokémon Pack Lab

A local Pokémon game lobby with a Base Set pack opener, real market prices and a virtual USD wallet, a personal collection, a searchable Pokédex, a silhouette quiz and Pokémon Memory.

## Run

Requires Node.js 18 or newer. No packages need installing.

```sh
npm start
```

Open http://127.0.0.1:4317. The server only listens on the local machine. You can also open `index.html` directly; using the server gives browser storage a consistent origin. Progress belongs to the browser and address used. Export a collection before switching browsers or addresses.

```sh
npm run check
npm test
```

## Design

The layout follows the requested reference, https://virtualfreecasinofullsize.pages.dev: a permanent left game menu, a central game area, secondary game tiles and a trainer dashboard on the right. Mobile uses a drawer. Every game in the menu is Pokémon-themed.

The visual identity uses a Kanto landscape, deep blue and forest green surfaces, warm yellow accents, Poké Ball details and condensed headings. The backdrop, original booster photographs and mini-game artwork are stored locally. Booster photos retain their original colors and proportions; CSS outlines crop the white background without making the silver foil transparent. Card scans and Google Fonts still require internet access.

## Games and saved progress

- **Base Set Opener:** eleven cards, foil-opening animation, card-by-card reveals, foil shine, optional sound, quick opening and collection milestones.
- **Who's that Pokémon?:** 31 original Pokémon, four answers, immediate feedback, a current streak and $500 in virtual funds for every 10 correct answers in total.
- **Pokémon Memory:** six randomly selected pairs, move counter and matching feedback.
- **Trainer hub:** collection and binder views, favourites, search, full Base Set reference library, opening history, import and export.

The pack outcome and purchase are committed together before animation. Refreshing, rapid clicking and skipping never reroll or charge again for an existing pack. Unrevealed cards stay hidden from displayed collection statistics and cannot be sold. Quiz session scores and Memory scores last for the current session; cumulative quiz reward progress is saved with the wallet.

## Market prices and virtual funds

- Start with **$10,000.00 in virtual USD**. Pack purchases and card sales use the actual TCGplayer USD market amount, with no multiplier, rarity estimate or sale fee.
- The English **Base Set Booster Pack [Revised Unlimited Edition]** is TCGplayer product **138130**, group **604**, category **3**. Its bundled market price is **$927.56**, from the TCGCSV data build dated **2 October 2026**. All three wrappers represent that same product; artwork selection is cosmetic.
- Each owned card has a **Sell one** button directly in the collection and in its detail dialog. The full card price is credited to the wallet and can immediately fund another pack. **Sell duplicates** keeps one of each card and skips favourites.
- Every **10 correct quiz answers** earns **$500.00 in virtual funds**. Wrong answers and “Start fresh” do not erase reward progress. Reloading cannot repeat the reward.
- **Reset to $10,000** changes only the wallet balance. Collection, history and quiz progress remain. The existing full-progress reset is separate.
- Balances and transactions are stored as integer USD cents. Each new pack records the actual price paid, so later market changes do not rewrite its receipt.
- All funds and trades are local simulations with no cash or redeemable value.

[TCGdex](https://tcgdex.dev/markets-prices) provides TCGplayer USD card market prices without an API key. The adapter matches Base Set card IDs and uses normal/unlimited or holofoil/unlimited-holofoil prices; it does not substitute first-edition or reverse-holo prices. [TCGCSV](https://tcgcsv.com/docs) provides the separate sealed booster quote through the local server's `/api/pack-price` endpoint. These are market guides, not a promise that every seller, condition or individual printing has the same price. Shipping and tax are not added.

The bundled snapshot was fetched on **3 October 2026** and covers all **101 booster-eligible cards**. Starter-only Machamp has no matching normal/holofoil quote and displays **Price unavailable**. An item without a verified quote cannot be traded. Each card detail shows its source, variant, amount and update date; the pack opener links its exact market product and shows the quote date.

Prices are cached separately for 24 hours. A manual card refresh is available in the collection. Four bounded card requests run at a time, with a timeout and early stop after repeated network failures. The server shares one daily pack lookup across tabs, checks TCGCSV's build timestamp first and uses its required application User-Agent. It avoids browser CORS restrictions. Missing or failed quotes retain their dated last-known price; no prices are invented. The bundled snapshot also works when opening `index.html` directly, but live pack updates require the local server.

On Windows, if Node cannot validate the network's certificate chain, the server uses PowerShell's native HTTPS client for the fixed public market endpoints. Normal Windows certificate validation remains enabled.

`pricing.js` contains quote validation and caching. `START_BALANCE` and `QUIZ_REWARD` at the top of `app.js` are integer cents; `QUIZ_TARGET` is an answer count. Pack cost comes from the market quote. To refresh the bundled snapshot on a network-enabled Node installation, run `node tools/refresh-prices.cjs`.

The pack model uses five Commons, three Uncommons, two Basic Energy cards and one Rare slot. The Rare slot is a Holo with probability 1/3. Machamp is reference-only because it is excluded from this simulator's booster pool. These are simulation settings, not a claim of exact factory odds.

Collection storage: `packLab.baseSet.v2` (save schema version 3). Version-one saves, including `vfcPokemonBaseSetPrototype.v1`, migrate with their collection intact and a fresh $10,000 balance. Version-two saves preserve the displayed balance number in virtual USD (10,000 old coins becomes $10,000.00), converting money fields to cents once; cards and quiz progress remain. Old pack receipts are labelled as earlier saves instead of inventing a market price paid. Export/import includes wallet and quiz reward progress. Save validation accounts for owned plus sold cards and reserves unrevealed cards. Web Locks serialize purchases, sales and rewards across tabs where supported.

## Verification

Automated tests cover 5,000 generated packs, collection accounting, duplicate Energy cards, unrevealed-card handling, repeat clicks, reloads, legacy saves, milestones, rejected imports, quiz scoring, Memory locking/reset/completion, card flight timing, purchases, insufficient funds, sales, protected duplicates, wallet reset, cumulative rewards, cached API failures, variant matching and bundled price coverage.

## Files

- `index.html`: accessible navigation, panels and original Base Set data.
- `styles.css`: Pokémon theme and responsive lobby layout.
- `components.css`: reveal, binder, library and dialog styles.
- `app.js`: pack engine, persistence, interface and mini-games.
- `pricing.js`: TCGdex/TCGCSV quote validation, caching and exact USD cents.
- `pack-prices.mjs`: cached server-side sealed booster pricing.
- `market-fetch.mjs`: HTTPS market requests with native Windows certificate support.
- `price-snapshot.js`: dated public market quotes for offline use.
- `assets/kanto-world.png`: generated Pokémon background.
- `assets/pokemon/`: 31 local Pokémon game illustrations.
- `assets/packs/`: three unmodified original booster photographs.
- `tests/simulator.test.cjs`: tests that run the production game functions.

The original `C:/Users/jakob/Desktop/index.html` has not been replaced. This version is not deployed.

## Artwork provenance

The exact generated-background prompt and generation mode are in [ARTWORK.md](ARTWORK.md). Mini-game illustrations come from the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/other/official-artwork). Other reference credits are available from the site's “Artwork credits” control. Pokémon is owned by its respective rights holders; this is an unofficial fan project.
