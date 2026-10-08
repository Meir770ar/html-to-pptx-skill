# התקנה ניידת

דרישות: Node.js 22.13 ומעלה, Chrome/Edge/Chromium, ופונטים מתאימים לעברית. PowerPoint נדרש רק לבדיקה ולרינדור של מקור PPTX, לא ליצירה או לשדרוג הקובץ. ספריית PDF.js וקנבס מקומי משמשים לצילום רפרנס של ספר/PDF; אין צורך ב־API בתשלום. גרסת Puppeteer נעולה ל־25.12.0.

1. העתיקו את תיקיית `html-to-pptx` אל תיקיית הסקילים של הסוכן: למשל `~/.claude/skills/html-to-pptx` או `~/.codex/skills/html-to-pptx`.
2. פתחו טרמינל בתוך התיקייה והריצו:

```bash
npm ci
node scripts/html-to-pptx.js --help
npm test
```

Chrome או Edge מותקן מזוהה אוטומטית. אם אינו נמצא, הגדירו `--browser=PATH` או התקינו את דפדפן Puppeteer:

```bash
npx puppeteer browsers install chrome
```

אין צורך לשנות SKILL.md או להגדיר `setup_complete`; הבדיקה היא הפעלה בפועל. ההתקנה הראשונה עשויה להוריד דפדפן. כדי להשתמש רק בדפדפן שכבר מותקן, הגדירו `PUPPETEER_SKIP_DOWNLOAD=true` במהלך `npm ci`, ואז הפעילו עם אותו דפדפן.

פונטים: התקינו ביעד את הפונטים שבהם נכתב ה־HTML. אין להפיץ פונט מסחרי ללא רישיון. במצב `image` התמונה משמרת את הצילום מן המחשב שבו בוצעה ההמרה; במצבי עריכה PowerPoint זקוק לפונט עצמו.

דוגמת התחלה:

```bash
node scripts/init-deck.cjs my-presentation
node scripts/html-to-pptx.js my-presentation/index.html faithful.pptx --mode=image --rtl
```

הסקילים המתקדמים `presentation-architect`, `slideshow` ו־`hyperframes-animation` יכולים להעשיר את היצירה אם הם מותקנים. התבנית והיצוא הכלולים אינם תלויים בהם ואינם דורשים שירות חיצוני בתשלום.
