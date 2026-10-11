# 🎂 Birthday Surprise Website: Developer Guide

Ye guide future mein website badalne, nayi photos ya games jodne, encrypt karne aur upload karne ke liye hai.

> ⚠️ **Ye file website ke saath upload hoti hai, isliye isme koi password, jawab ya secret code mat likhna.**
> Saare sahi jawab sirf `private/content.js` mein hain, aur wo file kabhi upload nahi hoti.

---

## 1. Short mein: kuch bhi badalna ho to

```bash
# 1) private/content.js ya config.js edit karo (aur nayi photo ho to private/images/ mein daalo)
# 2) taala lagao (sirf private/ mein kuch badla ho tab zaroori, lekin har baar chala dena safe hai)
node encrypt.js
# 3) local pe check karo
python -m http.server 8000         # phir browser mein http://localhost:8000/
# 4) upload / push karo (secure/ folder ke saath, private/ ke bina)
```

**`node encrypt.js` chalaye bina `private/` ke badlaav site pe kabhi nahi dikhenge.**

---

## 2. Kya-kya use karke bana hai (tech stack)

| Cheez | Kis kaam ki | Kahan se |
|---|---|---|
| **HTML / CSS / plain JavaScript** | Poori site, koi framework nahi, koi build step nahi | `index.html`, `css/style.css`, `js/main.js` |
| **Three.js r128** | 3D background (taare + udte dil) aur 3D cake | cdnjs CDN, `js/scene.js` |
| **GSAP 3.12.5 + ScrollTrigger** | Saare animations, scroll pe aane wale effects | cdnjs CDN |
| **canvas-confetti 1.9.3** | Confetti aur dil wale burst | jsdelivr CDN |
| **Google Fonts** | Great Vibes (naam), Playfair Display (headings), Poppins (text), Caveat (handwriting) | fonts.googleapis.com |
| **Web Crypto API** (browser mein built-in) | Login ke jawab se taala kholna: PBKDF2-SHA256 (250,000 rounds) + AES-256-GCM | koi library nahi |
| **Node.js `crypto`** (built-in) | `encrypt.js`: sab kuch taale mein band karna | Node 18+ (abhi v22 pe test kiya) |
| **Web Audio / getUserMedia** | Mic se candle bujhana aur kiss game | browser built-in |
| **Canvas 2D** | Basket game, fireworks, scratch cards | browser built-in |
| **CSS 3D transforms** | Ghoomta photo carousel, flip cards, dice, puzzle cards | browser built-in |
| **PWA manifest** | iPhone pe "Add to Home Screen" (push notification ke liye) | `manifest.json`, `icons/` |
| **OneSignal** (optional, abhi band) | Push notification | `oneSignalAppId` khaali = band |

**Backend ya server nahi chahiye.** Saari files static hain, isliye koi bhi static hosting chalegi (Netlify, Vercel, GitHub Pages).
Internet chahiye, kyunki libraries aur fonts CDN se aate hain.

Gaane (`music/*.wav`) Python se khud banaye gaye hain: "Happy Birthday" ki dhun (copyright-free) aur ek 8-bit game dhun. Inme koi copyright wali recording nahi hai.

---

## 3. Folder structure

```
birthday/
├── index.html            # saari screens ka HTML (login, games, taala, countdown, cake...)
├── config.js             # PUBLIC settings: texts, colors, date, login ki settings, taala ke stages
├── encrypt.js            # 🔐 taala lagane wala script
├── DEVELOPER.md          # ye file
├── .gitignore            # private/ ko GitHub pe jaane se rokta hai
├── css/style.css         # saari styling
├── js/
│   ├── main.js           # poora flow + saare games + encryption kholna
│   └── scene.js          # Three.js: 3D background aur cake
├── music/
│   ├── game-tune.wav     # login ke baad games + taale mein
│   └── happy-birthday.wav# 12 baje ke baad (cake page)
├── icons/                # app icons (Add to Home Screen)
├── manifest.json
├── OneSignalSDKWorker.js # sirf push notification ke liye
├── tools/
│   └── rotate-photo.ps1  # ghoomi hui photo seedhi karne ka helper
├── secure/               # 🔒 encrypt.js ka output — YE upload hota hai
│   ├── meta.json         # salt + rounds (secret nahi)
│   ├── data.bin          # encrypted content (games, captions, letter...)
│   └── m/*.bin           # encrypted photos/videos
└── private/              # 🚫 KABHI upload mat karna
    ├── content.js        # login ke jawab, games, photos ki list, captions, story, letter
    ├── images/           # asli photos (carousel/, wall/, puzzle.jpg, count-game.svg ...)
    └── videos/           # asli videos
```

---

## 4. Website ka flow (kis order mein kya aata hai)

1. **Loader**, phir **Login** (bike ya teer wali entry). 5 fields: 2 naam, 2 DOB, 1 secret code.
   Login ke jawab hi taale ki chaabi hain. Sahi hone pe `secure/` ki files browser mein khulti hain.
2. Login ke baad **10 minute ka session** (kone mein timer). Khatam hone pe "padhai karo 📚" popup aata hai, phir dobara login.
3. **Games page**: continue karo, ya saare games shuru se khelo (ye reset button sirf yahan aur countdown page pe hai).
4. **14 games**, ek ke baad ek. Har jeet pe **khazana** khulta hai aur ek 2-ank ka number milta hai.
5. **"Ab khazane ke numbers se taala kholo"** page, phir **4 taale** (1 min timer wale). Kone mein taala aur % dikhta hai.
6. **Countdown**: 13 Oct 00:00 (India time, internet se) tak. Yahan **Enable Surprise 🔔** (calendar alarm) bhi hai.
7. 12 baje ke baad: **Tap to begin** → Happy Birthday gaana → **gift box** → **cake** (mic se phoonko) → together counter → 3D carousel → Our Story → Memory Wall → Reasons → scratch gifts → letter → fireworks.

**Music:** login ke baad **game dhun**, 12 baje ke baad **Happy Birthday**. Upar right ka 🔊/🔇 button dono ke liye hai.

**Phone mein kya save hota hai** (localStorage, key `surprise_<naam>_<date>_...`):
`_games` (kitne games jeete), `_lock` (kitne taale khule), `_opened` (gift khola), `_enabled` (alarm lagaya).
Saved progress hatani ho to incognito window use karo, ya games page pe **"🔄 Saare games shuru se khelo"** dabao.

---

## 5. Kaun si cheez kahan badalni hai

| Badalna hai | File | Key |
|---|---|---|
| Naam, tumhara naam | `config.js` | `person` |
| Birthday date/time, preview key, together-since | `config.js` | `event` |
| Login ka look, session minutes, bike/teer | `config.js` | `login` |
| **Login ke sahi jawab + secret code** | `private/content.js` | `login` |
| Website ke saare texts / buttons / messages | `config.js` | `texts` |
| Colors | `config.js` | `theme` |
| Koi section chhupana | `config.js` | `show` |
| Volume, candles, typing speed... | `config.js` | `settings` |
| Gaane | `config.js` | `music`, `gameMusic` |
| Taala ke 4 stages | `config.js` | `lock` |
| **Games (sawaal, jawab, khazane ke number)** | `private/content.js` | `games` |
| **3D carousel photos/video + captions** | `private/content.js` | `carouselPhotos` |
| **Memory Wall photos + captions** | `private/content.js` | `photos` |
| **Our Story** | `private/content.js` | `timeline` |
| Reasons / scratch gifts / letter | `private/content.js` | `reasons`, `gifts`, `letter` |

Texts mein `{name}`, `{from}`, `{date}` likh sakte ho, ye apne aap bhar jaate hain.

### Nayi photo lagani ho
1. Photo `private/images/carousel/` ya `private/images/wall/` mein daalo, **naye naam se** (jaise `5-beach.jpg`). Purana naam reuse karoge to browser cache ki wajah se purani photo dikh sakti hai.
2. `private/content.js` mein path aur caption likho:
   ```js
   { src: "images/wall/5-beach.jpg", caption: "Beach wali yaad 🌊" },
   ```
   Carousel mein video bhi chalta hai: `{ video: "videos/naam.mp4", caption: "..." }`
3. File ke naam ka **capital/small bilkul same** rakho (`Photo.JPG` ≠ `photo.jpg`).
4. Photo side mein ghoomi hui ho to seedhi karo:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\rotate-photo.ps1 private\images\wall\5-beach.jpg left
   ```
   (`left` = sir right ki taraf ho tab, `right` = sir left ki taraf ho tab, `flip` = ulti photo)
5. `node encrypt.js`

Photo ~1 MB se chhoti rakho (WhatsApp pe bhej ke download karne se chhoti ho jaati hai).

### Our Story card
```js
{ date: "First Date", title: "Wo pehli date", emoji: "☕🌹",
  points: ["pehla point", "doosra point"] },     // photo chahiye to emoji ki jagah photo: "images/..."
```

---

## 6. Games ka reference (`private/content.js` → `games`)

Har game ke common fields:
```js
{ type: "...", badge: "🎯", title: "...", question: "...",
  reward: { value: "47" },          // jeetne pe khazane se ye number (taale mein kaam aata hai)
  winMessage: "..." }
```

| `type` | Kya hai | Khaas fields |
|---|---|---|
| `guess` | Jawab type karo | `answers: [...]`, `pattern` (regex, jaise number range), `equation` (bada box), `hint`, `hintAfterTries`, `wrongMessage`, `emptyMessage`, `inputMode: "numeric"` |
| `table` | Pahada, timer ke saath | `number`, `upto`, `seconds` |
| `quiz` | Kai sawaal ek ke baad ek | `questions: [...]`, optional `picture` (sabke upar photo) |
| `dice` | 6 aane tak ghumao | `guaranteeSixAfter`, `tryMessages`, `winText` |
| `cards` | 3 cards swap, aakhir mein video | `winOnTry`, `wrongMessages`, `video`, `shuffleSeconds` |
| `puzzle` | Photo ke tukde jodo | `image`, `grid` (3 = 9 tukde), `showCorrect`, `peekSeconds` |
| `catch` | Basket mein dil pakdo | `seconds`, `target`, `playFullTime`, `items` (emoji/points/chance, `points: "zero"` = bomb), `results` |
| `kiss` | Mic mein kiss | `kissesNeeded`, `sensitivity`, `fallbackAfterSeconds`, `successText` |

**Quiz ke sawaal (`questions`):**
```js
{ q: "Sawaal?", answers: ["july", "jul"], match: "exact" }        // match: exact | contains | number
{ q: "...", kind: "choice", options: ["A", "B", "C", "D"], answer: "B", correctText: "...", hint: "..." }
{ q: "...", kind: "date", answers: ["30/2", "31/2"], hint: "...", hintAfterTries: 3 }   // 3 galti ke baad din+mahina dropdown
{ q: "...", kind: "multi", fields: 3, distinct: true, match: "contains", answers: [["teddy"], ["ring", "anguthi"]] }
```

**Naya game kahan jode:** list ke **end mein** jodo. Progress game ke number se save hoti hai, isliye beech mein jodne se kisi ki saved progress gadbad ho sakti hai.

**Taala (`config.js` → `lock.stages`):** `recall` (har game ka number), `sum` (jod), `double` (har number × 2), `product` (`digit: "ones"` = sirf ikai ke ank ka guna). Inke jawab apne aap games ke `reward` numbers se bante hain.

---

## 7. 🔐 Encryption kaise kaam karta hai

**`node encrypt.js` kya karta hai:**
1. `private/content.js` padhta hai.
2. 5 login jawab ko normalize karke (small letters, space hata ke, DOB → `ddmmyyyy`) jodta hai, phir **PBKDF2-SHA256 (250,000 rounds, random salt)** se 256-bit chaabi banata hai.
3. Content mein jitne bhi photo/video ke path hain (`.jpg .png .svg .gif .webp .mp4 .mov .webm`), sabko `private/` se padh ke **AES-256-GCM** se band karke `secure/m/<random>.bin` mein likhta hai.
4. Baaki content (games, captions, letter...) + photos ki list ko `secure/data.bin` mein band karta hai.
5. Har baar naya salt aur naye file naam banta hai, aur purana `secure/` hata deta hai.

**Browser mein:** login pe wahi 5 jawab se wahi chaabi banti hai. `data.bin` khul gaya to login sahi, warna galat. Chaabi kahin save nahi hoti (isliye har baar login zaroori hai). Photos ke `blob:` URL sirf us tab ki memory mein bante hain.

**Normalize ka niyam `encrypt.js` aur `js/main.js` dono mein bilkul same hona chahiye** (`keyMaterial` function). Ek mein badla to dono mein badalna.

**Login ke jawab ya secret code badalna ho:** `private/content.js` → `login` mein badlo, phir `node encrypt.js`. Login ke placeholder/hint texts `config.js` → `texts` mein hain.

**Suraksha ki seema:**
- Bina paanchon sahi jawab ke koi photo, video, letter ya game ka jawab nahi dekh sakta, technical insaan bhi nahi.
- Secret code kamzor ya andaaze layak mat rakhna. Taale ki asli mazbooti wahi hai.
- Countdown (13 Oct) ka lock browser mein chalta hai. Login jaanne wala ise jaldi khol sakta hai.
- `config.js`, gaane aur ye doc encrypted nahi hain. Inme kuch personal mat likhna.

---

## 8. Local pe chalana aur test karna

```bash
cd "C:\Plugin Release\birthday"
python -m http.server 8000
```
| Link | Kya dikhega |
|---|---|
| `http://localhost:8000/` | Asli flow (13 Oct se pehle: login → games → taala → countdown) |
| `http://localhost:8000/?preview=<previewKey>` | Countdown skip: login → games → taala → seedha surprise |
| `http://localhost:8000/?preview=<previewKey>&jump=cake` | Login ke baad seedha cake page (testing ke liye) |

`<previewKey>` `config.js` → `event.previewKey` mein hai. Ye link Priyanshi ko mat bhejna.

- `index.html` ko double-click karke (file://) mat kholna. Encryption aur mic sirf `http://localhost` ya `https://` pe chalte hain.
- Badlaav na dikhe to **Ctrl + Shift + R** (hard refresh).
- Phone pe test karne ke liye upload ke baad asli `https://` link use karo.

---

## 9. Upload / hosting

**Sabse achha: private GitHub repo + Netlify (free)**
1. GitHub pe **private** repo banao aur push karo. `.gitignore` ki wajah se `private/` push nahi hoga.
   ```bash
   git add .
   git commit -m "update"
   git push
   ```
2. Netlify → "Add new site" → "Import from GitHub" → repo chuno. **Build command khaali**, **publish directory `.`** (root).
3. Netlify ek `https://...netlify.app` link dega. Har `git push` ke baad site apne aap update hoti hai, aur link wahi rehta hai.

**Upload se pehle checklist:**
- [ ] `node encrypt.js` chalaya?
- [ ] `secure/` folder upload/push ho raha hai?
- [ ] `private/` **nahi** ja raha? (`git status` mein `private/` nahi dikhna chahiye)
- [ ] Local pe sahi login se photos khul rahi hain?

**`private/` ka backup** Google Drive ya pendrive pe zaroor rakhna. Ye GitHub pe nahi jaata, aur laptop kharab hua to asli photos aur content sirf wahi bachega.

GitHub Pages bhi chal jaata hai, lekin free mein uske liye repo **public** hona chahiye. Encrypted content tab bhi safe rahega, bas `config.js` aur code sabko dikhega.

---

## 10. Dikkat aaye to

| Dikkat | Wajah / hal |
|---|---|
| Sahi jawab pe bhi "Galat hai jaan" | `node encrypt.js` ke baad purani `secure/` upload hui, ya `private/content.js` ke jawab alag hain. Encrypt dobara chalao aur `secure/` upload karo |
| "Internet thoda slow hai" | `secure/` folder upload nahi hua, ya file:// se khola |
| Nayi photo nahi dikh rahi | `node encrypt.js` nahi chalaya / naam ka capital-small galat / cache (naya naam do, Ctrl+Shift+R) |
| Photo ghoomi hui | `tools/rotate-photo.ps1` |
| Video mein awaaz nahi | Browser tab mute to nahi? Video player ka 🔊 band to nahi? Windows volume mixer check karo |
| Mic kaam nahi kar raha | Sirf https/localhost pe chalta hai. Permission allow karni padti hai. Kiss game mein 20 sec baad tap wala button aa jaata hai |
| Games galat jagah se shuru | Purani saved progress. Games page pe "Saare games shuru se khelo" ya incognito |
| Kuch bhi toot jaaye | Browser console kholo (F12) aur error dekho |
