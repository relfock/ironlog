# Exercise illustration sourcing — research findings

Research-only task. No code changes.

## Verified findings so far

### DISQUALIFIED: free-exercise-db / wrkout exercises.json
- Repos: github.com/yuhonas/free-exercise-db, github.com/wrkout/exercises.json
- Repo license: The Unlicense — but this covers only what the authors owned.
- Maintainer (yuhonas), issue #2: "I actually have no idea where the images are from
  or if they are royalty free so usage would be at your own risk"
- Upstream issue wrkout/exercises.json#305: reverse image search traced images to
  bodybuilding.com; commenter concluded "the license status is clearly infringing."
  Repo owner did not dispute; pivoted to selling his own 3D renders at wrkout.xyz.
- Instruction PROSE is also verbatim bodybuilding.com copy -> text is infringing too,
  not just images.
- Verdict: unusable. Widely used by indie apps anyway; that does not make it safe.

### *** THE ANSWER: Commons Category:Weight_training_diagrams ***
- https://commons.wikimedia.org/wiki/Category:Weight_training_diagrams
- **933 files**, predominantly SVG, ~1121x1200 viewBox (true vector, resolution-independent)
- Single coherent set, author Everkinetic, source db.everkinetic.com, CC BY-SA 3.0 Unported
- Consistent naming: "<Exercise name> 1.svg" (start) / "<Exercise name> 2.svg" (end)
  => ~466 exercises x 2 poses. Comfortably exceeds the 180 needed.
- Confirmed coverage of the core gym vocabulary: Bench press, Barbell dead lifts,
  Barbell shoulder press, Arnold press, Bicep curls with barbell, Cable crossover,
  Chest dips, Close grip barbell bench press, Concentration curls with dumbbell,
  Decline barbell bench press, Butterfly machine, Crunches, Body row, Air bike,
  Ab rollout, Calf raises, Cuban dumbbell press, Alternating hammer curl...
- Parent cats: Weight training, Sports diagrams, Exercise diagrams, Language-neutral diagrams
  ("language-neutral" = no baked-in text, good for i18n)
- Harvest: Commons API list=categorymembers + prop=imageinfo&iiprop=url|extmetadata
  gives per-file URL + license + author for machine-generated attribution.
- CAVEAT — format is mixed within the set. Of the 933 files, ~560 are SVG; the rest are
  PNG/GIF at mixed resolutions (some good: 672x1024 / 1024x670 / 877x1024;
  some poor: 221x275 for the oldest 2010 uploads). Same artist throughout, so the
  *visual* style stays consistent, but some exercises exist ONLY as raster.
  Verified examples of raster-only: leg press ("Leg-press-1-1024x670.png",
  "Narrow-stance-leg-press-1-1024x671.png"), wide-grip lat pulldown (GIF only).

#### Coverage audit (corrected) — per-keyword counts inside the category
- "squat" 80 files: front, back (narrow/wide), hack, Smith hack, sissy, overhead,
  Jefferson, Zercher, speed, one-leg, pile, squat-to-bench
- "raise" 100 files: ~25 calf raise variants, ~15 lateral/rear-lateral, ~8 front raise,
  leg raises, hip raises, bent-over rear delt
- "row/deadlift/press" 172 files: barbell/dumbbell/cable/T-bar/Smith/body rows;
  incline+decline chest press
- "dead" 22 files: Barbell dead lifts, Dumbbell dead lifts, **Romanian dead lift**,
  Smith machine dead lifts — all SVG
- "pull" 76 files: Wide grip lat pull down (SVG), Underhand pull down, Pull ups,
  Wide grip chin up, Narrow parallel grip chin ups, decline barbell pullover
- "shoulder" 16 press files: barbell, dumbbell, machine, seated military, one-arm,
  incline, plus Arnold press
- "leg" 49 files: seated/standing/lying leg curl, leg extensions, leg press (PNG),
  calves press on leg machine
=> The 180-exercise target is comfortably met.

#### IMPORTANT: naming quirks require an alias/fuzzy mapping layer
The set writes compound words as TWO words. "dead lift" not "deadlift";
"pull down" not "pulldown". A naive exact-match against a standard exercise
list will produce false "missing" results (this tripped up the first pass of
this very audit). Build an alias table.

#### Genuine gaps found
face pull, goblet squat, Bulgarian split squat.
- Verified present: seated/standing/lying leg curl, leg extensions, calves press on leg
  machine, single-leg squat, flat bench leg raises, crunches on stability ball.

#### Technical suitability for Android (verified on File:Bench press 1.svg)
- Direct URL via Commons API: upload.wikimedia.org/wikipedia/commons/7/74/Bench_press_1.svg
- 1120x1200, **20,163 bytes**, viewBox="0 0 896 960"
- TRUE VECTOR: ~45-50 <path> elements, single <g> transform wrapper.
  No embedded base64 raster. No <defs>, no gradients.
- **No fill attributes at all** -> renders black by default -> trivially themeable.
  Set tint at runtime for light/dark mode. Ideal for Android VectorDrawable
  (Android Studio's SVG import handles path-only, gradient-free SVGs cleanly).
- Budget: 180 exercises x 2 poses x ~20KB = ~7.2MB raw SVG;
  ~3-4MB after svgo, less again as VectorDrawable XML in a compressed APK.
- extmetadata from the Commons API returns LicenseShortName ("CC BY-SA 3.0") and
  Artist ("Everkinetic") per file -> attribution screen can be generated automatically.

#### Verified working harvest recipe (one query gives a full manifest)
  https://commons.wikimedia.org/w/api.php?action=query
    &generator=categorymembers
    &gcmtitle=Category:Weight%20training%20diagrams
    &gcmtype=file&gcmlimit=500
    &prop=imageinfo
    &iiprop=url|size|mime|extmetadata
    &iiextmetadatafilter=LicenseShortName|Artist|Credit
    &format=json
Returns per file: direct upload.wikimedia.org URL, byte size, dimensions, mime,
LicenseShortName, Artist, Credit. Pages via `gcmcontinue` token. Filter mime to
image/svg+xml to get the ~600 clean vectors and skip the raster duplicates.

#### Two layout gotchas found in the data
1. **Aspect ratios are NOT uniform.** Bench press 1.svg is 1120x1200 (portrait);
   Ab rollout on knees with barbell 1.svg is 1200x858 (landscape). The UI needs a
   flexible/aspect-fit container, or normalize viewBoxes at build time.
2. **Artist string capitalization varies** ("everkinetic" vs "Everkinetic") — normalize
   before grouping for the credits screen.
3. Frame 1 = start position, frame 2 = end position. Free UX win: alternate the two
   frames on a ~1s timer for a crude but effective 2-frame animation.

### Same set, other distribution channels
- Original artwork by Everkinetic (Greg Priday), everkinetic.com / db.everkinetic.com
- License: CC BY-SA 3.0 Unported (Commons uploads); CC BY-SA 4.0 on github.com/everkinetic/data
- Commons: ~1089 files cite Everkinetic as source; ~560 of them are SVG
  (~280 exercises x 2 poses). Coverage confirmed for common lifts:
  Bench press, Arnold press, Seated military press, Walking lunges,
  Biceps curl with dumbbell, Jefferson squats with barbell, Hip adduction, etc.
- github.com/everkinetic/data dist/svg has only 192 SVGs (96 exercises) — Commons is a superset.
- PNG/GIF versions are low-res (~221x275) — use the SVG variants.
- Derived SVG conversions: github.com/chaosbastler/opentraining-exercises (CC BY-SA 3.0,
  shipped in the F-Droid Android app "Open Training" — real-world vetting)
- Share-alike analysis (CC FAQ): bundling unmodified images in an app = "collection"/
  aggregation, app code stays proprietary. Only MODIFIED images become adaptations and
  must themselves be CC BY-SA. Attribution required.

### CAUTION: bryllim/workout-guide
- 302 exercises, 906 SVGs @512x512, code MIT / art CC BY-SA 4.0, npm deliverable
- RED FLAG: repo created 2026-08-24, pushed 2026-08-25, yet 656 stars / 111 forks
  in 2 days — implausible velocity.
- ATTRIBUTION.md: only 76 first-pose frames are traced from Everkinetic. The other
  ~226 exercises' art has unexplained provenance ("created by Bryl Lim").
- Verdict: use only the Everkinetic-traced subset, or treat whole repo as unvetted.

### CAUTION: RepDB (github.com/sergei-argutin/exercise-dataset, repdb.co)
- 250 exercises free tier, 512x512 WebP flat illustrations, clean custom license,
  commercial in-app use OK with visible attribution "Exercise data by RepDB (repdb.co)"
- Honest, well-drafted license; explicitly NOT scraped.
- BUT: license states "All images are original works generated with AI tooling" —
  conflicts with user's stated preference to avoid AI-generated art.
- Term 3 forbids redistributing as a dataset/API (in-app only). Term 5 forbids AI derivation.
- Paid tier: 601 exercises, one-time $299 / $499.

### DISQUALIFIED: hasaneyldrm/exercises-dataset
- 1324 exercises w/ animated GIFs, but NOTICE.md credits "(c) Gym visual"
  (gymvisual.com, a commercial vendor). Not licensed for redistribution.

### DISQUALIFIED: wger images
- Code AGPL-3.0. Images: per-record license FK, NOT one blanket license.
- /api/v2/exerciseimage/ count = **365 images** for **861 exercises**;
  only 279 are is_main => **only ~32% of exercises have any image**.
- Style split: ~96 line art, ~256 amateur PHOTOS, ~7 3D. Not a coherent set.
- Only 2 thumbnail sizes (200x200, 400x400); legacy originals ~236x125. Too small.
- License split: 88 x CC BY-SA 3.0 (the Everkinetic legacy set), 277 x CC BY-SA 4.0
  (community uploads). Zero CC0.
- **LICENSE LAUNDERING**: many "CC BY-SA 4.0" records cite license_object_url values
  pointing at copyrighted commercial sites — lyfta.app, menshealth.com, fitnessvolt.com
  (direct wp-uploads hotlinks), liftmanual.com, training.fit, workoutguru.fit,
  simplyfitness.com, and in one case a **Google Images results page**. Contributors
  ticked the CC box on images they found online. Not reliable.
- ~345 of 365 images record NO source at all -> unauditable.
- ~30-40 images flagged is_ai_generated (and the API silently ignores the filter).
- No image bundle/repo; media-URL only. Web UI is behind Anubis anti-scraping PoW.
- Clean subset = the 88 Everkinetic CC BY-SA 3.0 images, i.e. the same set as Commons
  but lower-res. So: skip wger, go to Commons directly.

### DISQUALIFIED: the GymVisual-derived ecosystem
- Every "1300-1500 exercises with animated GIFs" dataset traces to ONE commercial
  source: **GymVisual (gymvisual.com)**. The 1300/1324/1394/1500 counts and the
  identical 3D-render house style are the fingerprint.
- Smoking gun: hasaneyldrm/exercises-dataset NOTICE.md — "Exercise media (images &
  GIFs) is (c) Gym visual and redistributed here with permission, at 180x180" and
  "This repository does not grant you any rights to the media beyond what Gym
  visual's terms allow." That 180x180 cap == ExerciseDB's free-tier resolution.
- exercisedb.io ($199/$599 one-time, permits bundling) — but its own terms concede IP
  "remain the property of ExerciseDB.io **or its content suppliers**", never names a
  production process, and has **no indemnification** + "all sales are final".
- github.com/ExerciseDB/exercisedb-api is **AGPL-3.0** (blocker for a proprietary app)
  and only PROXIES GIFs from ucarecdn.com — it licenses no media.
- exercisedb-pro/exercisedb-dataset: no LICENSE file at all.
- Legit route if you want this art: **buy GymVisual direct**. 10+ tier = $0.75/illustration,
  $0.90/GIF => ~$225-270 for 300 exercises. Its "Non-Exclusive Commercial Royalty-Free"
  license NAMES Android apps as permitted. Clear 2 clauses by email first
  ("products destined for resale" is ambiguous; it's a one-person license, buy as a company).

### DISQUALIFIED: all Kaggle / HuggingFace image sets
- hasyimabdillah/workoutexercises-images: CC BY-**NC**-SA 4.0 AND author admits
  "collected through web scrapping... Mostly YouTube and Google Images". Double blocker.
- philosopher0808/gym-workoutexercises-video: tagged Apache-2.0 but derived from the
  NC set above. License laundering.
- riccardoriccio/...: CC BY-NC-SA and includes **Shutterstock** footage.
- aadarshvelu/gym-equipements-classification: "I won't own any image, everything I've
  took from google."
- GIF sets (omarxadel, exercisedb, BodyIQDB, akankshamishra0512): all GymVisual-derived,
  tagged MIT/CC-BY-SA by uploaders with no authority.
- huggingface.co/datasets/averrous/workout: re-upload of the NC set with license STRIPPED.
- Only genuinely clean Kaggle item (mrigaankjaswal/exercise-detection-dataset, CC0)
  contains joint-angle time series and ZERO imagery.

### DISQUALIFIED: MuscleWiki
- musclewiki.com/terms prohibits "downloading media, scraping, redistributing content"
  and asserts sole ownership. Every scraper repo is in breach.

### Confirmed dead ends
- Hevy (API is Pro-only, metadata only), Strong, Fitbod: publish no assets.
- jamiebeach/OpenFitness: MIT but text-only. longhaul-fitness/exercises: MIT, no images.
- exercemus/exercises: MIT code but curated FROM wger + exercises.json, so it inherits
  the bodybuilding.com taint. Images are URLs, not bundled.
- OpenClipart (CC0): "bench press" -> 2 results. Generic wellness clipart only.
- publicdomainvectors.org (CC0): generic equipment silhouettes, no form illustrations.
- svgrepo.com: license is MIXED PER-COLLECTION (default CC0 "unless indicated
  differently") — needs per-item verification. Icons, not illustrations.
- freesvg.org (CC0): general clipart, no exercise set.
- Openverse: just a search layer. Filtering to illustration+commercial for "squat"
  returned 19 results that were **mostly the same Everkinetic Commons SVGs**.
  Independent confirmation that Commons/Everkinetic is the only real illustration source.
- Commons per-exercise photo cats (Bench press 88 files, Deadlift 92) are competition
  and military-PT photo archives — not usable as an illustration set.
- Commons animated GIFs: ~7 files total, and one squat GIF is 6.74 MB. Unusable.

### Rigorous coverage audit of the Everkinetic Commons set vs a 180-exercise app list
**~120 of 180 (two-thirds)**, very unevenly distributed:
- Chest ~20/20, Triceps 12/12, Biceps ~14/15 — excellent
- Shoulders ~13/15, Core ~14/18 — good
- Legs ~28/34 — good (leg press is PNG-only, no SVG)
- Back ~19/25 — weakest barbell group
- Functional/Olympic/cardio ~2/15 — basically nothing
Real gaps: pronated barbell bent-over row, one-arm dumbbell row, chest-supported row,
machine row, face pull, sumo deadlift, rack pull, hip thrust, Bulgarian split squat,
goblet squat, Nordic curl/GHR, front plank (side plank only), hanging leg raise,
Russian twist, dead bug, Pallof press, kettlebell swing, Turkish get-up, cleans,
farmer's carry, sled push, battle ropes, box jump, burpee, jump rope,
mountain climber, all cardio machines.
Bias = 2000s bodybuilding/machine era. Blind spot = glutes, functional, Olympic, cardio.

### License mechanics for shipping CC BY-SA in an Android binary
- 923/933 files are CC-BY-SA-3.0 (98.9%). Remaining 10 are CC BY 3.0 or dual
  GFDL+CC-BY-SA (still usable). **No GFDL-only files** — that concern doesn't bite.
- Share-alike does NOT infect app code. An APK bundling the images alongside Kotlin
  is a "collection"/mere aggregation under CC's own terms. Confirmed against the CC FAQ.
- BUT: if you MODIFY an illustration (recolor to your palette, composite frames,
  re-trace), that modified image is Adapted Material and must itself be released
  CC BY-SA — someone may extract it from your APK and reuse it. Code still unaffected.
  Decide deliberately whether to restyle. Note the set has NO fill attributes, so
  runtime tinting (not file modification) may avoid creating a derivative at all.
- "No additional restrictions": your EULA must not purport to forbid users from
  extracting/reusing those images. A blanket "all content proprietary" clause breaches it.
- **anti-TPM clause**: a live issue on iOS (Apple FairPlay may be an "effective
  technological measure"), NOT on Android — Play APK signing is not DRM in that sense.
  See wiki.creativecommons.org/wiki/4.0/Technical_protection_measures. If iOS is on
  the roadmap, get a legal opinion; common mitigation is publishing the exact asset
  set in a public repo so recipients can obtain it unencumbered.
- Drawings *in the style of* Everkinetic drawn from scratch are NOT derivatives and
  stay unencumbered. TRACING theirs makes them CC BY-SA. Relevant for gap-filling.
- Snapshot the Commons file-page URL + license per image AT INGEST — Commons files
  do get deleted and relicensed.

### FALLBACK ANSWER — REVISED: vulovix/body-muscles is the better primary
**github.com/vulovix/body-muscles — Apache-2.0.** 120 muscle paths (54 front + 66 back),
one <path> per muscle, raw `d` strings in src/data/muscles.front.ts / muscles.back.ts.
viewBox 0 0 35 93 (front) / 37 0 35 93 (back). Exposes MUSCLE_MAP, FRONT_MUSCLES,
BACK_MUSCLES + 8 pre-grouped categories, so 120 paths -> 18 regions is a lookup table.
Apache-2.0 adds only the NOTICE-reproduction duty (§4d) over MIT.
Uniquely has what nothing else does:
  - all THREE delt heads (shoulder-front, shoulder-side L/R, deltoid-rear L/R)
  - lats-upper/mid/lower x L/R;  traps-upper/mid/lower x L/R
  - lower-back-erectors + lower-back-ql x L/R + spine
  - glute max AND medius; hamstrings medial+lateral; gastroc medial/lateral + soleus
  - adductors, serratus, external oblique, groin/hip-flexors, chest upper/lower
** VERIFY BEFORE COMMITTING: paths are POLYGONAL, not curved. Sample chest path is
   5 linetos, 6-decimal coords in a 35-unit viewBox => smells auto-generated. Check
   https://vulovix.github.io/body-muscles/ at target render size; may look faceted
   next to react-native-body-highlighter's smooth beziers.

**Fallback if the art looks crude: github.com/HichamELBSI/react-native-body-highlighter — MIT.**
- MIT = commercial use OK, app-binary redistribution OK, **no attribution obligation**,
  no share-alike. The only genuinely unencumbered asset found in this whole survey.
- **24 addressable slugs**: trapezius, triceps, forearm, adductors, calves, hair, neck,
  deltoids, hands, feet, head, ankles, tibialis, obliques, chest, biceps, abs,
  quadriceps, knees, abductors, upper-back, lower-back, hamstring, gluteal.
  (Exceeds the ~15-20 regions needed.) Left/right selectable per part.
- Front AND back views, male AND female figures.
- Path data is in 4 plain TypeScript files under assets/ — raw SVG path strings:
  bodyFront.ts (25 KB), bodyBack.ts (21 KB), bodyFemaleFront.ts (32 KB),
  bodyFemaleBack.ts (23 KB). **~100 KB total for the entire visual system.**
- No React Native dependency needed — the paths are plain data. Extract into Android
  VectorDrawables, or feed the path strings straight into a Compose Canvas / PathParser
  and tint per muscle at runtime.
- Verdict: this is the *lowest-risk, lowest-effort, smallest-footprint* option by a wide
  margin, and it needs 4 files instead of 360.

#### Attribution-chain warning inside the body-highlighter family
react-native-body-highlighter (viewBox 0 0 724 1448) is the ROOT of the art for most of
this family. giavinh79/react-body-highlighter admits it: "The SVG polygons were leveraged
from the React Native package react-native-body-highlighter". lahaxearnaud is a fork of
giavinh79. **melihcolpan/MuscleMap (237*) and its port abdofallah/MuscleMapJS are almost
certainly the same art** — identical ~50-1350 coordinate range in a 1448-tall canvas,
identical base taxonomy — but MuscleMap's headers read "Copyright (c) 2026 Melih Colpan.
All rights reserved." with NO upstream credit. Using MuscleMap/MuscleMapJS inherits a
BROKEN MIT attribution chain. If you use them, credit Hicham ELABBASSI too.
Neither HichamELBSI nor vulovix states where their own art came from (residual low risk);
HichamELBSI's 1:2 proportions do NOT match the CC BY-SA Commons file's 1:1.4, so it does
not appear traced from Commons.

#### No Kotlin/Compose muscle highlighter exists — you will port
Path strings -> VectorDrawable/ImageVector via Valkyrie (ComposeGears/Valkyrie),
DevSrSouza/svg-to-compose, LennartEgb/vec2compose, or Svg2Vector.
- VectorDrawable accepts SVG path syntax **directly** in android:pathData, so the `d`
  strings port with no geometry conversion.
- Give each muscle its own <path> inside one <group> — that is exactly what you want for
  independent per-muscle tinting. (RNBH's left/right/common arrays map to sibling paths.)
- Gotcha: android:fillType="evenOdd" needs API 24+.

#### vulovix NOTICE is clean — no inherited obligations
NOTICE reads only "Body Muscles / Copyright 2024 Ivan Vulović" — no third-party artwork
attribution, so nothing is chained in. Apache-2.0 also grants an express patent licence,
which MIT does not. Reproducing the NOTICE text in an in-app licences screen satisfies §4(d).

#### Also skip: eMahtab/human-anatomy — NO LICENSE FILE (= all rights reserved),
and it is region-based (head, orbit, neck, abdomen), not muscles.

#### RESIDUAL RISK YOU CANNOT ELIMINATE FROM OUTSIDE
**Neither react-native-body-highlighter nor vulovix/body-muscles states where its artwork
came from.** Both declare only their own copyright. RNBH's 724x1448 (1:2) aspect does NOT
match Termininja's 1000x1400 Commons file, which argues against that specific derivation
— but no positive provenance statement exists for either. This is the one irreducible
unknown in the whole recommendation. Mitigation if it matters: trace the OpenStax
CC BY 4.0 figure yourself and own the provenance outright.

#### Research-confidence caveats (worth knowing before relying on the negatives)
- svgrepo.com returned **HTTP 429 to every direct fetch** — its per-item licence strings
  were never read on-site; the license distribution comes from the HuggingFace scrape.
  Safe buckets ~134k of 218k. Its "PD" bucket means "geometric icons ineligible for
  copyright" — a weaker claim than an actual CC0 dedication.
- publicdomainvectors.org returned **HTTP 403 to every fetch** — its CC0 terms are
  confirmed only at search-snippet confidence.
- Not verified: whether Commons "Muscles front and back.svg" (CC BY-SA 4.0, the best
  true-vector front+back candidate) has per-muscle <path> ids — needs a local download.
  The sibling "...enko png.svg" is 2.19 MB and probably an embedded raster.
- MuscleMap-is-RNBH-derived is strong circumstantial evidence, not a proven path diff.

#### Two more anatomy-atlas details
- OpenAnatomy's licence is SPDX **3D-Slicer-1.0**, which expressly permits incorporation
  into proprietary programs with no copyleft — the most permissive licence in the survey —
  but it is disqualified on CONTENT (no full-body/musculoskeletal atlas; only thorax,
  brain, liver, head&neck, inner ear, knee, abdomen). Its "research purposes only /
  CLINICAL APPLICATIONS ARE NEITHER RECOMMENDED NOR ADVISED" boilerplate must travel
  with the assets — awkward in a consumer fitness app.
- Z-Anatomy has 5,000+ TA2-labelled structures, so mesh -> muscle-region mapping is
  scriptable rather than manual. BodyParts3D is OBJ-only, 1,324-3,899 FMA-ID'd parts.

#### AVOID wger's muscle SVGs (CC BY-SA 3.0 derivatives)
Architecturally ideal — wger/core/static/images/muscles/ has muscular_system_front.svg
+ _back.svg (200x369) plus 16 per-muscle transparent overlays (muscle-1..16.svg,
fill:#fc0000 @52% opacity) split into main/ and secondary/. BUT its SOURCES file names
the origin and muscle-4.svg's internal Inkscape filename is "Muscular_system-small.svg":
derived from Commons File:Muscular_system.svg + File:Muscular_system-back.svg by
Termininja, **CC BY-SA 3.0 Unported**. So share-alike + attribution on the artwork.
Coverage is weaker than target anyway: only 15 muscles, no rear delts, no forearms,
no adductors, no lower back.

#### Commons has NO CC0/PD full-body per-muscle SVG
Category:SVG_human_muscular_system = 10 files, ALL copyleft (CC BY-SA 3.0/4.0).
Public domain there is raster only (Gray's 1918; Category:Gray's_Anatomy_plates_of_muscles
= 278 PD files but regional engravings, not a clean front/back pair).
CC0 SVGs like Adult_male_diagram_template.svg have no muscles at all.
** BEST LICENSE ON COMMONS: File:1105_Anterior_and_Posterior_Views_of_Muscles.jpg —
   **CC BY 4.0, attribution only, NO share-alike** (OpenStax A&P), combined
   anterior+posterior full-body. Raster, so you trace it — your SVG is then a CC BY 4.0
   adaptation: commercial OK, bundles fine, zero copyleft. NOTE the Commons *SVG* of the
   same figure was uploaded as CC BY-**SA** 4.0 by its uploader's choice; trace the
   CC BY *JPG* yourself to avoid inheriting SA. This is the only zero-copyleft route
   to a fully custom body map.

#### SVG Repo: the blanket "free for commercial use" claim is FALSE
Its own licensing page says per-item terms override. A 218k-row scrape
(huggingface.co/datasets/nyuuzyou/svgrepo) shows the real distribution:
CC-BY 65.5k / MIT 62.3k / PD 42.3k / Apache 17.8k / CC0 11.4k / **GPL 11k** /
trademarked logos 5.5k / **CC-BY-NC 135**. GPL is poison for a closed app; NC forbids
commercial use. SVG Repo stamps the license into the file as an HTML comment
("<!-- License: CC0. Made by SVG Repo... -->") — **download and read the header, do not
trust the page.** No real anatomical muscle map there anyway.

#### CC0 clipart: front view only
Best CC0 asset = openclipart.org/detail/272073/male-musculature (mirrored at
freesvg.org/male-musculature): viewBox 0 0 861x1675, ~28-50 separate <path> elements
each with its own fill (~19 distinct hex values), genuinely tintable, ~20-30 regions.
BUT front view only — **no back view exists** — and no semantic ids.
Also openclipart.org/detail/267821 = CC0 front+back line-art silhouette, a decent base
to author your own regions onto. Everything else is a single auto-traced blob.
Laundering flags: item 272073 is tagged Source+Pixabay; 316310 tagged Source+Wikimedia
(Commons is heavily BY-SA — unverified); items 316399/328752/328754 tagged **1949**,
possibly still under US copyright. FreeSVG's terms disclaim all warranty onto uploaders.

#### Anatomy atlases — mostly dead ends
- **anatomystandard.com = CC BY-NC 4.0. Commercial use flatly prohibited. EXCLUDED.**
- BodyParts3D: ⚠️ GENUINE LICENSE CONFLICT. Bundled README_e.html and the Anatomography
  page say CC BY-SA 2.1 Japan; the current dbarchive license page says CC BY 4.0 with no
  ShareAlike. That is the difference between copyleft and not. Email
  bodyparts@dbcls.rois.ac.jp before relying on the CC BY reading; assume BY-SA until
  confirmed. DBCLS also warns of anatomical errors.
- Z-Anatomy (CC BY-SA 4.0): ships **non-commercial objects inside the bundle** — inner ear
  (CC BY-NC-SA 4.0, Univ. of Dundee) and kidney (CC BY-NC 4.0). Muscle meshes descend from
  BodyParts3D, not those, so deleting the NC objects clears it — but audit the credits.
- OpenAnatomy: most permissive license of all (3D Slicer License Part B, BSD-style,
  explicitly allows proprietary incorporation, no copyleft) — but **no musculoskeletal or
  full-body atlas exists**. Not viable.
- Anatomography: CC BY-SA 2.1 JP, PNG/GIF only, no SVG. Poor fit.

#### Bonus clean-license raster: Servier Medical Art — VIABLE
smart.servier.com — **CC BY 4.0. Commercial OK, no share-alike, attribution only.**
Their usage page explicitly permits mobile apps, paid/subscription platforms, and
modification (recolor, crop, relabel). Prohibited: logos/branding, reselling as a
standalone image library. Assets: "Musculature back" + anterior superficial-muscles
drawing (also on anatomytool.org). Formats are **PPTX + PNG, not SVG** — the PPTX holds
vector shapes you can export, but muscles are not pre-separated into named regions, so
segmentation is manual. Attribution: "Image adapted from Servier Medical Art
(https://smart.servier.com/), licensed under CC BY 4.0".

## RANKED RECOMMENDATION

**1. Ship a permissively-licensed muscle-map body highlighter as the baseline for all 180.**
   Primary: **vulovix/body-muscles (Apache-2.0)** — 120 muscle paths, the only set with
   all 3 delt heads + lats sub-regions + separated lower back. Verify art quality first
   (polygonal paths, may look faceted).
   Fallback if art looks crude: **HichamELBSI/react-native-body-highlighter (MIT)** —
   4 files, ~100 KB, smoother beziers, male+female, but coarser taxonomy (no lats as a
   distinct region, delts as one region).
   Either way: commercial OK, APK bundling OK, no share-alike, no provenance risk.
   Zero-copyleft custom route if you want full control: trace the OpenStax
   **CC BY 4.0** figure (File:1105_Anterior_and_Posterior_Views_of_Muscles.jpg).
   Map each of the 180 exercises to primary/secondary muscle groups (the exercise
   *metadata* — names + muscle mappings — is fine to take from free-exercise-db or
   wger; it's the IMAGES and the bodybuilding.com instruction PROSE that are toxic).
   This alone gives complete, coherent, legally clean visual coverage on day one.

**2. Layer the Everkinetic CC BY-SA 3.0 SVGs on top for the ~120 exercises they cover.**
   Commons Category:Weight_training_diagrams, ~600 SVGs, true vector, path-only with
   no fill attributes so runtime tinting works and light/dark theming is free.
   One attribution block in a credits screen. Prefer runtime tinting over editing the
   files, so you never create Adapted Material and never trigger share-alike.
   Best-of-both: body map always present; real illustration when one exists.

**3. Optional gap-fill for the ~60 uncovered exercises** (glutes, functional, Olympic,
   cardio, barbell row, plank): either commission ~60 drawings *in the style of*
   Everkinetic (style is not copyrightable; drawn from scratch they stay unencumbered —
   do NOT trace), or buy GymVisual direct at the 10+ bulk tier (~$0.75/illustration,
   ~$45-60 for 60, license explicitly names Android apps).

**4. Only if a single coherent commercial set is worth paying for:** GymVisual direct
   (~$225-270 for 300), or RepDB ($299/$499 for 601, clean license, but AI-generated
   art — conflicts with the stated preference).

### Bottom line on the honest question
There IS a safely usable free set, but **not at 180-exercise coverage**: Everkinetic
tops out around 120/180 and is CC BY-SA (attribution + share-alike-on-modification),
not CC0. The thing that *does* reach 180 cleanly is the MIT muscle-map — which is why
the recommendation leads with it rather than treating it as a consolation prize.
Everything advertising 800-1500 exercises with images is either scraped from
bodybuilding.com (the free-exercise-db / exercises.json lineage) or licensed from
GymVisual (the ExerciseDB / animated-GIF lineage). Neither is safe to vendor.
