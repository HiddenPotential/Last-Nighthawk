# Drift

A calm, ASMR-style toy. Glossy 3D orbs float around a softly lit room, bounce and squish into each other, and every so often glide together into shapes. Every touch rings a soft reverb chime. There's no score and no goal: just play.

## Run

There is no build step. Serve the folder over HTTP:

```bash
python3 -m http.server 5517
```

Then open http://localhost:5517. Headphones recommended.

## Places

The switcher in the top-left corner moves between calm places. Each one remembers its own settings, and sound and music carry across. Whichever place you're not looking at pauses.

- **Orbs**: the glossy orb room described below.
- **Pond**: a top-down koi pond (see [Pond](#pond)).
- **Sand**: a top-down zen sand garden (see [Sand](#sand)).

## Play

| Do this               | What happens                                           |
| --------------------- | ------------------------------------------------------ |
| Tap empty space       | A new orb blooms in                                    |
| Tap an orb            | It pops into sparkles; big orbs split into smaller ones |
| Drag an orb           | Grab it and fling it                                   |
| Hold on empty space   | A gravity well pulls orbs into a swirl                 |
| Swipe across space    | Stir the orbs like water                               |
| Scroll over an orb    | Grow or shrink just that orb                           |
| Scroll on empty space | Resize every orb (same as the size slider)             |
| <kbd>Space</kbd>      | Drop in a random orb                                   |

The bar at the bottom switches **motion** (Float, Fall, Swirl, Shapes), **colors** (Aurora, Sunset, Ocean, Candy, Pearl, Prism, Neon, Forest, Galaxy), sets **orb size**, toggles background music and sound, and **Pop all** pops every orb in a left-to-right cascade.

**Shapes** mode has the orbs glide into slowly turning formations (19 in all: ring, sphere, double helix, heart, star, cube, galaxy, wave, donut, pyramid, diamond, infinity sign, spiral, crescent moon, flower, smiley face, tornado, atom and Saturn), shuffled so each appears once before any repeats, hold them, then drift apart and form the next one. Float mode does the same on its own after 25 seconds without input.

**Auto:** the ✺ button lets new orbs drift in on their own, and the slider beside it sets how often. Auto orbs are temporary: each lives 18–40 seconds, shivers briefly, then pops softly. New ones only arrive while there's room (about a fifth of the screen covered, 60 orbs at most). If the room gets crowded anyway, for example after raising the size slider, the oldest auto orbs pop one at a time until it clears. Orbs you make yourself are never removed, and turning Auto off lets the auto orbs fade out on their own.

**Color:** every orb has a faint rainbow film that drifts across it like a soap bubble (strongest in Pearl and Prism), coloured light pools wander slowly around the room, and popped orbs burst into sparkles in all of the theme's colours.

**Music:** seven self-generating pieces, all in C major so they blend with the orb chimes. The ♫ button steps through them, then off:
- **Lo-fi:** warm electric-piano chords with a gentle swing, a soft beat that drops out every 16 bars, a walking bass, a plucked melody, vinyl crackle and a little tape wobble.
- **Dream:** slowly opening pads, a rising and falling kalimba arpeggio, and a sparkly melody with echo.
- **Space:** wide, slow pads, a deep bass, sparse electric-piano notes and high glassy bells.
- **Rain:** soft piano (rolled chords, a quiet broken-chord accompaniment and a melody) over steady rain.
- **Music box:** a lullaby in 3/4 waltz time.
- **Waves:** fingerpicked guitar, a soft pad and a breathy flute over rolling ocean swells.
- **Night jazz:** swung brushes and ride cymbal, a walking bass, electric-piano comping and a vibraphone melody.

Melodies are short two-bar motifs answered by a varied repeat, chords move through a couple of progressions, and parts come and go across 8- and 16-bar sections, so the music never loops exactly.

**Sound:** bell chimes on collisions, a glassy tink on the front glass and a soft knock on the back wall, a pluck when you grab an orb, a swoosh when you fling one, a swish while you stir, a rising hum while you hold a gravity well, a swell and bell run as each shape forms, a rising scale during Pop all, and quiet water drips in the background.

Each orb's chime pitch comes from its size (bigger orbs are lower) on a pentatonic scale, so any collision sounds pleasant. Settings are remembered in `localStorage`.

## Pond

Koi of different varieties (kohaku, sanke, ogon, tancho, showa and more) glide under lily pads and lotus flowers, over a pebbly bottom with dappled light. Petals drift down onto the water now and then.

| Do this            | What happens                                                        |
| ------------------ | ------------------------------------------------------------------- |
| Tap the water      | Drop a pinch of food; hungry koi race up to the surface to eat it   |
| Hold on the water  | The koi gather and circle your finger, nibbling at it; drag to lead them |
| Swipe fast         | Stir the water: ripples spread, lily pads drift, nearby koi dart away |
| <kbd>Space</kbd>   | Scatter food across the pond (same as **Feed**)                     |

Koi get hungry over time and ignore food once they're full, and they grow a little each time they eat. The bar has **Feed**, **Rain** (rain rings the surface and you hear it), **time of day** (Day, Dusk, Night with a moon reflection and fireflies), music and sound.

## Sand

A karesansui, seen from above: pale raked sand, a few stones on cushions of moss, cloud shadows drifting over, and now and then a falling leaf. It starts freshly raked in straight lines that bend around the stones, with rings hugging each one.

| Do this                  | What happens                                                              |
| ------------------------ | ------------------------------------------------------------------------- |
| Drag on the sand         | Rake grooves; the tines follow your finger and curve around any stone     |
| Tap the sand             | Set down a stone (up to 9); rings form around it as it settles            |
| Tap a stone              | Nudge it a little way; it re-rings the sand where it stops                |
| Drag a stone             | Move it; set it down near the edge to take it away                        |

Grooves stay where you rake them and only soften very slowly (over about ten minutes). The bar has **Smooth** (a soft sweep down the garden that leaves flat sand), a **tines** slider (2 to 8 tines, so a narrower or wider rake), music and sound. You hear the hush and grit of the rake through the sand, a low thud as a stone settles, a dry tok when one is knocked, a faint breeze, and the odd distant wind chime or bamboo spout. The stones and tine count are remembered.

## Ambient sounds

The **Sounds** button in the top-right corner plays a soundscape under whichever place you're in. Each one is mixed live from generated noise and tones, so no two minutes sound the same:

- **Rain**: steady hiss, pattering drops, puddle plinks and a dripping gutter
- **Sea**: waves that swell, break into foam and wash back over a deep roll
- **Storm**: heavy rain, gusting wind and rolling thunder, some of it close
- **Wind**: shifting gusts with a faint whistle
- **Stream**: a babbling brook
- **Forest**: birdsong (trills, whistles, warbles) over a breeze and a distant brook
- **Night**: crickets and the odd frog
- **Fire**: a crackling campfire with the occasional pop

The slider sets its volume. Your choice is remembered and starts again on your first tap; the Sound button mutes it along with everything else.

## Files

- `index.html`: page and controls
- `style.css`: layout and the frosted control bar
- `game.js`: physics, orb rendering and Web Audio sound; also shares its audio engine with the other places as `window.Zen`
- `pond.js`: the koi pond
- `sand.js`: the sand garden
- `places.js`: the place switcher
- `ambience.js`: the ambient soundscapes

Add `?debug` to the URL to get `window.__drift`, `window.__pond` and `window.__sand` in the console for testing.
