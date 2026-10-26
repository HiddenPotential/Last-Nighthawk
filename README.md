# Drift

A calm, ASMR-style toy. Glossy 3D orbs float around a softly lit room, bounce and squish into each other, and every so often glide together into shapes. Every touch rings a soft reverb chime. There's no score and no goal: just play.

## Run

There is no build step. Start the server:

```bash
python3 server.py 5517
```

Then open http://localhost:5517. Headphones recommended. `server.py` serves the folder and also keeps the quotes people write on lanterns (see [Lanterns](#lanterns)) in `quotes.json`. It listens on every network interface, so others on your Wi-Fi can open `http://<your computer's address>:5517` and read the same quotes. Plain `python3 -m http.server` works too, but then quotes stay on each device.

## Places

The switcher in the top-left corner moves between calm places. Each one remembers its own settings, and sound and music carry across. Whichever place you're not looking at pauses.

- **Orbs**: the glossy orb room described below.
- **Pond**: a top-down koi pond (see [Pond](#pond)).
- **Sand**: a top-down zen sand garden (see [Sand](#sand)).
- **Lanterns**: a night lake where you light paper lanterns (see [Lanterns](#lanterns)).
- **Muyu**: a wooden fish in a candlelit temple (see [Wooden fish](#wooden-fish)).
- **Bamboo**: a misty bamboo grove with a shishi-odoshi (see [Bamboo](#bamboo)).
- **Window**: rain on a windowpane at night (see [Window](#window)).
- **Hearth**: a crackling fireplace on a quiet night (see [Hearth](#hearth)).

## Play

| Do this               | What happens                                           |
| --------------------- | ------------------------------------------------------ |
| Tap empty space       | A new orb blooms in                                    |
| Tap an orb            | It pops into sparkles; big orbs split into smaller ones |
| Drag an orb           | Grab it and fling it                                   |
| Hold on empty space   | A gravity well pulls orbs into a swirl                 |
| Swipe across space    | Stir the orbs like water                               |
| <kbd>Space</kbd>      | Drop in a random orb                                   |

The bar at the bottom switches **motion** (Float, Fall, Swirl, Shapes), **colors** (Aurora, Sunset, Ocean, Candy, Pearl, Prism, Neon, Forest, Galaxy), toggles background music and sound, and **Pop all** pops every orb in a left-to-right cascade.

**Shapes** mode has the orbs glide into slowly turning formations (28 in all: ring, sphere, double helix, heart, star, cube, galaxy, wave, donut, pyramid, diamond, infinity sign, spiral, crescent moon, flower, smiley face, tornado, atom, Saturn, crown, butterfly, lightning bolt, music note, pine tree, house, cat face, fish and sun), shuffled so each appears once before any repeats, hold them, then drift apart and form the next one. While a shape holds, its orbs ease to one shared size so the outline reads cleanly, and corners like star points and crown tips always get an orb. Float mode does the same on its own after 25 seconds without input.

**Auto:** the ✺ button lets new orbs drift in on their own, and the slider beside it sets how often. Auto orbs are temporary: each lives 18–40 seconds, shivers briefly, then pops softly. New ones only arrive while there's room (about a fifth of the screen covered, 60 orbs at most). If the room gets crowded anyway, the oldest auto orbs pop one at a time until it clears. Orbs you make yourself are never removed, and turning Auto off lets the auto orbs fade out on their own.

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
- **Thunder**: thunder on its own, near and far, in heavy still air
- **Seabirds**: waves on the shore with gulls crying and laughing overhead
- **Waterfall**: a falling sheet of water over a deep plunge-pool roar
- **Cave**: slow drips echoing off stone, and the odd drop into a deep pool
- **Chimes**: wind chimes knocking together whenever the breeze picks up

The slider sets its volume. Your choice is remembered and starts again on your first tap; the Sound button mutes it along with everything else.

## Lanterns

A lake at night under layered mountains: stars, a crescent moon laid across the water, a few village lights on the far shore, reeds in the near corners. Paper lanterns drift up into the distance and their light is mirrored, broken up, in the lake.

| Do this               | What happens                                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| Tap the sky           | Light a lantern; it fills with warm air, then rises and drifts into the distance |
| Hold on the sky       | A lantern fills in your hand, growing the longer you hold; drag it, let go to release |
| Tap the lake          | Float a little box lantern; the current carries it slowly out to the far shore |
| Drag                  | Send a breeze through the lanterns and reeds, or stir the water               |
| Tap a lantern with a paper strip | Read the quote it carries; the lantern hangs still while you read     |
| <kbd>Space</kbd>      | Release lanterns all along the far shore (same as **Release**)                |

**Quotes:** **Write** (✎) opens a box for a quote, wish or kind word (up to 160 characters). Your draft saves as you type, and **Send it up** (or <kbd>Enter</kbd>) sends it up on a lantern with a paper strip hanging below it. Quotes are stored by `server.py`, so everyone who opens the game from the same server reads them. Lanterns drifting up now and then, and some of the ones you **Release**, carry quotes other people wrote, and a quote someone writes while you're watching rises from the far shore within about 30 seconds. If the server can't be reached, your quote is kept on your device and sent the next time it can be.

The bar has **Write**, **Release**, lantern **color** (Amber, Rose, Moon, Jade or Mixed), music and sound. Now and then a shooting star crosses, someone far off lets a lantern go, and a temple bell sounds across the water. You hear each wick catch, a chime as a lantern lifts off, the water lapping and the breeze you make. The color is remembered.

## Wooden fish

A muyu, the hollow wooden fish that monks tap while chanting, rests on a red silk cushion on a temple altar, between candles, a singing bowl and smouldering incense, under a hanging ensō scroll.

| Do this                | What happens                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| Tap anywhere           | The mallet strikes the fish: a hollow *tok*, a warm glow, "Merit +1" floats up |
| Hold                   | Keep a steady chant at the tempo for as long as you hold              |
| Tap the singing bowl   | It rings for a long time, slowly beating, with light shimmering off its rim |
| <kbd>Space</kbd>       | Strike once                                                           |

Every strike adds to a merit count on the front of the altar, kept between visits. The bar has **Auto** (the fish keeps the rhythm by itself, with a human wobble, and rings the bowl every 64 strikes), a **tempo** slider (40 to 160 bpm), what each strike earns (**Merit**, 功德, Peace, Calm, Wisdom, Luck), a **Bowl** button, music and sound. The incense smoke curls up and sways when you strike, and now and then a great temple bell sounds far off.

## Bamboo

A misty bamboo grove with a shishi-odoshi. Water trickles from a long bamboo spout into a tube on a pivot, and its pitch rises as the tube fills. When it's full the tube tips, empties into a stone basin, swings back and knocks against an upright stone: *klok*. Leaves drift down, sun shafts slant through the stalks, and now and then a bush warbler sings.

| Do this                | What happens                                                    |
| ---------------------- | --------------------------------------------------------------- |
| Drag across the grove  | A gust follows your hand: the stalks bend and sway back, leaves let go, and you hear the rustle |
| Tap a stalk            | Knock it: a hollow tok (higher for thinner stalks), it sways and drops a few leaves |
| Tap the bamboo tube    | Tip it early (it needs to be partly full)                         |
| Tap the basin          | Ripple the water                                                |
| <kbd>Space</kbd>       | Tip the tube                                                    |

The bar has **Tip**, **flow** (Slow, Steady or Fast, which sets the rhythm of the knocks), **breeze** (Still, Breeze or Windy), music and sound. Flow and breeze are remembered.

## Window

A windowsill on a rainy evening, a mug of tea steaming on the sill, blurred lights beyond the glass. Raindrops land, merge when they touch, and once they're heavy enough they slide down in stop-start runs, swallowing the drops in their path and leaving a trail of tiny beads. Each larger drop is a little lens that shows the view upside down. Condensation fogs the glass, thicker toward the bottom.

| Do this                    | What happens                                                    |
| -------------------------- | --------------------------------------------------------------- |
| Drag across the glass      | Wipe the fog clear (it creeps back over a minute or so) and sweep the drops away |
| Hold, then drag            | Breathe on the glass to fog it up, then draw in the fog with your finger |
| Tap                        | Tap the glass: a soft tink, and nearby drops shiver loose and run |

The bar has the **rain** (Drizzle, Rain, or Storm with distant lightning and thunder), the **view** (City lights, Forest, Dusk), **fog** on or off, music and sound. You hear the rain outside, drops ticking on the glass, and a soft swish when you wipe. The settings are remembered.

## Hearth

A stone fireplace on a quiet night, a clock, a candle and a few books on the mantel, a basket of logs, and a cat asleep on the rug. Logs catch slowly, char, and glow along their cracks; flames lick up from them over a bed of embers, sparks rise up the chimney, and the firelight flickers over the stones and the room. Each log burns for a few minutes, then gives way into the embers in a shower of sparks.

| Do this                    | What happens                                                    |
| -------------------------- | --------------------------------------------------------------- |
| Tap the fire               | Poke it: a burst of sparks, a flare, and the logs settle        |
| Hold                       | Fan the flames: they grow and roar while you hold               |
| Drag                       | A draught sways the flames and sparks                           |
| Tap the log basket         | Lay another log on the fire (it hisses as it dries, then catches) |
| Tap the cat                | It purrs for a while, and flicks its ears                       |
| <kbd>Space</kbd>           | Add a log                                                       |

The bar has **Add log**, **Poke**, **Keep it going** (adds a log on its own when the fire runs low; turn it off and the fire burns down to embers and slowly goes out), music and sound. You hear the fire's low roar, crackles and pops, a fresh log's hiss, the thunk of logs landing, the poker in the coals, a whoosh when you fan it, and the cat's purr.

## Files

- `index.html`: page and controls
- `style.css`: layout and the frosted control bar
- `game.js`: physics, orb rendering and Web Audio sound; also shares its audio engine with the other places as `window.Zen`
- `pond.js`: the koi pond
- `sand.js`: the sand garden
- `lanterns.js`: the lantern lake
- `woodfish.js`: the wooden fish
- `bamboo.js`: the bamboo grove
- `window.js`: the rainy window
- `hearth.js`: the fireplace
- `places.js`: the place switcher
- `ambience.js`: the ambient soundscapes
- `server.py`: serves the game and stores lantern quotes in `quotes.json` (not checked in)

Add `?debug` to the URL to get `window.__drift`, `window.__pond`, `window.__sand`, `window.__lanterns`, `window.__woodfish`, `window.__bamboo`, `window.__window` and `window.__hearth` in the console for testing.
