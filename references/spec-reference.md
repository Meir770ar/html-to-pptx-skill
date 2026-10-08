# מדריך ה־spec: כל הפריסות, השדות והאפשרויות

קובץ `deck.json` אחד מתאר את כל המצגת. התוכן הוא שלכם; הפריסה, הטיפוגרפיה, הצבעים והתנועה מגיעים ממערכת העיצוב. שדות לא מוכרים נדחים בשגיאה שמציינת את מספר השקופית, ולכן שגיאת כתיב לא עוברת בשקט.

```bash
node scripts/make-deck.cjs deck.json out/ --overwrite
```

## מבנה עליון

| שדה | חובה | הסבר |
|---|---|---|
| `title` | כן | שם המצגת (כותרת המסמך ו־PPTX) |
| `theme` | לא | אחת מערכות הנושא שלמטה. ברירת מחדל: `editorial` |
| `lang` | לא | `he` (ברירת מחדל, RTL) או `en`/`fr`/`es`/`de`/`ru` (LTR) |
| `brand` | לא | שם המותג/המרצה. מופיע בתחתית כל שקופית ובפתיחה |
| `author` | לא | נכנס למטא־דאטה של הקובץ |
| `palette` | לא | צבעי מותג: `{ "accent": "#...", "accent2": "#...", "bg": "#...", "ink": "#..." }`. הניגודיות מתוקנת אוטומטית |
| `fonts` | לא | `{ "title": "שם פונט", "body": "שם פונט" }` להחלפת הפונטים של הערכה |
| `fontFiles` | לא | קבצי פונט מורשים שברשות המשתמש: `[{ "family": "...", "file": "fonts/x.woff2", "weight": "400" }]` |
| `chrome` | לא | `false` מסיר את הכותרת התחתונה (מותג + מספר עמוד) מכל המצגת |
| `slides` | כן | רשימת השקופיות |

## שדות משותפים לכל שקופית

`layout` (חובה), `notes` (הערות מרצה, מומלץ בכל שקופית; נכנסות להערות PowerPoint), `tone` (`base`, `alt`, `accent`, `deep`: צבע הרקע; לכל פריסה יש ברירת מחדל טובה), `fragments` (`true` חושף את הפריטים אחד אחד בהצגה), `id`.

סימון בטקסט: `*מילה*` מדגיש בצבע הערכה. אנגלית, תאריכים ושעות נעטפים אוטומטית כך שהסדר נשמר בעברית. `\n` שובר שורה (כמעט אף פעם לא צריך; הכותרות מתאזנות לבד).

## הפריסות

כוכבית (*) מסמנת שדה חובה.

### `cover` פתיחה
`title*`, `subtitle`, `kicker`, `meta`, תמונה (`image` + `alt`) או `art`. בלי תמונה נוצרת אמנות גיאומטרית.

### `agenda` תוכן עניינים
`title*`, `items*` (3–7 מחרוזות, או `{ "title", "text" }`), `kicker`.

### `section` מפריד פרק
`title*`, `subtitle`, `number` (אוטומטי אם לא ניתן). רקע מודגש ומספר ענק.

### `statement` משפט אחד
`text*` (עד 18 מילים; `*הדגשה*`), `source`, `kicker`. רקע כהה.

### `points` כרטיסים
`title*`, `items*` (2–6; כל אחד `{ "icon", "title"*, "text" }`), `kicker`, `lead`. עם אייקונים או בלי (אז מספרים 01, 02...). 2–3 פריטים: כרטיסים אנכיים; 4–6: כרטיסים אופקיים.

### `bignumber` מספר ענק
`value*`, `label*`, `unit`, `unitBefore`, `text`, `kicker`, `title`. יחידת סמל (`%`, `₪`, `x`) נשארת צמודה למספר בסדר הנכון; יחידה בעברית (`שעות`) מוצגת קטנה לצד המספר. המספר עולה בהדרגה בהצגה.

### `stats` מדדים
`title*`, `items*` (2–4; `{ "value"*, "unit", "unitBefore", "label"* }`), `kicker`, `lead`, `source`.

### `compare` השוואה
`title*`, `sides*` (בדיוק 2; `{ "heading"*, "items"* }` עד 5 שורות בכל צד), `kicker`, `lead`. הצד השני (בצד שמאל, כיוון הקריאה) מודגש כיעד.

### `steps` תהליך
`title*`, `items*` (3–5; `{ "label", "title"*, "text" }`), `kicker`, `lead`. קו מחבר ומספרים.

### `chart` גרף
`title*`, `items*` (`{ "label"*, "value"*, "display" }`, פסים עד 8, עמודות עד 7), `type` (`bars` או `columns`), `unit`, `unitBefore`, `highlight` (מספר פריט, `max` או `none`), `takeaway` (משפט מסקנה), `max`, `source`, `kicker`, `lead`. הגרף בנוי מצורות Office ולכן ניתן לעריכה.

### `quote` ציטוט
`text*`, `author*`, `role`, `image` + `alt` (דיוקן).

### `image` תמונה במסך מלא
`image*`, `alt*`, `title`, `caption`.

### `split` חצי וחצי
`title*`, `kicker`, `text`, `bullets` (עד 4), `image` + `alt` או `art`, `imageSide` (`start` = בצד ההתחלה של הקריאה, או `end`).

### `gallery` גלריה
`title*`, `items*` (2–4; `{ "image"*, "alt"*, "caption" }`), `kicker`, `lead`.

### `table` טבלה
`title*`, `columns*` (2–6), `rows*` (1–8 שורות באורך העמודות), `kicker`, `lead`. טבלת Office אמיתית. תאים הם טקסט פשוט בלבד. תאי מספר/מטבע (`₪400`) נשמרים בסדר קבוע.

### `closing` סיום
`title*`, `subtitle`, `action`, `contacts` (עד 3: `{ "label", "value" }`), `image` + `alt` או `art`, `kicker`.

### `custom` מוצא חירום
`html*`, `title`. HTML חופשי בתוך השקופית, עם המחלקות של המערכת (`title`, `card`, `chip`, `li`, `dot`, `kicker`). הבדיקה האוטומטית חלה גם עליו. אל תשתמשו בו כשפריסה קיימת מתאימה.

## ערכות נושא

| ערכה | מתאימה ל | פונטים |
|---|---|---|
| `editorial` | סיפור, הרצאה, תוכן, חינוך, מותג אישי | Frank Ruhl Libre + Heebo |
| `midnight` | טכנולוגיה, AI, סטארטאפ, מוצר, כנס | Heebo |
| `bold` | שיווק, השקה, מכירות, אנרגיה גבוהה | Secular One + Heebo |
| `corporate` | משרד, פיננסים, דוחות, הצעות מחיר | Rubik |
| `sage` | בריאות, חינוך, קהילה, עמותות | Frank Ruhl Libre + Rubik |
| `noir` | יוקרה, אירוע, התרמה, נאום חגיגי | Frank Ruhl Libre + Heebo |

הפונטים (רישיון SIL OFL) כלולים. לשימוש בפונט מורשה אחר: `fonts` ו־`fontFiles` ב־spec. ב־PowerPoint, הפונט חייב להיות מותקן במחשב שפותח את `deck.pptx`.

## אמנות גנרטיבית

`art`: `bauhaus` (גיאומטריה נועזת), `rings` (עיגולים קונצנטריים), `waves` (גלים). `artSeed` משנה את הקומפוזיציה. מופיעה בפתיחה, פיצול וסיום כשאין תמונה.

## אייקונים

`check`, `target`, `bolt`, `users`, `user`, `chart`, `trend`, `shield`, `clock`, `heart`, `star`, `bulb`, `rocket`, `globe`, `book`, `coin`, `lock`, `gear`, `chat`, `calendar`, `flag`, `mail`, `phone`, `pin`, `eye`, `puzzle`, `layers`, `camera`, `play`, `home`, `tools`, `link`, `arrow`, `plus`, `warning`, `sparkle`.

## דוגמה מלאה

[`examples/demo.json`](../examples/demo.json) מציג 15 שקופיות בכל סוגי הפריסות. העתיקו ממנו.
