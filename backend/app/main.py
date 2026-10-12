import os
from datetime import datetime
from typing import List, Literal, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .database import Base, engine, SessionLocal
from .models import *
from .security import hash_password, verify_password, create_token, decode_token
from .seed import seed


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Atlas API", lifespan=lifespan)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


# ---------- зависимости ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    uid = decode_token(authorization[7:])
    return db.get(User, uid) if uid else None


def require_user(user=Depends(get_user)):
    if not user:
        raise HTTPException(401, "Требуется авторизация")
    return user


def require_author(user=Depends(require_user)):
    if user.role != "author":
        raise HTTPException(403, "Только для авторов")
    return user


# ---------- схемы ----------
class RegisterIn(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)
    role: Literal["student", "author"] = "student"


class LoginIn(BaseModel):
    email: str
    password: str


class CourseIn(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    cover_image: str = ""
    price: float = Field(0, ge=0)


class ModuleIn(BaseModel):
    title: str = Field(min_length=1)


class QuestionIn(BaseModel):
    text: str = Field(min_length=1)
    options: List[str]
    correct: int


class ItemIn(BaseModel):
    title: str = Field(min_length=1)
    type: Literal["lesson", "video", "test"] = "lesson"
    content: str = ""
    video_url: str = ""
    pass_score: int = Field(70, ge=0, le=100)
    questions: List[QuestionIn] = []


class IdsIn(BaseModel):
    ids: List[int]


class PublishIn(BaseModel):
    published: bool


class AnswersIn(BaseModel):
    answers: List[int]


# ---------- хелперы ----------
def user_dict(u):
    return dict(id=u.id, email=u.email, full_name=u.full_name, role=u.role)


def course_items(c):
    return [i for m in c.modules for i in m.items]


def progress_of(db, c, uid):
    ids = [i.id for i in course_items(c)]
    if not ids or not uid:
        return 0, set()
    done = {r.item_id for r in db.query(ItemProgress).filter(
        ItemProgress.user_id == uid, ItemProgress.item_id.in_(ids), ItemProgress.is_completed == True)}  # noqa
    return round(len(done) / len(ids) * 100), done


def card(db, c, user):
    pct, _ = progress_of(db, c, user.id if user else None)
    enrolled = bool(user and db.query(Enrollment).filter_by(user_id=user.id, course_id=c.id).first())
    return dict(
        id=c.id, title=c.title, description=c.description, cover_image=c.cover_image, price=c.price,
        is_published=c.is_published, author_id=c.author_id, author_name=c.author.full_name,
        created_at=c.created_at.isoformat(), modules_count=len(c.modules), items_count=len(course_items(c)),
        students_count=len(c.enrollments), progress=pct, enrolled=enrolled,
        is_owner=bool(user and user.id == c.author_id))


def item_brief(i, done=None):
    d = dict(id=i.id, type=i.type, title=i.title, questions_count=len(i.questions))
    if done is not None:
        d["completed"] = i.id in done
    return d


def can_view(c, user):
    return c.is_published or (user and user.id == c.author_id)


def get_course_or_404(db, cid):
    c = db.get(Course, cid)
    if not c:
        raise HTTPException(404, "Курс не найден")
    return c


def own_course(db, cid, user):
    c = get_course_or_404(db, cid)
    if c.author_id != user.id:
        raise HTTPException(403, "Это не ваш курс")
    return c


def own_module(db, mid, user):
    m = db.get(Module, mid)
    if not m:
        raise HTTPException(404, "Модуль не найден")
    own_course(db, m.course_id, user)
    return m


def own_item(db, iid, user):
    i = db.get(Item, iid)
    if not i:
        raise HTTPException(404, "Элемент не найден")
    own_module(db, i.module_id, user)
    return i


def fill_item(it, data: ItemIn):
    it.title = data.title.strip()
    it.content = data.content
    it.video_url = data.video_url.strip()
    it.pass_score = data.pass_score
    if it.type == "test":
        for qn in data.questions:
            opts = [o.strip() for o in qn.options if o.strip()]
            if len(opts) < 2 or not (0 <= qn.correct < len(qn.options)):
                raise HTTPException(422, "В каждом вопросе нужно минимум 2 варианта и один правильный")
        it.questions = []
        for k, qn in enumerate(data.questions):
            it.questions.append(Question(text=qn.text, options=qn.options, correct_index=qn.correct, order_index=k))


def reorder(rows, ids):
    by_id = {r.id: r for r in rows}
    if set(ids) != set(by_id):
        raise HTTPException(422, "Неверный список идентификаторов")
    for idx, i in enumerate(ids):
        by_id[i].order_index = idx


# ---------- auth ----------
@app.get("/")
def root():
    return {"app": "Atlas API", "docs": "/docs"}


@app.post("/api/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Некорректный email")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Пользователь с таким email уже существует")
    u = User(email=email, hashed_password=hash_password(data.password), full_name=data.full_name.strip(), role=data.role)
    db.add(u)
    db.commit()
    return dict(token=create_token(u.id), user=user_dict(u))


@app.post("/api/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if not u or not verify_password(data.password, u.hashed_password):
        raise HTTPException(401, "Неверный email или пароль")
    return dict(token=create_token(u.id), user=user_dict(u))


@app.get("/api/me")
def me(user=Depends(require_user)):
    return user_dict(user)


# ---------- курсы (публичная часть) ----------
@app.get("/api/courses/popular")
def popular(db: Session = Depends(get_db), user=Depends(get_user)):
    rows = (db.query(Course).outerjoin(Enrollment).filter(Course.is_published == True)  # noqa
            .group_by(Course.id).order_by(func.count(Enrollment.id).desc(), Course.created_at.desc()).limit(3).all())
    return [card(db, c, user) for c in rows]


@app.get("/api/courses")
def list_courses(q: str = "", filter: str = "all", db: Session = Depends(get_db), user=Depends(require_user)):
    qs = db.query(Course)
    if filter == "mine":
        if user.role != "author":
            raise HTTPException(403, "Только для авторов")
        qs = qs.filter(Course.author_id == user.id)
    else:
        qs = qs.filter(Course.is_published == True)  # noqa
    if q.strip():
        qs = qs.filter(Course.title.ilike(f"%{q.strip()}%"))
    res = [card(db, c, user) for c in qs.order_by(Course.created_at.desc()).all()]
    if filter == "completed":
        res = [c for c in res if c["progress"] == 100]
    elif filter == "in_progress":
        res = [c for c in res if c["enrolled"] and 0 < c["progress"] < 100]
    return res


@app.get("/api/courses/{cid}")
def course_detail(cid: int, db: Session = Depends(get_db), user=Depends(require_user)):
    c = get_course_or_404(db, cid)
    if not can_view(c, user):
        raise HTTPException(404, "Курс не найден")
    pct, done = progress_of(db, c, user.id)
    d = card(db, c, user)
    d["modules"] = [dict(id=m.id, title=m.title, items=[item_brief(i, done) for i in m.items]) for m in c.modules]
    return d


@app.post("/api/courses/{cid}/enroll")
def enroll(cid: int, db: Session = Depends(get_db), user=Depends(require_user)):
    c = get_course_or_404(db, cid)
    if not c.is_published:
        raise HTTPException(400, "Курс не опубликован")
    if not db.query(Enrollment).filter_by(user_id=user.id, course_id=cid).first():
        db.add(Enrollment(user_id=user.id, course_id=cid))
        db.commit()
    return {"ok": True}


# ---------- прохождение ----------
def access_item(db, iid, user):
    it = db.get(Item, iid)
    if not it:
        raise HTTPException(404, "Элемент не найден")
    c = db.get(Module, it.module_id).course_id
    course = db.get(Course, c)
    owner = course.author_id == user.id
    if not owner and not db.query(Enrollment).filter_by(user_id=user.id, course_id=c).first():
        raise HTTPException(403, "Сначала начните курс")
    return it, course, owner


@app.get("/api/items/{iid}")
def get_item(iid: int, db: Session = Depends(get_db), user=Depends(require_user)):
    it, course, _ = access_item(db, iid, user)
    pr = db.query(ItemProgress).filter_by(user_id=user.id, item_id=iid).first()
    d = item_brief(it)
    d.update(course_id=course.id, content=it.content, video_url=it.video_url, pass_score=it.pass_score,
             completed=bool(pr and pr.is_completed), score=pr.score if pr else None,
             questions=[dict(id=x.id, text=x.text, options=x.options) for x in it.questions])
    return d


def mark_done(db, user, it, score=None):
    pr = db.query(ItemProgress).filter_by(user_id=user.id, item_id=it.id).first()
    if not pr:
        pr = ItemProgress(user_id=user.id, item_id=it.id)
        db.add(pr)
    pr.is_completed = True
    pr.completed_at = datetime.utcnow()
    if score is not None:
        pr.score = score
    db.commit()


@app.post("/api/items/{iid}/complete")
def complete(iid: int, db: Session = Depends(get_db), user=Depends(require_user)):
    it, course, _ = access_item(db, iid, user)
    if it.type == "test":
        raise HTTPException(400, "Тест засчитывается после сдачи")
    mark_done(db, user, it)
    return {"progress": progress_of(db, course, user.id)[0]}


@app.post("/api/items/{iid}/submit")
def submit_test(iid: int, data: AnswersIn, db: Session = Depends(get_db), user=Depends(require_user)):
    it, course, _ = access_item(db, iid, user)
    if it.type != "test" or not it.questions:
        raise HTTPException(400, "Это не тест")
    results = [i < len(data.answers) and data.answers[i] == qn.correct_index for i, qn in enumerate(it.questions)]
    score = round(sum(results) / len(results) * 100)
    passed = score >= it.pass_score
    if passed:
        mark_done(db, user, it, score)
    else:
        pr = db.query(ItemProgress).filter_by(user_id=user.id, item_id=it.id).first()
        if not pr:
            db.add(ItemProgress(user_id=user.id, item_id=it.id, is_completed=False, score=score))
        elif not pr.is_completed:
            pr.score = score
        db.commit()
    return dict(score=score, passed=passed, results=results, pass_score=it.pass_score,
                progress=progress_of(db, course, user.id)[0])


# ---------- автор ----------
@app.post("/api/author/courses")
def create_course(data: CourseIn, db: Session = Depends(get_db), user=Depends(require_author)):
    c = Course(title=data.title.strip(), description=data.description, cover_image=data.cover_image,
               price=data.price, author_id=user.id)
    db.add(c)
    db.commit()
    return card(db, c, user)


@app.put("/api/author/courses/{cid}")
def update_course(cid: int, data: CourseIn, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    c.title, c.description, c.cover_image, c.price = data.title.strip(), data.description, data.cover_image, data.price
    db.commit()
    return card(db, c, user)


@app.delete("/api/author/courses/{cid}")
def delete_course(cid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    db.delete(own_course(db, cid, user))
    db.commit()
    return {"ok": True}


@app.post("/api/author/courses/{cid}/publish")
def publish(cid: int, data: PublishIn, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    if data.published and not course_items(c):
        raise HTTPException(400, "Добавьте хотя бы один урок, видео или тест перед публикацией")
    c.is_published = data.published
    db.commit()
    return card(db, c, user)


@app.get("/api/author/courses/{cid}")
def author_course(cid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    d = card(db, c, user)
    d["modules"] = [dict(id=m.id, title=m.title, items=[item_brief(i) for i in m.items]) for m in c.modules]
    return d


@app.post("/api/author/courses/{cid}/modules")
def add_module(cid: int, data: ModuleIn, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    m = Module(course_id=cid, title=data.title.strip(), order_index=len(c.modules))
    db.add(m)
    db.commit()
    return {"id": m.id}


@app.post("/api/author/courses/{cid}/modules/reorder")
def reorder_modules(cid: int, data: IdsIn, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    reorder(c.modules, data.ids)
    db.commit()
    return {"ok": True}


@app.put("/api/author/modules/{mid}")
def rename_module(mid: int, data: ModuleIn, db: Session = Depends(get_db), user=Depends(require_author)):
    m = own_module(db, mid, user)
    m.title = data.title.strip()
    db.commit()
    return {"ok": True}


@app.delete("/api/author/modules/{mid}")
def delete_module(mid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    db.delete(own_module(db, mid, user))
    db.commit()
    return {"ok": True}


@app.post("/api/author/modules/{mid}/items")
def add_item(mid: int, data: ItemIn, db: Session = Depends(get_db), user=Depends(require_author)):
    m = own_module(db, mid, user)
    it = Item(module_id=mid, type=data.type, title=data.title, order_index=len(m.items))
    fill_item(it, data)
    db.add(it)
    db.commit()
    return {"id": it.id}


@app.post("/api/author/modules/{mid}/items/reorder")
def reorder_items(mid: int, data: IdsIn, db: Session = Depends(get_db), user=Depends(require_author)):
    m = own_module(db, mid, user)
    reorder(m.items, data.ids)
    db.commit()
    return {"ok": True}


@app.get("/api/author/items/{iid}")
def author_item(iid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    it = own_item(db, iid, user)
    d = item_brief(it)
    d.update(content=it.content, video_url=it.video_url, pass_score=it.pass_score,
             questions=[dict(text=x.text, options=x.options, correct=x.correct_index) for x in it.questions])
    return d


@app.put("/api/author/items/{iid}")
def update_item(iid: int, data: ItemIn, db: Session = Depends(get_db), user=Depends(require_author)):
    it = own_item(db, iid, user)
    fill_item(it, data)
    db.commit()
    return {"ok": True}


@app.delete("/api/author/items/{iid}")
def delete_item(iid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    db.delete(own_item(db, iid, user))
    db.commit()
    return {"ok": True}


@app.get("/api/author/courses/{cid}/stats")
def stats(cid: int, db: Session = Depends(get_db), user=Depends(require_author)):
    c = own_course(db, cid, user)
    items = course_items(c)
    ids = [i.id for i in items]
    done_rows = db.query(ItemProgress).filter(ItemProgress.item_id.in_(ids), ItemProgress.is_completed == True).all() if ids else []  # noqa
    per_user = {}
    per_item = {}
    for r in done_rows:
        per_user[r.user_id] = per_user.get(r.user_id, 0) + 1
        per_item[r.item_id] = per_item.get(r.item_id, 0) + 1
    students = []
    for e in c.enrollments:
        n = per_user.get(e.user_id, 0)
        students.append(dict(name=e.user.full_name, email=e.user.email, enrolled_at=e.created_at.isoformat(),
                             done=n, progress=round(n / len(ids) * 100) if ids else 0))
    total = len(students)
    return dict(
        enrolled=total,
        started=sum(1 for s in students if s["progress"] > 0),
        completed=sum(1 for s in students if s["progress"] == 100),
        avg_progress=round(sum(s["progress"] for s in students) / total) if total else 0,
        students=sorted(students, key=lambda s: -s["progress"]),
        items=[dict(id=i.id, title=i.title, type=i.type, done=per_item.get(i.id, 0)) for i in items])
