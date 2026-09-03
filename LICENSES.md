# Third-party licences

IronLog bundles the following third-party material. See
`docs/ART_LICENSING.md` for the obligations these place on the project, and for
the one that is not yet settled.

---

## Exercise catalogue and media — licence NOT established

1069 exercise names, instruction steps, common-mistake notes, muscle-worked
figures (`src/data/muscleArt/`, `src/data/exercises/`) and demonstration videos.

**Source:** pages under https://fitbod.me/exercises/ — one per exercise. Each
catalogue entry records the exact page it came from in its `url` field, and the
app's Credits screen is generated from those.
**Licence:** none identified. No grant is asserted here.

Unlike the Wikimedia Commons set this replaced, the figure is **adapted** rather
than redistributed verbatim: the 1069 near-identical source drawings are
collapsed into one template plus a per-exercise region map.

This is unresolved and blocks distribution. See `docs/ART_LICENSING.md`.

---

## react-native-body-highlighter — MIT

Muscle-map body artwork and component, used by the volume heatmap and the
custom-exercise editor.
**Source:** https://github.com/HichamELBSI/react-native-body-highlighter

```
MIT License

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Software dependencies

Runtime dependencies are MIT-licensed, with the exception of `drizzle-orm`
(Apache-2.0). Apache-2.0 adds a NOTICE-reproduction duty over MIT; Drizzle
ships no NOTICE file, so there is nothing further to reproduce.
