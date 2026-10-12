from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="student")  # student | author
    created_at = Column(DateTime, default=datetime.utcnow)


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    cover_image = Column(String(1000), default="")
    price = Column(Float, default=0)
    is_published = Column(Boolean, default=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    author = relationship("User")
    modules = relationship("Module", cascade="all, delete-orphan", order_by="Module.order_index")
    enrollments = relationship("Enrollment", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0)
    items = relationship("Item", cascade="all, delete-orphan", order_by="Item.order_index")


class Item(Base):
    """Элемент модуля: lesson (урок), video (видео), test (тест)"""
    __tablename__ = "items"
    id = Column(Integer, primary_key=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False)
    type = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, default="")
    video_url = Column(String(1000), default="")
    pass_score = Column(Integer, default=70)
    order_index = Column(Integer, default=0)
    questions = relationship("Question", cascade="all, delete-orphan", order_by="Question.order_index")
    progress = relationship("ItemProgress", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    correct_index = Column(Integer, nullable=False)
    order_index = Column(Integer, default=0)


class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)
    user = relationship("User")


class ItemProgress(Base):
    __tablename__ = "item_progress"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    is_completed = Column(Boolean, default=False)
    score = Column(Integer, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "item_id"),)
