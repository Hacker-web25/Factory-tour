# The personal welcome

When someone scans the QR printed on **their own** letter, the page opens with
"welcome" written out by an invisible pen, over translucent blue glass, in about
two seconds. It says only "welcome": a name on the screen reads as "we are
tracking you". (`WELCOME_SAYS_NAME` in `lib/hiLinks.ts` brings the name back.) Everyone else (Google, a shared link, a
returning customer) gets the normal page and never downloads any of this.

```
scan  →  /hi/aryan-k7m2xq  →  one DB lookup  →  302 to /?utm…&vpv=K7M2XQ
                                              + cookie vpv_hi=1 (1 hour; a marker, no name)
page  →  tiny gate (lib/welcome/gate.ts) sees ?vpv= AND the cookie
      →  paints a blue CSS cover, fetches /welcome/welcome.js
      →  overlay writes the words, dissolves into the page
```

## Files

| File | What |
|---|---|
| `welcome.src.js` | The animation. **Edit this one.** |
| `satisfy.json` | Pen paths for A–Z, a–z, `'`, `-`, `.`, plus spacing fixes (`k`). |
| `build.mjs` | `node scripts/welcome/build.mjs` → `public/welcome/welcome.js` |
| `public/welcome/welcome.js` | The built file the browser loads. Never edit by hand. |
| `lib/welcome/gate.ts` | The few hundred bytes every QR page carries. |
| `tests/units/welcome.test.ts` | Fails if the built file is stale, the gate is wrong, or the pages lose the gate. |

After changing `welcome.src.js` or `satisfy.json`: run the build, then **bump
`WELCOME_VERSION` in `lib/welcome/gate.ts`**, or browsers keep the old script.

## Where the handwriting comes from

The strokes are the hand-traced pen paths of the **Satisfy** typeface (SIL Open
Font License 1.1, Sideshow) as published for the **Vara** text-drawing library
(MIT, Ak Zhy, <https://github.com/akzhy/Vara>). They are centre-line paths, so
the pen follows each letter the way a hand would, which a fill or a left-to-right
wipe cannot do. Both licences allow this use; the notice is kept at the top of
the built file.

Spacing: letters are placed side by side by their ink width, as Vara does.
`j` and `p` have a hook on the left that leaves a hole, so `k` pulls them in.
To check a new batch of names, render them with the layout in `welcome.src.js`
and look for gaps; add the letter to `k` if one appears.

## Behaviour worth knowing

* Shown once per tab (`sessionStorage vpv_hi_seen`). Tap, click or Esc skips it.
* `prefers-reduced-motion`: no writing; the finished words show for a moment.
* A name with letters we have no pen path for (Devanagari, say) is shown as
  ordinary text instead of a row of missing boxes.
* If the script never arrives, the cover disappears after four seconds.
* It writes `window` event `vpv:welcome` (`{skipped, ms, ink, reduced}`) when it
  finishes; the tracker turns that into `welcome_seen` / `welcome_skipped`.
* The cookie holds only the marker "1" (no name), lives an hour, and is documented on
  `/cookies`. The name is never in the address, so it never reaches Google
  Analytics or Clarity.
