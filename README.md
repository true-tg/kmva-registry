# Єдиний реєстр актів начальника КМВА — голови КМДА

Структура репозиторію (усі файли мають лежати саме так, у корені репозиторію):

```
index.html
act.html
admin.html
robots.txt
.nojekyll
assets/coa.webp
css/style.css
js/config.js
js/app.js
js/diff.js
supabase/schema.sql                      (довідково; повна установка з нуля)
supabase/migration_amendments.sql        (довідково)
supabase/migration_versions_scheduling.sql (довідково)
```

Типові помилки:
- замість сайту видно текст CSS/коду → вміст одного файлу вставлено в інший (наприклад, style.css у index.html);
- на сторінці акта вічне «Завантаження…» → js/app.js застарілий або лежить не в папці js/.
Рішення: видалити файли в репозиторії й залити весь вміст цього архіву наново.

Налаштування Supabase: див. supabase/schema.sql та інструкції в чаті. Секретний ключ (sb_secret_…) у файли сайту вставляти НЕ можна.
