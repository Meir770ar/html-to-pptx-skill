---
name: html-to-pptx
description: Create and redesign HTML or existing PowerPoint presentations with Hebrew RTL, motion graphics and locked content/speaker notes. Extract a requested design language from websites, books/PDFs, screenshots or reference decks, then apply it to a new or existing presentation and verify preservation.
---

# מצגות אינטראקטיביות עם מושן ויצוא PowerPoint

בנו מקור HTML אחד עם סיפור ברור, טיפוגרפיה, מושן גרפי, חשיפות מדורגות, ניווט ומצב מרצה. הפיקו ממנו PPTX באמצעות הפריסה שהדפדפן חישב, ולא באמצעות חילוץ טקסט ובניית עיצוב אחר.

## תוכן קיים או שפה עיצובית מרפרנס

כשמקבלים מצגת מוכנה מבחינת תוכן והערות, שנו עיצוב בלבד: אין לשכתב, לקצר, להוסיף, למחוק או לסדר מחדש את התוכן ללא בקשה לכך. למצגת PPTX קיימת קראו [redesign-existing.md](references/redesign-existing.md): inspect → תכנון עיצוב לפי אובייקטים קיימים → apply → בדיקת שימור → רינדור ובדיקה חזותית. הקובץ המקורי נשמר, וההערות, התמונות, התרשימים, הנתונים והקישורים נשארים בחבילה המקורית.

אם מבוקשת שפה עיצובית מאתר, ספר/PDF, עמודים מצולמים או מצגת אחרת, קראו תחילה [reference-design-language.md](references/reference-design-language.md). אספו ראיות, התבוננו בדוגמאות והפיקו פרופיל עיצוב עם צבעים, טיפוגרפיה, היררכיה, מרווחים, קומפוזיציה, טיפול בתמונות ומושן מתאים. פרופיל שנוצר אוטומטית הוא טיוטת תצפיות; הסוכן חייב לקרוא את הראיות ולהשלים את השפה לפני `reviewed:true`. זו בדיקת המחבר ולא דרישה לאישור נוסף מן המשתמש. אין להעתיק תוכן, לוגו או נכסים מן הרפרנס כשנתבקשה רק השפה העיצובית.

```bash
node scripts/style-reference.cjs capture reference.pdf reference.style-work --pages=1,2,3
node scripts/style-reference.cjs capture https://example.com reference.style-work
node scripts/redesign-pptx.cjs inspect source.pptx source.pptx-work --layout=auto
node scripts/redesign-pptx.cjs apply source.pptx source.pptx-work/design.redesign.json redesigned.pptx
node scripts/redesign-pptx.cjs verify source.pptx redesigned.pptx
```

ל־HTML קיים, שמרו עותק לפני שינוי והריצו `node scripts/content-lock.cjs verify before.html after.html`. בדיקה זו משווה טקסט לפי סדר השקופיות, הערות, יעדי קישורים והפניות למדיה; בדיקת PPTX משווה גם את כל חלקי החבילה המוגנים בבייטים. הצלחת בדיקת התוכן אינה מבטיחה קריאות, ניגודיות או היעדר חפיפות — בדקו גם את הפלט החזותי.

## הרכבת היכולות

כשמותקנים הסקילים המתאימים, השתמשו ב־`presentation-architect` לתכנון הסיפור; ב־`hyperframes` → `slideshow` למצגת HyperFrames עם מצב מרצה וניווט מסתעף; וב־`hyperframes-animation` למושן. `cinematic-slides` הוא כיוון אופציונלי לרקע קולנועי, ולא הרשאה ליצור וידאו בתשלום או לפרסם.

הסקיל הזה כולל גם תבנית אינטראקטיבית עצמאית ומתכוני עיצוב ומושן, כדי לעבוד אצל חבר בלי התקנת כל הסקילים האחרים. קראו [authoring-and-motion.md](references/authoring-and-motion.md) לפני יצירת HTML חדש. למצגת HyperFrames השתמשו במקור הקומפוזיציה וב־export hook; אין צורך לייצא סרטון לינארי.

## בחירת היצוא לפי הדרישה

| מצב | מה מתקבל |
|---|---|
| `image` | צילום נפרד ברזולוציה גבוהה לכל שקופית. מתאים כשאותו מראה הוא הדרישה הראשית. הטקסט והגרפיקה אינם אלמנטים נפרדים לעריכה |
| `hybrid` | עיצוב דפדפן כרקע וטקסט רגיל כאובייקטים ניתנים לעריכה. מתאים לעיצוב מורכב. טבלאות וצורות ברקע אינן מובטחות כאובייקטים נפרדים |
| `editable` | טקסט, צורות בסיסיות, טבלאות פשוטות ותמונות כאובייקטים נפרדים. אפקטים לא נתמכים נשמרים כתמונה ומפורטים בדוח |

כשנדרשים גם מראה נאמן וגם עריכה, מסרו שני קבצים: גרסת `image` נאמנה למקור וגרסת `editable` או `hybrid` שנבדקה. אל תטענו שכל HTML ניתן להמרה זהה וגם מלאה לעריכה. `--require-editable` במצב `editable` חוסם המרה כשנדרש צילום של אפקט או טקסט. תמונות מקור יכולות להישאר תמונות נפרדות.

RTL אינו רק יישור לימין: השאירו עברית בסדר לוגי, `dir="rtl"` ברמת המסמך ואיי English/מספרים ב־`bdi` או `dir="ltr"`. היצוא מודד מקטעים חזותיים בדפדפן ושומר כיוון בכל תיבת טקסט. מקטעים מעורבים עשויים להפוך לכמה תיבות. פונטים במחשב היעד חייבים להתאים; אין להפיץ פונטים מסחריים בלי רישיון.

## הפעלה

הריצו מהתיקייה שבה נמצא `SKILL.md`. להתקנה ראשונה קראו [SETUP.md](SETUP.md).

```bash
node scripts/init-deck.cjs my-presentation
node scripts/html-to-pptx.js my-presentation/index.html faithful.pptx --mode=image --rtl
node scripts/html-to-pptx.js my-presentation/index.html editable.pptx --mode=editable --rtl
```

הפקודה יוצרת גם דוח `.report.json` ותיקיית `.proof` עם מקור PNG לכל שקופית. קבצים קיימים אינם נדרסים בלי `--overwrite`. נשמרות הערות מרצה; ניווט וחשיפות נשארים ב־HTML. `--fragments=steps` מייצא מצב התחלתי ועוד שקופית לכל חשיפה, כשהמקור מספק hook מתאים. מעבר Fade בסיסי ב־PowerPoint מופעל כברירת מחדל; `--transition=none` מבטל אותו.

```bash
node scripts/html-to-pptx.js my-presentation/index.html reveals.pptx --mode=image --rtl --fragments=steps
node scripts/html-to-pptx.js simple.html strict.pptx --mode=editable --rtl --require-editable
npm test
```

קראו [export-contract.md](references/export-contract.md) כשממירים מקור קיים או משלבים GSAP, canvas, וידאו, HyperFrames או JavaScript דינמי.

## בדיקה ומסירה

בדקו את המצגת בדפדפן: ניווט מקלדת, חשיפות, הסתעפות, הערות, מסך קטן ו־reduced motion. לאחר היצוא קראו את הדוח והשוו את כל שקופיות PowerPoint למקור שב־`.proof`, במיוחד תוכן מעורב, תבליטים, טבלאות וגרפיקה. ב־Windows עם PowerPoint מותקן:

```powershell
./scripts/verify-powerpoint.ps1 -Pptx faithful.pptx -OutputDir office-proof
```

התאמת תמונות ומבנה PPTX אינה הוכחה שכל האנימציות עברו. אנימציות CSS/GSAP, אינטראקציות, WebGL ומדיה נשארות ב־HTML; ב־PPTX נשמרים מצבי יצוא מוגדרים ומעבר Fade. אל תמציאו שקילות בין שני המנועים. במסירה ציינו אילו קבצים ניתנים לעריכה ואילו אלמנטים נשארו כתמונה. אין לפרסם, לשלוח או לצרוך קרדיטים ללא הרשאה למשימה.
