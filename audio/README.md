# The sound examples

Every clip here was rendered on a computer from LarkOS's own source code:
the plugins' DSP for the instruments, and the firmware's Beads and Cassette
code for the effects. None was recorded from a Tracker Mini, and none has
been compared with one yet. `synth-plugin-sdk/tools/site-audio` in the
LarkOS repository makes them again, byte for byte.

**Soli, June and Hexa** each play the same four phrases at 100 BPM in
C minor, with one factory preset per phrase:

| | Pad | Lead | Bass | Keys |
|---|---|---|---|---|
| Soli | Full Ensemble | Violin | Synth Bass | String Piano |
| June | Strings | Saw Lead | 106 Bass | Electric Key |
| Hexa | Two Rooms | Sync Runner | Reso Acid | Tine Bloom |

**Ham** is an organ, and an organ has no pad or lead of its own. It
plays four registrations, each with a part in the style it was set up for:

- **Jazz Trio:** a swung blues line in F at 160 BPM. The smears go from the
  minor third to the major, and the percussion strikes on each detached
  note.
- **Gospel Shout:** a palm glissando up the white keys, shout stabs, and the
  plagal amen at 92 BPM, with the rotor fast.
- **Rock Grind:** a driven riff and a trill at 120 BPM, then a held chord
  while the rotor comes up from Chorale to Tremolo.
- **Bubble:** the reggae bubble at 76 BPM. The left hand plays on the e and
  the a, and the right hand on the and.

The parts are written in each style's idiom; none is a quotation.

**Rings.** One clip per model, each playing the same struck arpeggio on
two voices. Structure means something different in each model, and at the
plugin's default of 0.35 three of them are out of tune. So each model gets
the Structure value where it is in tune:

| Model | Structure | Why |
|---|---|---|
| Modal | 0.27 | partials on whole-number ratios |
| Sympathetic | 0.6 | strings at the unison, fifth and octave |
| String, String+Verb | 0.25 | the band with no dispersion; at 0.35 the string is 86 cents sharp |
| FM Voice | 0.5 | the modulator at 2:1 |
| Quantized | 0.35 | tuned by its chord (Octave), so Structure is unused |

Brightness, Damping and Position stay at the plugin's defaults.

**Plaits.** Five engines with their knobs at noon, apart from two:

- **Wavetable:** Harmonics is at 0.2, which picks a factory bank.
- **FM bass:** Decay is at 0.3.

The beat puts the three drum engines on five tracks over three bars:

- **Kick:** on the bass drum engine.
- **Snare:** with ghost notes.
- **Hats:** sixteenths, with an open hat on the and of four.
- **Toms:** the bass drum engine tuned up, for a fill.
- **Crash:** the hi-hat engine with its decay all the way out. It lands with
  a long, low kick under it.

**Beads.** June's Electric Key on its own for two bars, then the track's
Beads send goes to 100. Beads is at Size 70, Density 85, Feedback 50,
Reverb 50 and Pitch random 50, so each grain lands on a fourth, fifth or
octave. Every other setting is at its default.

**Cassette.** The same two bars over x0x's 808 kit, then Cassette comes on
at its default settings.

**Levels.** Each clip is levelled to -18 LUFS, or less where that would take
its true peak above -1.5 dBTP. A 15 Hz high-pass removes any DC offset, and
the ends are faded. The clips are encoded as MP3 (LAME, VBR quality 4).
