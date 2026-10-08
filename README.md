# מצגות HTML אינטראקטיביות ו־PowerPoint — גרסה 2

סקיל לסוכני AI שיוצרים מצגות בעברית: מקור HTML אינטראקטיבי עם מושן גרפי, ולצדו יצוא ל־PowerPoint. מתאים ל־Claude Code ול־Codex דרך קובץ `SKILL.md`.

## התקנה מהמאגר

דרישות: Node.js 22.12 ומעלה ו־Chrome, Edge או Chromium. PowerPoint נדרש רק לבדיקה בתוכנה עצמה.

```bash
git clone https://github.com/Meir770ar/html-to-pptx-skill.git html-to-pptx
cd html-to-pptx
npm ci
```

לשימוש כסקיל, העתיקו את תיקיית המאגר אל `~/.claude/skills/html-to-pptx` או `~/.codex/skills/html-to-pptx`. הוראות נוספות ב־[SETUP.md](SETUP.md).

## יצירה ויצוא

הסקיל כולל תכנון למצגת עם מושן, תבנית עצמאית עם ניווט/חשיפות/הערות, וממיר שמודד את הפריסה בדפדפן. אין צורך ב־API או במנוי בתשלום עבור התבנית והיצוא.

```bash
npm ci
node scripts/init-deck.cjs my-presentation
node scripts/html-to-pptx.js my-presentation/index.html faithful.pptx --mode=image --rtl
node scripts/html-to-pptx.js my-presentation/index.html editable.pptx --mode=editable --rtl
npm test
```

פתחו את `my-presentation/index.html` בדפדפן. חצים/Space לניווט ולחשיפות, F למסך מלא, N להערות. כפתור מצב מרצה פותח חלון קהל מסונכרן; שתפו את חלון/טאב הקהל בשיחת וידאו כדי שההערות יישארו אצל המרצה.

אפשר להריץ שרת מקומי מהתיקייה לצורך חלון קהל מסונכרן בין טאבּים באותו origin:

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory my-presentation
```

פתחו `http://127.0.0.1:8000`. שינוי בהערות נשמר מקומית בדפדפן; להכללה ב־PPTX עדכנו את `data-notes` במקור. אל תציגו שמירת הערות מקומית ככתיבה אוטומטית ל־HTML.

| יצוא | מראה | עריכה |
|---|---|---|
| `image` | צילום הדפדפן ברזולוציה גבוהה | תמונה אחת לשקופית |
| `hybrid` | עיצוב הדפדפן עם טקסט Office | טקסט רגיל; הגרפיקה ברקע |
| `editable` | פריסת DOM עם רכיבי Office | טקסט, צורות בסיסיות, טבלאות פשוטות ותמונות; אפקטים לא נתמכים מצולמים |

RTL נמדד לפי המקור. תוכן מעורב עשוי להתפצל לכמה תיבות. אין הבטחה שזהות חזותית מלאה וגם עריכה מלאה אפשריות לכל HTML. אנימציות ואינטראקציות נשארות ב־HTML; PPTX כולל מצב סופי/חשיפות ומעבר Fade בסיסי. הרחבה: [SKILL.md](SKILL.md), [חוזה היצוא](references/export-contract.md), [עיצוב ומושן](references/authoring-and-motion.md).

ב־Windows עם PowerPoint מותקן אפשר להפיק הוכחות פלט:

```powershell
./scripts/verify-powerpoint.ps1 -Pptx faithful.pptx -OutputDir office-proof
```

החבילה אינה כוללת node_modules, פונטים מסחריים, credentials או תוצאות פרטיות. היא כוללת package-lock.json, תבנית ושלוש בדיקות התנהגות עיקריות: שימור השקופיות, אובייקטים נפרדים/RTL והחשיפות האינטראקטיביות, יחד עם מקרי כשל.
