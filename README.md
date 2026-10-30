# Єдиний реєстр актів начальника КМВА — голови КМДА

Статичний сайт (HTML/CSS/JS) + безкоштовна база **Supabase** (PostgreSQL, вхід за паролем, Row Level Security).
Хостинг — **GitHub Pages** (безкоштовно).

## Структура
```
index.html   стрічка актів, пошук, фільтри, вхід
act.html     перегляд акта, версія для друку (?print=1)
admin.html   створення/редагування акта, візуальний редактор + [HTML]
js/config.js налаштування (ключі Supabase, теми, підпис)
js/app.js    спільна логіка, автоочищення вставки з Word
supabase/schema.sql  таблиці, ролі, політики доступу
```

## Запуск за 6 кроків
1. Створіть проєкт на https://supabase.com (Free).
2. **SQL Editor** → вставте вміст `supabase/schema.sql` → **Run**.
3. **Authentication → Providers → Email**: вимкніть *Allow new users to sign up* (облікові записи створює тільки адміністратор) і за потреби *Confirm email*.
4. **Authentication → Users → Add user**: створіть користувачів. Потім у SQL Editor призначте ролі:
   ```sql
   update public.profiles set role = 'admin'  where full_name = 'admin@example.com';
   update public.profiles set role = 'editor' where full_name = 'kancelariya@example.com';
   ```
   Ролі: `reader` — читання; `editor` — створення/редагування; `admin` — ще й видалення.
5. **Project Settings → API**: скопіюйте *Project URL* і *anon public key* у `js/config.js`.
6. Завантажте папку в репозиторій GitHub → **Settings → Pages → Deploy from a branch → main / (root)**. Сайт буде за адресою `https://<user>.github.io/<repo>/`.

## Безпека
- `anon`-ключ у `config.js` публічний за задумом; **ніколи** не кладіть туди `service_role`.
- Усі дані читаються лише після входу (політики RLS), записувати можуть лише `editor`/`admin`.
- Сторінки GitHub Pages доступні за посиланням усім, але без входу вони показують лише форму входу. Код репозиторію на безкоштовному плані публічний — не зберігайте в ньому секретів.
- Текст актів очищується (DOMPurify) і при збереженні, і при показі.
- Безкоштовний проєкт Supabase «засинає» після ~7 днів без активності — його можна відновити в панелі.

## Налаштування
Назва реєстру, підпис за замовчуванням, види актів та список тематик — у `js/config.js`.
