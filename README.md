# Atlas — платформа онлайн-обучения

Курсовой проект. **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL (локально — SQLite).
**Frontend:** чистый HTML/CSS/JS (SPA с hash-роутингом, без сборки) — папка `docs/`.

## Роли
- **Студент** — проходит курсы, прогресс считается автоматически (% пройденных уроков/видео/тестов).
- **Автор** — создаёт, редактирует и удаляет свои курсы, видит статистику.
Роль выбирается при регистрации.

Демо-аккаунты (создаются автоматически): `student@atlas.dev / student123`, `author@atlas.dev / author123`.

## Локальный запуск
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload                        # http://localhost:8000/docs
```
Фронтенд: в другом терминале
```bash
cd docs && python -m http.server 5500                # http://localhost:5500
```
Адрес API задаётся в `docs/config.js` (по умолчанию `http://localhost:8000`).
Без `DATABASE_URL` используется файл `backend/atlas.db` (SQLite).

## Деплой (бесплатно)
1. Залейте проект на GitHub.
2. **Render:** New → Blueprint → выберите репозиторий (файл `render.yaml` создаст web-сервис и PostgreSQL).
   Либо вручную: Web Service, Root Directory `backend`, Build `pip install -r requirements.txt`,
   Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, переменные `DATABASE_URL`, `SECRET_KEY`.
3. Скопируйте URL сервиса (например `https://atlas-api.onrender.com`) в `docs/config.js`, закоммитьте.
4. **GitHub Pages:** Settings → Pages → Branch `main`, папка `/docs`.
5. (Рекомендуется) в Render задайте `CORS_ORIGINS=https://<user>.github.io`.

Заметки: бесплатный web-сервис Render засыпает через 15 мин (первый запрос ~30 сек).
Бесплатная PostgreSQL на Render живёт ограниченное время (около 30 дней) — для долгой защиты можно взять
бесплатную БД на Neon/Supabase и вставить её строку в `DATABASE_URL`.

## Структура
```
backend/app/  main.py (API) · models.py · database.py · security.py · seed.py
docs/         index.html · config.js · css/style.css · js/app.js
render.yaml
```
## Основные эндпоинты
`POST /api/auth/register|login` · `GET /api/courses?q=&filter=all|in_progress|completed|mine` ·
`GET /api/courses/popular` · `GET /api/courses/{id}` · `POST /api/courses/{id}/enroll` ·
`GET /api/items/{id}` · `POST /api/items/{id}/complete|submit` · `/api/author/...` (CRUD курсов, модулей, элементов, reorder, publish, stats).
Полная документация Swagger — `/docs`.
