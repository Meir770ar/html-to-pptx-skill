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

**פונטים להצגה ב־PowerPoint.** המצגת ב־HTML ו־`deck-faithful.pptx` (תמונות) לא תלויים בפונטים מותקנים. `deck.pptx` הניתן לעריכה כן: PowerPoint מציג טקסט אמיתי ולכן הפונט חייב להיות מותקן במחשב. ארבעת פונטי הערכות (Heebo, Rubik, Frank Ruhl Libre, Secular One, רישיון SIL OFL) כלולים ב־`assets/fonts/ttf`. התקנה למשתמש הנוכחי בלבד, בלי הרשאות מנהל:

```bash
node scripts/install-fonts.cjs --dry-run   # מה יותקן
node scripts/install-fonts.cjs             # התקנה
node scripts/install-fonts.cjs --uninstall # הסרה
```

אחרי ההתקנה יש להפעיל מחדש את PowerPoint. אפשר גם ללחוץ פעמיים על קבצי ה־TTF ולבחור "התקן".

**רינדור ב־PowerPoint (Windows).** `node scripts/make-deck.cjs deck.json out/ --powerpoint` מרנדר את הקבצים ב־PowerPoint האמיתי דרך COM. בלי הפונטים המותקנים PowerPoint עלול להיכשל בייצוא תמונה משקופית מסוימת (נצפה בטבלה עם ₪); התקינו את הפונטים והריצו שוב.

דוגמת התחלה:

```bash
node scripts/make-deck.cjs examples/demo.json out/ --overwrite
```

הסקילים המתקדמים `presentation-architect`, `slideshow` ו־`hyperframes-animation` יכולים להעשיר את היצירה אם הם מותקנים. התבנית והיצוא הכלולים אינם תלויים בהם ואינם דורשים שירות חיצוני בתשלום.
