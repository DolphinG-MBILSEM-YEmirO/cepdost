# Store screenshots

Ready-to-upload images for the App Store and Google Play (see
`mobile/MAGAZA.md` section 3 for what goes where). They were made from the
real app with demo accounts, so they can be made again after the interface
changes.

## Making them again

Needs Node, Python 3 with Pillow, and Playwright's Chromium. Work in an empty
folder (the tools write `state-*.json`, `foto/`, `raw/` and `store/` there):

```bash
T=<repo>/mobile/store-assets/tools
# 1. Local relay and app (two terminals, from the repo root)
node scripts/relay.mjs 7777
npx vite --port 5173 --host 127.0.0.1
# 2. Demo photos (or put real ones in foto/ with the same names)
python3 $T/fotolar.py
# 3. Demo world: 5 accounts, friends, a group with a group plan, invites, posts
for s in hesap arkadas grup grupyanit davet paylasim; do node $T/seed.cjs $s; done
# 4. Raw captures as Elif (1320x2868)
node $T/cek.cjs 2-hatirlatma '[["t","Hatırlatmalar"],["w",1500]]'
node $T/cek.cjs 7-plan '[["t","Hatırlatmalar"],["w",1500],["t","🎬 Sinema",0],["w",2500]]'
node $T/cek.cjs 3-grup '[["b","Sohbet"],["w",1200],["t","Hafta sonu ekibi",0],["w",3000]]'
node $T/cek.cjs 5-arkadas '[["b","Sohbet"],["w",1200],["t","Arkadaşlar",0],["w",2500]]'
node $T/cek.cjs 4-akis '[["b","Akış"],["w",3500]]'
node $T/cek.cjs 6-profil '[["b","Profil"],["w",2500]]'
# 5. Framed store images and the feature graphic -> store/
node $T/frame.cjs && node $T/grafik.cjs
```

The relay keeps everything in memory: restarting it means starting from
step 3 again (delete the `state-*.json` files first). Captions live in
`frame.cjs`; the plan times in `seed.cjs` are relative to today, so seed and
capture on the same day.
