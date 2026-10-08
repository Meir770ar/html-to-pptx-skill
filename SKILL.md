---
name: html-to-pptx
description: Create professional presentations (Hebrew RTL or English) from a short JSON spec. Designed themes, 17 layouts, real charts and tables, motion, speaker notes, an automatic design lint, then export to editable PowerPoint (PPTX) plus an image-faithful PPTX. Also redesigns an existing PPTX with locked content and converts any HTML deck to PPTX. Use for any request to make, improve, redesign or convert a presentation, slides, deck, מצגת, פיירפוינט, שקפים.
---

# מצגות מקצועיות: מ־spec אחד ל־HTML אינטראקטיבי ול־PowerPoint

הידע העיצובי נמצא בקוד, לא בהוראות. כותבים רק את התוכן (קובץ JSON), ומערכת העיצוב מפיקה שקופיות עם טיפוגרפיה עברית, ערכות צבע בדוקות ניגודיות, 17 פריסות, גרפים וטבלאות אמיתיים, אמנות גנרטיבית ותנועה. בדיקת איכות אוטומטית עוצרת חיתוך, חפיפה, טקסט זעיר, ניגודיות נמוכה וקירות טקסט לפני שהקובץ נמסר.

## הכנה (פעם אחת)

הריצו מהתיקייה שבה נמצא `SKILL.md`. אם אין `node_modules`: `npm ci` (Node 22.13 ומעלה ו־Chrome/Edge). פרטים ב־[SETUP.md](SETUP.md).

## תהליך העבודה

1. **הבינו את המשימה.** קהל, מטרה, אורך, שפה, אווירה, מותג או צבעים קיימים, ותמונות שיש למשתמש. שאלו שאלה אחת קצרה רק אם חסר פרט שמשנה את התוצאה; אחרת קבעו הנחה וציינו אותה בסיום.
2. **תכננו את הסיפור לפני העיצוב.** קראו את [design-principles.md](references/design-principles.md): כותרות הן טענות, רעיון אחד לשקופית, תקציב מילים, קצב ומפרידים. כתבו את התוכן האמיתי ואת הערות המרצה. אין טקסטי מילוי ואין נתונים מומצאים בלי סימון "נתון להמחשה".
3. **בחרו ערכת נושא ופריסות.** טבלת הערכות ורשימת הפריסות והשדות ב־[spec-reference.md](references/spec-reference.md). שנו פריסה כל שקופית או שתיים. צבעי מותג: `palette`. פונט מורשה של המשתמש: `fonts` + `fontFiles`.
4. **כתבו את `deck.json`** (התחילו מ־[examples/demo.json](examples/demo.json)). תמונות הן נתיבים יחסיים לקובץ ה־JSON, ותמיד עם `alt`.
5. **הריצו את הצינור:**

```bash
node scripts/make-deck.cjs deck.json out/ --overwrite --powerpoint
```

   הפקודה בונה את המצגת, מריצה את בדיקת העיצוב, ואם אין שגיאות מייצאת `out/export/deck.pptx` (ניתן לעריכה), `deck-faithful.pptx` (תמונות, נאמן ב־100%) ותיקיית `fonts-to-install`. הדגל `--powerpoint` (Windows עם PowerPoint) מרנדר את הקבצים ב־PowerPoint עצמו, והוא ההוכחה הטובה ביותר למראה שהמשתמש יראה. ללא PowerPoint השמיטו אותו.
6. **תקנו עד שנקי.** הפלט מפרט שגיאות (`ERROR`) ואזהרות לפי מספר שקופית. תקנו ב־spec והריצו שוב. שגיאה חוסמת את הייצוא. אזהרות: תקנו כל מה שאפשר, והסבירו בסיום מה השארתם ולמה.
7. **הסתכלו בעיניים.** פתחו `out/proof/contact-sheet.png` (כל המצגת בתמונה אחת) ואחר כך כל שקופית ב־`out/proof/slide-NN.png`, ואם הרצתם `--powerpoint`, גם `out/export/powerpoint-editable/contact-sheet.png`. הבדיקה האוטומטית אינה מחליפה עין: חפשו שורה אחרונה עם מילה בודדת, ריקנות לא מאוזנת, תמונה שנחתכה בצורה לא טובה, רצף משעמם. תקנו והריצו שוב. עצרו אחרי שלושה סבבים.
8. **מסרו.** ציינו איזה קובץ מתאים למה, והתקנת פונטים (ראו למטה).

## כללי איכות שלא מדלגים עליהם

- לא מסירים קובץ אחרי שגיאת lint או בלי שראיתם את `contact-sheet.png`.
- לא ממציאים נתונים, ציטוטים או לוגואים. נתון להמחשה מסומן כך על השקופית.
- לא משנים את קובצי המערכת (CSS, פריסות) כדי "לסדר" שקופית אחת. מסדרים את התוכן. הפריסה `custom` היא מוצא אחרון.
- לא מפרסמים, שולחים או מעלים בלי הרשאה למשימה.

## מה למסור ואיך להסביר

| קובץ | מתאים ל | הערה |
|---|---|---|
| `out/index.html` | הצגה בדפדפן עם תנועה, חשיפות, מצב מרצה (N), מסך מלא (F) | הקובץ המלא. אנימציות קיימות רק כאן |
| `export/deck.pptx` | עריכה ב־PowerPoint: טקסט, צורות, טבלאות וגרפים אמיתיים | הפונטים חייבים להיות מותקנים (ראו למטה). אייקונים ואמנות הם תמונות |
| `export/deck-faithful.pptx` | שליחה והצגה בלי לגעת | כל שקופית היא תמונה, לא ניתנת לעריכה, לא צריכה פונטים |

**פונטים.** הפונטים בערכות הם קוד פתוח וכלולים בחבילה. כדי ש־`deck.pptx` ייראה כמו ה־HTML, יש להתקין אותם במחשב שפותח אותו: לחיצה כפולה על הקבצים ב־`export/fonts-to-install` ואז "התקן", או `node scripts/install-fonts.cjs` (למשתמש הנוכחי בלבד; `--uninstall` מסיר). הריצו את ההתקנה רק באישור המשתמש. בלי הפונטים PowerPoint מחליף בפונט אחר והפריסה זזה. אנימציות ה־HTML אינן מתורגמות ל־PowerPoint; נשמר מעבר Fade. הערות מרצה נשמרות.

## מקרים אחרים

- **מצגת PPTX קיימת לשדרג עיצוב בלי לגעת בתוכן:** [redesign-existing.md](references/redesign-existing.md). `redesign-pptx.cjs inspect | apply | verify`.
- **שפה עיצובית מאתר, ספר או PDF:** [reference-design-language.md](references/reference-design-language.md).
- **HTML קיים להמיר ל־PPTX:** `node scripts/html-to-pptx.js file.html out.pptx --mode=editable --rtl` (חוזה הייצוא ב־[export-contract.md](references/export-contract.md)). `--mode=image` לנאמנות מלאה, `--mode=hybrid` לעיצוב מורכב עם טקסט ניתן לעריכה.
- **מצגת HTML בכתב יד מלא (בלי ה־spec):** התבנית הישנה `node scripts/init-deck.cjs NAME` ו־[authoring-and-motion.md](references/authoring-and-motion.md). רק כשהפריסות של המערכת באמת לא מספיקות.
- **בדיקת עיצוב של HTML קיים:** `node scripts/lint-deck.cjs path/index.html` (שקופיות מסומנות `data-pptx-slide`).
- **תוכן קיים שחייב להישאר זהה:** `node scripts/content-lock.cjs verify before.html after.html`.

## פקודות

```bash
node scripts/make-deck.cjs deck.json out/ --overwrite --powerpoint   # הכול: בנייה, בדיקה, ייצוא, רינדור
node scripts/build-deck.cjs deck.json out/ --overwrite               # רק בנייה
node scripts/lint-deck.cjs out/index.html                            # רק בדיקת עיצוב + גיליון תצוגה
node scripts/install-fonts.cjs [--dry-run|--uninstall]               # פונטים למשתמש הנוכחי
npm test
```

דגלים של `make-deck`: `--force` (ייצוא למרות שגיאות lint; רק כשהמשתמש מבקש במפורש), `--no-export`, `--powerpoint`.
