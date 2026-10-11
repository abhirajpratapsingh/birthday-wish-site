/* =====================================================================
   💖  SIRF IS FILE KO EDIT KARO  💖
   Website ki har value yahin se aati hai: naam, date, texts, colors,
   photos, letter... Kisi aur file ko chhedne ki zaroorat nahi.

   Texts mein ye placeholders kahin bhi likh sakte ho:
     {name}  → person.name        (jiske liye site hai)
     {from}  → person.from        (tumhara naam)
     {date}  → event.dateLabel    (jaise "13 October")
   ===================================================================== */
window.CONFIG = {

  /* ---------- 1. KISKE LIYE, KISNE BANAYI ---------- */
  person: {
    name: "Priyanshi",
    from: "Your Love"
  },

  /* ---------- 2. DATE AUR LOCK ---------- */
  event: {
    // Kab khulegi (India time +05:30). Time internet se liya jata hai.
    date: "2026-10-13T00:00:00+05:30",
    dateLabel: "13 October",

    // true = is date se pehle sirf countdown dikhega
    lockUntilDate: true,

    // Khud pehle se poori site dekhne ke liye:  index.html?preview=abhi1310
    previewKey: "abhi1310",

    // "Together Since" counter ki date. Nahi chahiye to show.together = false
    togetherSince: "2019-02-04T00:00:00+05:30",

    // Dates kis format/bhasha mein dikhengi
    locale: "en-IN"
  },

  /* ---------- LOGIN (unlock ke baad, surprise se pehle) ---------- */
  login: {
    enabled: true,                  // false = login page skip
    // 🔐 Login ke sahi jawab (naam, DOB, secret code) yahan NAHI hain.
    //    Wo private/content.js mein hain, aur unhi se poori site encrypt hoti hai.
    passwordIsDate: true,           // true = password fields DD/MM/YYYY date hain (/ apne aap lagega)
    caseSensitive: false,           // false = "Priyanshi" aur "priyanshi" dono chalenge
    rememberOnDevice: false,        // encryption ki wajah se har baar login zaroori hai (isse true mat karna)
    entrance: "bike",               // login card kaise aaye: "bike" | "arrow" | "random"

    // Login ke baad itne minute ka session. Time khatam hote hi page refresh hoke login pe chala jayega.
    sessionMinutes: 10,             // 0 = koi time limit nahi
    showSessionTimer: true,         // true = upar kone mein bacha hua time dikhega
    sessionEndPopupSeconds: 10      // time khatam hone par "padhai karo" popup kitne second dikhe, phir login
  },

  /* ---------- TAALA (saare games ke baad) ---------- */
  // 4 taale, har ek se ek chaabi milegi. Khazane ke numbers upar games ke "reward" se aate hain.
  lock: {
    stages: [
      // extendAfterTries: itni baar time khatam hone ke baad timer extendedSeconds ka ho jayega
      { type: "recall",  seconds: 60, extendAfterTries: 10, extendedSeconds: 90, title: "Taala 1: Yaad hai? 🧠",
        question: "Har game ke aage uska khazane wala number likho. Time kam hai, jaldi karo! ⏱️" },
      { type: "sum",     seconds: 0,  title: "Taala 2: Jod lagao ➕",
        question: "Saare khazane ke numbers ka total (jod) kitna hai?" },
      // timeSteps: kitni haar ke baad kitna time | skipAfterTries: itni haar ke baad taala apne aap khul jayega
      { type: "double", seconds: 60, title: "Taala 3: Double karo ✖️2",
        timeSteps: [{ after: 0, seconds: 60 }, { after: 5, seconds: 90 }, { after: 10, seconds: 120 }],
        skipAfterTries: 11,
        skipMessage: "Kya yaar! 😩 11 baar mein bhi 2 se guna nahi hua? Pagal, itna bhi nahi kar paayi! Aur khud ko maths teacher bolti hai 🙄 Chal theek hai, tere liye aasaan kar deta hoon... ye taala main khud khol deta hoon 🔑 Bas kisi ko batana mat ki madam ji ko 2 ka pahada nahi aata 🤭😂",
        question: "Har game ke number ko 2 se guna karke likho. Jaldi karo, time chal raha hai! ⏱️" },
      // digit: "ones" = har number ka sirf ikai (aakhri) ank lekar guna. (47 → 7, 83 → 3 ...)
      { type: "product", seconds: 60, digit: "ones", title: "Taala 4: Guna karo ✖️",
        question: "Saare khazane ke numbers ke ikai (aakhri) wale ank ko aapas mein guna karo. Jaise 47 ka 7, 83 ka 3... 1 minute! ⏱️" }
    ]
  },

  /* ---------- 3. MUSIC, NOTIFICATION, SETTINGS ---------- */
  // Ye gaana sabse pehle bajega (unlock ke baad pehle tap pe) aur poori site mein chalta rahega
  gameMusic: "music/game-tune.wav",      // login ke baad games + taale mein bajne wali dhun ("" = off)
  music: "music/happy-birthday.wav",   // "" = music off  (apna gaana daalna ho to music/ mein daal ke naam yahan likho)
  oneSignalAppId: "",               // OneSignal App ID (optional, push notification ke liye)

  settings: {
    musicVolume: 0.6,               // birthday gaane ki awaaz (0 se 1)
    gameMusicVolume: 0.4,           // game wali dhun ki awaaz (0 se 1)
    candles: 6,                     // cake pe kitni candles
    carouselMaxPhotos: 16,          // 3D carousel mein max photos
    carouselSpeed: 0.15,            // carousel ghoomne ki speed
    typingSpeed: 28,                // letter typing (ms per letter, kam = tez)
    micSensitivity: 0.16,           // phoonk detect (kam = jaldi detect)
    scratchRevealPercent: 45,       // kitna scratch karne pe card khul jaye
    calendarDurationMinutes: 15     // midnight alarm event kitni der ka ho
  },

  /* ---------- 4. COLORS (theme) ---------- */
  theme: {
    bg: "#0b0614",                  // background
    bgGlow: "#2b0f40",              // upar wali halki roshni
    primary: "#ff4d8d",             // main pink
    primarySoft: "#ff9cc2",         // light pink
    accent: "#ffd27a",              // gold
    secondary: "#9b6bff",           // purple
    text: "#fff5fa",
    muted: "#d8bfd4",

    confetti: ["#ff4d8d", "#ff9cc2", "#ffd27a", "#ffffff", "#b388ff"],
    floatingHearts: ["#ff4d8d", "#e0115f", "#ffc46b", "#ff9cc2"],
    stars: ["#ffffff", "#ff9cc2", "#ffd27a", "#b79bff"],
    cursorIcons: ["❤", "💖", "✨", "💕", "💗"],
    scratchCover: ["#e9b94f", "#fff0c2", "#ffe39a", "#c98f2a"],   // scratch card ki gold parat
    scratchText: "#7a4a0a",

    cake: {
      plate: "#f4f0f6",
      tier1: "#ff9ec4",
      tier2: "#fff0f6",
      cream: "#fff6fa",
      topCream: "#ff5d97",
      gold: "#ffd27a",
      hearts: "#e0115f",
      topper: "#ff2d6f",
      sprinkles: ["#ffd27a", "#9b6bff", "#4dd0e1", "#ffffff", "#ff4d8d", "#8bc34a"],
      candleStripes: [["#ffffff", "#ff4d8d"], ["#fff3c4", "#9b6bff"], ["#ffffff", "#4dd0e1"]]
    }
  },

  /* ---------- 5. KAUNSE SECTIONS DIKHANE HAIN ---------- */
  show: {
    together: true,
    moments: true,       // 3D photo carousel
    story: true,         // timeline
    wall: true,          // polaroid photos
    reasons: true,
    gifts: true,         // scratch cards
    letter: true,
    finale: true,
    marquee: true,       // chalti hui text strips
    mic: true            // mic se phoonk wala button
  },

  /* ---------- 6. WEBSITE KE SAARE TEXTS ---------- */
  texts: {
    pageTitle: "Happy Birthday {name} ❤",
    loader: "Kuch special load ho raha hai...",

    // Countdown screen
    gateEyebrow: "Something is coming… 🤫",
    gateTitle: "Thoda sa intezaar...",
    gateNote: "{date} ko khulega ye surprise ✨",
    unitDays: "Days",
    unitHours: "Hours",
    unitMinutes: "Minutes",
    unitSeconds: "Seconds",

    // Enable Surprise button + popup
    surpriseBtn: "Enable Surprise 🔔",
    surpriseEnabledBtn: "Surprise enabled ✅",
    //surpriseEnabledStatus: "Done! {date} ko raat 12 baje phone bajega 🎉",
    surprisePushBlocked: "Notifications block ho gayi. Calendar alarm wala option use karo ⏰",
    modalTitle: "Raat 12 baje ka surprise",
    modalText: "Neeche se koi ek ya dono on kar do. {date} ko raat 12 baje phone bajega, aur ek tap mein tumhara surprise khul jayega.",
    icsTitle: "Midnight alarm lagao",
    icsSub: "Phone ke calendar mein add hoga (Android + iPhone)",
    gcalTitle: "Google Calendar mein add karo",
    gcalSub: "Reminder \"At time of event\" pe rakhna",
    pushTitle: "Notifications on karo",
    pushSub: "Browser band ho tab bhi aayega",
    iosHint: "iPhone pe notification ke liye pehle Safari mein Share ↑ → \"Add to Home Screen\" karo, phir home screen wale icon se site khol ke ye button dabao.",

    // Calendar alarm / notification ka text
    calendarTitle: "🎂 Something special is waiting for you…",
    calendarText: "Happy Birthday {name}! Tap to open your surprise ❤",

    // Session khatam hone wala popup
    sessionEndTitle: "Time's up, padhaku ji! 📚",
    sessionEndText: "Ab padhai karo jaake! Bahut der se games khel liye 😄 Surprise tumhe mil jayega, abhi padhai pe bhi dhyan do, exam aane wala hai! 💪",
    sessionEndCount: "{n} second mein login pe bhej rahe hain...",

    // Music on/off button (upar right kone mein)
    musicOn: "🔊 Music on",
    musicOff: "🔇 Music off",

    // "Tap to begin" screen (yahin se gaana shuru hota hai)
    beginTitle: "Ek surprise tumhara intezaar kar raha hai 💌",
    beginSub: "🔊 Awaaz thodi tez kar lo",
    beginBtn: "Tap to begin 💖",

    // Login page
    loginTitle: "Welcome, Birthday Girl 💖",
    loginSub: "Ye darwaza sirf tumhare liye khulta hai",
    usernameLabel: "Username",
    username1Placeholder: "Tumhara first name",
    username2Placeholder: "Tumhare maalik ka first name 😎",
    passwordLabel: "Password",
    password1Placeholder: "Tumhara DOB (DD/MM/YYYY)",
    password2Placeholder: "Tumhare maalik ka DOB (DD/MM/YYYY)",
    loginHint: "Ye sirf hum dono ka secret hai 🤫",
    secretLabel: "Secret code",
    secretPlaceholder: "Hum dono ka secret code 💕",
    loginBtn: "Enter your Birthday Surprise 🎂",
    loginChecking: "Taala khul raha hai... 🔐",
    loginOpening: "Yaadein khul rahi hain... {n}/{total} 💖",
    loginNetError: "Internet thoda slow hai 🙈 Ek baar phir try karo",
    loginError: "Oops! Galat hai jaan 🙈 Phir se try karo",
    loginEmpty: "Chaaron cheezein bharo na 🥺",
    loginSuccess: "Access granted, meri jaan 💖",

    // Games intro page + game screen
    gamesIntroTitle: "Pehle games jeeto, phir gift milega! 🎁",
    gamesIntroText: "Apne gift aur birthday surprise tak pahunchne ke liye tumhe kuch chhote-chhote games jeetne honge. Jab saare jeet jaogi, tabhi aage ka darwaza khulega 😉",
    gamesIntroSteps: "🎮 Games jeeto|🎁 Gift unlock|🎂 Birthday surprise",
    gamesIntroBtn: "Enter the Games 🎮",
    gamesContinueBtn: "Game {n} se continue karo 🎮",
    gamesAllDoneBtn: "Aage badho, surprise intezaar kar raha hai ✨",
    gamesProgress: "{done} / {total} games jeet chuki ho 🏆",
    gamesRestartBtn: "🔄 Saare games shuru se khelo",
    gateReplayBtn: "🎮 Games dobara khelo",
    resetConfirm: "Pakka? Dobara tap karo 🔄",
    gameStep: "Game {n} / {total}",
    gameBtn: "Check karo 💘",
    gameEmpty: "Kuch toh likho 🥺",
    gameWrong: "Nahi jaan, ye nahi hai 🙈 Phir se socho!",
    gameHintPrefix: "Hint: ",
    gamesDone: "Saare games jeet gayi! 🏆",

    // Saare games ke baad: taala kholne se pehle wala page
    lockIntroTitle: "Ab khazane ke numbers se taala kholo! 🔐",
    lockIntroText: "Wah meri jaan, tumne saare games jeet liye! 🏆 Har game mein khazane se jo numbers mile the, ab unhi se agla taala khulega. Taala khulega tabhi tum aage badh paogi... Taiyaar ho? 😉",
    lockIntroSaved: "Tumhare khazane ke numbers:",
    lockIntroBtn: "Haan, main taiyaar hoon! 🔓",
    lockStage: "Taala {n} / {total}",
    lockLocked: "100% locked",
    lockProgress: "{open}% khula · {closed}% abhi bhi band",
    lockAllOpen: "100% khula! 🔓",
    lockStart: "Start ⏱️",
    lockCheck: "Check karo 🔑",
    lockRowDouble: "{game} × 2",
    lockWrong: "Jo laal hain wo galat hain, jaldi theek karo! ⏳",
    lockWrongOne: "Nahi jaan, ye sahi nahi hai 🙈 Phir se gino!",
    lockEmpty: "Saare khaane bharo! ⏳",
    lockTimeUp: "Time khatam! ⏰ Koi baat nahi, phir se try karo",
    lockMoreTime: "Time khatam! ⏰ Chalo, itni mehnat ki hai to ab tumhe {time} minute milenge 😉",
    lockLastChance: "Time khatam! ⏰ Ab {time} minute milenge... aur ye AAKHRI mauka hai, dhyan se! 😤",
    lockSkipBtn: "Theek hai, taala kholo 🙈",
    lockSkipKey: "Lo, chaabi bhi main hi de raha hoon 🙄🔑",
    lockRetry: "Phir se try karo 🔄",
    lockKey: "Chaabi mil gayi! 🔑",
    lockNext: "Aage badho ➜",
    lockOpenTitle: "Taala khul gaya! 🔓🎉",
    lockOpenText: "Haan meri jaan, tum jeet chuki ho! 🥳 Saare taale khul gaye. Ab tumhara asli surprise intezaar kar raha hai 💖",
    lockFinalBtn: "Aage badho ✨",

    // Lucky draw (taala khulne ke baad)
    luckyTitle: "Lucky Draw! 🎁",
    luckyText: "Taala khulne ka inaam! 🥳 In 15 cards mein Flipkart, Amazon, Myntra, Zara ke vouchers aur PhonePe cash chhupe hain... aur kuch bilkul khaali 😜 Har baar cards shuffle honge, aur tumhare paas sirf 5 chances hain. Dekhte hain kitni lucky ho!",
    luckyShuffling: "Cards shuffle ho rahe hain... 🔀",
    luckyPick: "Ab ek card chuno! 👆",
    luckyTries: "Chances bache: {n} / {total}",
    luckyWin: "Wow! 🎉 {title} {text} jeet liya!",
    luckyMissed: "Arre arre! 😜 Dekho kya-kya chhoot gaya... Flipkart ₹1000, Amazon ₹3000, Myntra ₹2000, Zara ₹2500... sab miss kar diya! 🙈",
    luckyWonTitle: "Tumhe {n} gifts mile 🎁",
    luckyTotal: "Total: {sum} 💸",
    luckyWonNote: "Ye vouchers main tumhe khud dunga 😉",
    luckySendText: "Ab is page ka screenshot lo 📸 aur ye card apne boyfriend Abhiraj ko WhatsApp pe bhejo, abhi ke abhi! Bhejne ke baad 'Bhej diya' dabao, tabhi aage ka darwaza khulega 😉",
    luckyNagTitle: "Pehle bhejo! 😤",
    luckyNagOk: "Theek hai, bhejti hoon 🙄",
    luckyWhatsApp: "💬 WhatsApp kholo",
    luckyWhatsAppMsg: "Maine Lucky Draw mein jeeta 🎉 {list} — ab de do mera inaam 😌🎁",
    luckySentBtn: "Bhej diya ✅",
    luckyNotSentBtn: "Nahi bheja 🙈",
    luckyNag: [
      "Arre yaar! Abhi tak nahi bheja?? 😤 Jab tak screenshot Abhiraj ke WhatsApp pe nahi pahunchega, tab tak na voucher milega, na aage ka darwaza khulega! Chalo chalo, jaldi bhejo! 📸💨",
      "Oye madam ji! 🙄 Itna bhi kya sharmaana? Bhejna toh padega hi, warna ye voucher main kisi aur ko de dunga 😜 (mazaak tha... par bhejo jaldi!)",
      "Haww! 😱 Abhi bhi nahi bheja? Abhiraj phone haath mein lekar baitha hai, har 2 second mein WhatsApp check kar raha hai 📱😂 Bechare pe taras khao aur bhejo!",
      "Dekho, seedhi baat: screenshot bhejo, voucher lo, aage badho. Nahi bhejogi toh yahin baithi rahogi poori raat 😴🌙 Choice tumhari! 😏"
    ],
    luckyNone: "Ohho! 😂 5 mein se ek bhi voucher nahi nikla... aaj kismat ne dhokha de diya 🙈 Bad luck meri jaan! (Par udaas mat ho, asli surprise abhi baaki hai 😉)",
    luckyNext: "Aage chalo ➜",
    tableStart: "Start ⏱️",
    tableCheck: "Check karo ✅",
    tableWrong: "{count} galat hain, jaldi theek karo! ⏳",
    tableEmpty: "Saare khaane bharo, time chal raha hai! ⏳",
    tableTimeUp: "Time khatam! ⏰ Koi baat nahi, phir se try karo",
    tableRetry: "Phir se try karo 🔄",
    kissTapMic: "Mic button dabao aur kiss karo 😘",
    kissListening: "Ab mic ke paas ek pyaari si kiss karo... 😘 (mwah!)",
    kissMore: "Ek aur! 😘 ({n} / {total})",
    kissDenied: "Mic allow nahi hua 🙈 Koi baat nahi, neeche wala button dabao",
    kissNoMic: "Is phone pe mic nahi chal raha 🙈 Neeche wala button dabao",
    kissFallback: "Yahan tap karke kiss bhejo 💋",
    catchStart: "Start ▶️",
    catchRetry: "Phir se khelo 🔄",
    catchHow: "Ungli ya mouse se basket left-right chalao 👆",
    catchGo: "Go! 💘",
    puzzleFlipped: "Cards palte: {n} / {total}",
    puzzlePlace: "Ab tukde sahi jagah lagao ✨ Sahi: {n} / {total}",
    puzzlePeek: "👀 Photo dekho",
    quizStep: "Sawaal {n} / {total}",
    pictureTapHint: "🔍 Photo pe tap karke bada karo",
    rewardNext: "Number yaad kar liya, aage chalo ➜",
    treasureTitle: "Khazana khul gaya! 🎉",
    treasureLabel: "Game {n} ka number",
    treasureText: "Ise yaad kar lo, aage kaam aayega 😉",
    diceRoll: "🎲 Ghumao",
    diceRolling: "Ghoom raha hai... 🤞",
    diceCount: "Kitni baar ghumaya: {n}",
    cardsStart: "Start 🔀",
    cardsShuffling: "Cards mix ho rahe hain... dhyan se dekho 👀",
    cardsPick: "Ab ek card chuno! 👆",
    cardsTry: "Koshish #{n}",
    videoAgain: "🔁 Dobara dekho",
    videoNext: "Aage chalo ➜",
    rewardsSaved: "🔐 Tumhare khazane ke number:",
    quizCorrect: "Sahi jawab! ✅",
    quizMultiWrong: "Jo laal hain, wo gift maine nahi diye 🤔 Yaad karo!",
    quizMultiSame: "Teeno alag-alag gifts batao 😄",
    quizDay: "Din",
    quizMonth: "Mahina",
    quizMonths: "January|February|March|April|May|June|July|August|September|October|November|December",

    // Gift screen
    introTitle: "Hey {name},",
    introSub: "Ek chhota sa surprise hai tumhare liye...",
    introBtn: "Open your gift 🎁",
    welcomeTitle: "Welcome back {name} ❤️",
    welcomeSub: "Tumhara surprise abhi bhi yahin hai...",
    welcomeBtn: "Open it again 🎁",

    // Cake
    heroEyebrow: "{date}",
    heroTitle: "Happy Birthday",
    blowBtn: "Make a wish & blow the candles 🕯️",
    relightBtn: "Candles dobara jalao 🕯️",
    micBtn: "🎤 Mic se phoonko",
    micListening: "🌬️ Ab zor se phoonko!",
    micNotSupported: "Mic not supported, button use karo",
    micDenied: "Mic allow nahi hua, button use karo",
    wishMessage: "Yayyy! Happy Birthday {name}! Tumhari saari wishes poori hon 🎉",
    scrollHint: "Scroll down",

    // Sections
    togetherTitle: "Together Since",
    togetherFooter: "...aur har second tumse aur pyaar hota gaya 💕",
    momentsTitle: "Our Beautiful Moments",
    momentsSub: "Drag karke ghumao ✨ photo pe tap karo",
    storyTitle: "Our Story",
    storySub: "Ek pyaari si kahani",
    wallTitle: "Memory Wall",
    wallSub: "Har photo ek yaad hai 📸",
    reasonsTitle: "Reasons I Love You",
    reasonsSub: "Har card pe tap karo 💌",
    reasonsTap: "tap to reveal",
    giftsTitle: "Gifts For You",
    giftsSub: "Ungli se scratch karo ✨",
    scratchLabel: "Scratch me ✨",
    letterTitle: "A Letter For You",
    letterHint: "Envelope pe tap karo 💌",
    envelopeLabel: "For you ❤",
    letterSignature: "— {from}",
    finaleTitle: "I Love You",
    finaleMessage: "Happy Birthday, meri jaan. Thank you for coming into my life. 🎂✨",
    replayBtn: "Replay from start ↺",
    footer: "Made with ❤ by {from}"
  },

  /* ---------- 7. CONTENT ---------- */

  // Chalti hui text strips
  marquee: ["Happy Birthday", "My Love", "My Favourite Person", "Forever Yours", "{date}", "Stay Blessed"],

};
