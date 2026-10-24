# Drift

A calm, ASMR-style toy. Glossy 3D orbs float around a softly lit room, bounce and squish into each other, and every so often glide together into shapes. Every touch rings a soft reverb chime. There's no score and no goal: just play.

## Run

There is no build step. Serve the folder over HTTP:

```bash
python3 -m http.server 5517
```

Then open http://localhost:5517. Headphones recommended.

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

The bar at the bottom switches **motion** (Float, Fall, Swirl, Shapes), **colors** (Aurora, Sunset, Ocean, Candy, Pearl), sets **orb size**, toggles sound, and **Pop all** pops every orb in a left-to-right cascade.

**Morphing orbs:** every orb slowly changes form on its own clock, between round, rounded cube, star, heart, triangle, flower and wobbly jelly, and turns gently as it goes. During a heart, star or cube formation the orbs become little hearts, stars or cubes to match.

**Shapes** mode has the orbs glide into slowly turning formations (19 in all: ring, sphere, double helix, heart, star, cube, galaxy, wave, donut, pyramid, diamond, infinity sign, spiral, crescent moon, flower, smiley face, tornado, atom and Saturn), shuffled so each appears once before any repeats, hold them, then drift apart and form the next one. Float mode does the same on its own after 25 seconds without input.

**Sound:** bell chimes on collisions, a glassy tink on the front glass and a soft knock on the back wall, a pluck when you grab an orb, a swoosh when you fling one, a swish while you stir, a rising hum while you hold a gravity well, a swell and bell run as each shape forms, a rising scale during Pop all, and quiet water drips in the background.

Each orb's chime pitch comes from its size (bigger orbs are lower) on a pentatonic scale, so any collision sounds pleasant. Settings are remembered in `localStorage`.

## Files

- `index.html`: page and controls
- `style.css`: layout and the frosted control bar
- `game.js`: physics, orb rendering and Web Audio sound

Add `?debug` to the URL to get `window.__drift` in the console for testing.
