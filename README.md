# 🐞 DeeBug — Cute Pastel Bug Arena

A static, zero-dependency HTML/CSS/vanilla JavaScript 2D arena game inspired by *snake.io*. Play as a cute animated pastel bug, eat lower-rank bugs to grow bigger, dodge (or bravely challenge!) higher-rank bugs, and trade your points for adorable animal-themed bug skins like **Kitty Bug**, **Doggy Bug**, **Bunny Bug**, **Honey Bear Bug**, **Axolotl Bug**, **Unicorn Moth**, and **Royal Butterfly**!

## How to Play

- **Move & Dash**:
  - **Laptop / Desktop**: Move your mouse cursor (or use `WASD` / Arrow keys) to steer. Left-click or hold `Space` / `Shift` to Dash. Press `B` or `Tab` to open the Skin Boutique.
  - **iPad / Touch**: Touch and drag anywhere on the meadow to steer with the floating virtual joystick. Tap the **DASH** button to boost and **🎀** for the Skin Boutique.
- **Eat & Rank Up**: Eat equal or lower-rank bugs (`Lv.`) **and** abundant non-bug garden food (**leaves, berries, fruits, and mushrooms**) to earn points and rank up from **Lv.1 Baby Ladybug** to **Lv.10 Pastel Monarch**, growing larger with each rank!
- **Glowing Magic & Tricky Treats (5–9s)**:
  - **Power-Ups**: Golden Mega Fruit (*Bigger & Stronger*), Ghost Mist Leaf (*Invisible*), Power Shroom (*Super Strong +2 Lv*), and Zippy Star Berry (*Super Fast*).
  - **Silly Debuffs**: Sticky Plum Berry (*Slower*), Sleepy Dusk Leaf (*Weaker*), and Shrink Toadstool (*Tiny Bug*).
- **Garden Obstacles & Safe Rest Areas**: Navigate around randomly generated immovable **trees, ponds, and mossy rocks**, and duck through the open gates of cozy **Fenced Safe Rest Areas** to escape bigger bugs and heal hearts quickly!
- **Higher-Rank Risk**: Bumping into higher-rank bugs hurts you (or knocks you out if they are way too powerful!). Brave players can trade blows with a `+1` rank bug to weaken and chomp it for bonus points.
- **Skin Boutique Trade-Off**: Spend your points to unlock cute skins — each skin keeps your character unmistakably a cute bug! Spent points are deducted from your current points balance, delaying your next rank-up.
- **Win Conditions**: Win by becoming the **Most Powerful Bug (Lv.10)** OR **collecting all 8 skins** — and optionally keep playing to earn **Ultimate 100% Champion** (both)!

## Deployment (Static Hosting)

This app uses relative paths only (`./style.css`, `./js/...`) and has zero external dependencies or build steps:

- **Home Static Server (Caddy)**: Copy this folder to your Caddy root (works at `/` or `/deebug/`).
- **GitHub Pages**: Push to a repository and enable GitHub Pages on the root directory.
- **Local Testing**: Open `index.html` directly or run `python3 -m http.server 8080`.

## Future-Ready Architecture (Mobile & Multiplayer)

The codebase is modularized cleanly so future enhancements drop right in:

- `js/config.js` — Pure data constants (ranks, skins, world rules); shareable with a future server.
- `js/entities.js` — Entity data models with `id`, `ownerId`, and `toSnapshot()` serialization for network replication.
- `js/input.js` & `js/ai.js` — Both human controls and AI bots produce the same compact `InputIntent { targetAngle, throttle, boost }` contract, so remote multiplayer clients can plug in via a `NetworkController`.
- `js/engine.js` — DOM-free simulation loop with an `EventBus`, ready to move into a WebWorker or authoritative Node.js/WebSocket server.
- `js/renderer.js` — HiDPI 2D Canvas renderer + reusable animated skin preview artist.
- `js/storage.js` — Encapsulated `localStorage` adapter (`deebug_v1_` prefix), easily swapped for cloud saves or mobile native storage (Capacitor/PWA).
- `js/audio.js` — Zero-asset Web Audio API synthesizer.
