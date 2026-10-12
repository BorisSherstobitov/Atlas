from datetime import datetime
from .models import *
from .security import hash_password

L, V, T = "lesson", "video", "test"


def q(text, opts, correct):
    return dict(text=text, options=opts, correct=correct)


COURSES = [
    dict(title="Основы информационной безопасности", price=0,
         description="Как защитить себя и свои данные: пароли, фишинг, шифрование и безопасное поведение в сети.",
         modules=[
             ("Введение", [
                 (L, "Что такое информационная безопасность", "# Информационная безопасность\n\nЭто защита **конфиденциальности**, **целостности** и **доступности** данных.\n\n- Конфиденциальность — доступ только у своих\n- Целостность — данные не искажены\n- Доступность — данные доступны, когда нужны"),
                 (V, "Обзор угроз в сети", "https://www.youtube.com/watch?v=inWWhr5tnEA"),
                 (T, "Тест: основы", [q("Что НЕ входит в триаду CIA?", ["Конфиденциальность", "Целостность", "Скорость", "Доступность"], 2),
                                      q("Что такое фишинг?", ["Вид шифрования", "Мошенничество с поддельными сайтами и письмами", "Антивирус"], 1)]),
             ]),
             ("Пароли и аккаунты", [
                 (L, "Надёжные пароли", "# Пароли\n\nНадёжный пароль — **длинный** и уникальный. Используйте менеджер паролей и включайте двухфакторную аутентификацию.\n\n```\ncorrect-horse-battery-staple\n```"),
                 (T, "Тест: пароли", [q("Что важнее для пароля?", ["Длина", "Наличие имени", "Короткая длина"], 0)]),
             ]),
         ]),
    dict(title="Python для начинающих", price=0,
         description="Первый шаг в программировании: переменные, условия, циклы и функции на языке Python.",
         modules=[
             ("Первые шаги", [
                 (L, "Привет, Python", "# Первая программа\n\n```\nprint('Привет, мир!')\n```\n\nФункция `print` выводит текст на экран."),
                 (V, "Установка Python", "https://www.youtube.com/watch?v=rfscVS0vtbw"),
                 (L, "Переменные и типы", "Переменные хранят данные: `x = 5`, `name = 'Анна'`.\n\nОсновные типы: `int`, `float`, `str`, `bool`."),
                 (T, "Тест: основы Python", [q("Какой тип у значения 3.14?", ["int", "float", "str"], 1), q("Как вывести текст?", ["echo()", "print()", "write()"], 1)]),
             ]),
             ("Управляющие конструкции", [
                 (L, "Условия и циклы", "```\nfor i in range(3):\n    if i % 2 == 0:\n        print(i)\n```"),
             ]),
         ]),
    dict(title="Работа с данными и SQL", price=990,
         description="Реляционные базы данных, запросы SELECT/JOIN и проектирование схемы. Платный курс (демо-оплата).",
         modules=[
             ("Основы SQL", [
                 (L, "Таблицы и запросы", "# SELECT\n\n```\nSELECT name FROM users WHERE age > 18;\n```"),
                 (V, "Что такое база данных", "https://www.youtube.com/watch?v=HXV3zeQKqGY"),
                 (T, "Тест: SQL", [q("Какая команда выбирает данные?", ["INSERT", "SELECT", "DROP"], 1)]),
             ]),
         ]),
]


def seed(db):
    if db.query(User).count():
        return
    author = User(email="author@atlas.dev", hashed_password=hash_password("author123"), full_name="Анна Автор", role="author")
    student = User(email="student@atlas.dev", hashed_password=hash_password("student123"), full_name="Иван Студент", role="student")
    extra = [User(email=f"user{i}@atlas.dev", hashed_password=hash_password("user1234"), full_name=n, role="student")
             for i, n in enumerate(["Мария Петрова", "Олег Смирнов", "Дарья Ким"], 1)]
    db.add_all([author, student] + extra)
    db.flush()
    courses = []
    for cd in COURSES:
        c = Course(title=cd["title"], description=cd["description"], price=cd["price"], is_published=True, author_id=author.id)
        for mi, (mt, items) in enumerate(cd["modules"]):
            m = Module(title=mt, order_index=mi)
            for ii, (typ, title, body, *rest) in enumerate(items):
                it = Item(type=typ, title=title, order_index=ii)
                if typ == L:
                    it.content = body
                elif typ == V:
                    it.video_url = body
                else:
                    it.pass_score = 60
                    it.questions = [Question(text=x["text"], options=x["options"], correct_index=x["correct"], order_index=k)
                                    for k, x in enumerate(body)]
                m.items.append(it)
            c.modules.append(m)
        db.add(c)
        courses.append(c)
    db.flush()
    # демо-прогресс
    c1 = courses[0]
    all_items = [i for m in c1.modules for i in m.items]
    for u, n in [(student, 2), (extra[0], len(all_items)), (extra[1], 1), (extra[2], len(all_items))]:
        db.add(Enrollment(user_id=u.id, course_id=c1.id))
        for it in all_items[:n]:
            db.add(ItemProgress(user_id=u.id, item_id=it.id, is_completed=True, completed_at=datetime.utcnow(),
                                score=100 if it.type == T else None))
    db.commit()
