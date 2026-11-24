"""Database access, exact integer units and shared validation."""

import hashlib
import json
import sqlite3
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

CN = timezone(timedelta(hours=8))
TYPES = {"solo": (1, 45), "duo": (2, 60)}
TEACHERS = [
    ("HU", "胡老师", "", 5000),
    ("JIA", "嘉老师", "", 7000),
    ("PENG", "彭老师", "", 5000),
    ("WEN", "文老师", "钢琴", 5000),
]
SCALE = 1000


class Problem(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def require(condition, message, status=400):
    if not condition:
        raise Problem(message, status)


def now():
    return datetime.now(CN).isoformat(timespec="seconds")


def today():
    return now()[:10]


def day(value):
    try:
        parsed = date.fromisoformat(str(value))
        require(parsed.isoformat() == value, "日期格式应为 YYYY-MM-DD")
        return value
    except (ValueError, TypeError):
        raise Problem("日期格式应为 YYYY-MM-DD") from None


def ident(prefix):
    return prefix + "-" + uuid.uuid4().hex[:14]


def dump(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(v):
    return hashlib.sha256(v if isinstance(v, bytes) else dump(v).encode()).hexdigest()


def label(value, name, default=""):
    value = str(value if value is not None else default).strip()
    require(0 < len(value) <= 256, "请填写" + name + "（最多256字）")
    return value


def scaled(value, factor, name, minimum=0):
    try:
        x = Decimal(str(value)) * factor
        require(
            x.is_finite() and minimum <= x <= 10**13 and x == x.to_integral_value(),
            name + "超出精度或范围",
        )
        return int(x)
    except (InvalidOperation, ValueError, TypeError, OverflowError):
        raise Problem("请核对" + name) from None


def money(value):
    return scaled(value, 100, "金额")


def units(value):
    return scaled(value, SCALE, "扣课数量")


def rounded(n, d):
    """Nearest integer, half away from zero; no binary floats."""
    require(d > 0, "课包计价分母必须为正")
    return (1 if n >= 0 else -1) * ((abs(n) * 2 + d) // (2 * d))


def yuan(c):
    return None if c is None else ("-" if c < 0 else "") + f"{abs(c) // 100}.{abs(c) % 100:02d}"


def quantity(q):
    return format(Decimal(q) / SCALE, "f")


def db_open(path):
    if hasattr(path, "open_database"):
        return path.open_database()
    db = sqlite3.connect(path, isolation_level=None, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=20000")
    return db


def one(db, sql, params=()):
    row = db.execute(sql, params).fetchone()
    return dict(row) if row is not None else None


def many(db, sql, params=()):
    return [dict(x) for x in db.execute(sql, params)]


def get(db, table, key):
    # Table names come exclusively from application code.
    row = one(db, f"SELECT * FROM {table} WHERE id=?", (key,))
    require(row is not None, "找不到记录 " + str(key), 404)
    return row


def cfg(db, key):
    return db.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()[0]


def schema_version(db):
    if isinstance(db, sqlite3.Connection):
        return db.execute("PRAGMA user_version").fetchone()[0]
    return db.schema_version()


def init_db(path, activation, demo=False):
    day(activation)
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    db = db_open(p)
    try:
        version = schema_version(db)
        if version:
            require(version == 1, "账套结构版本与 V1 不匹配")
            require(cfg(db, "mode") == ("demo" if demo else "live"), "数据模式不匹配，请使用独立数据库")
            require(cfg(db, "activation") == activation, "启用日已确定，请核对已有账套的启用日")
            return
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("BEGIN IMMEDIATE;\n" + Path(__file__).with_name("schema.sql").read_text())
        seed_catalog(db, activation, demo)
        db.commit()
    finally:
        db.close()


def seed_catalog(db, activation, demo):
    for k, v in dict(
        mode="demo" if demo else "live", activation=activation, low="3", idle="30"
    ).items():
        db.execute("INSERT INTO config VALUES (?,?)", (k, v))
    for tid, name, subj, bp in TEACHERS:
        db.execute("INSERT INTO teachers VALUES (?,?,?)", (tid, name, subj))
        db.execute("INSERT INTO rules VALUES (?,?,?,?)", (ident("R"), tid, activation, bp))
    for tid, audience in (("HU", "成人、儿童"), ("JIA", "成人、儿童"), ("PENG", "以儿童为主"), ("WEN", "儿童")):
        db.execute("INSERT INTO config VALUES (?,?)", ("teacher_audience." + tid, audience))


def audit(db, actor, action, ref, detail):
    db.execute(
        "INSERT INTO audit(at,actor,action,ref,detail) VALUES (?,?,?,?,?)",
        (now(), actor["id"], action, ref, dump(detail)),
    )


def admin(actor):
    require(actor["role"] in ("owner", "ops"), "需要管理员权限", 403)


def can_student(db, actor, sid):
    if actor["role"] != "teacher":
        return True
    return bool(
        one(
            db,
            """SELECT s.id FROM students s WHERE s.id=? AND
        (s.main_teacher=? OR EXISTS(SELECT 1 FROM grants g WHERE g.student=s.id AND g.account=?))""",
            (sid, actor["teacher"], actor["id"]),
        )
    )


def placeholders(values):
    return ",".join("?" for _ in values)
