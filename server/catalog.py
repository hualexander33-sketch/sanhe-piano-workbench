from datetime import date, timedelta
from decimal import Decimal

from .common import (
    TYPES,
    admin,
    audit,
    cfg,
    day,
    get,
    ident,
    label,
    many,
    money,
    one,
    require,
    rounded,
    scaled,
    studio_teacher,
    today,
    units,
)


def move(db, actor, pack, when, kind, qty, value, contract=0, lesson=None, line=None, reason=""):
    pk = get(db, "packages", pack)
    if kind in ("opening", "purchase"):
        purchased = pk["paid_units"]
    elif kind == "use_reversal":
        purchased = -one(
            db,
            "SELECT z.purchased FROM movement_sources z JOIN movements m ON m.id=z.movement WHERE m.line=? AND kind='use'",
            (line,),
        )["purchased"]
    elif qty < 0:
        daily = many(
            db,
            """SELECT m.day,sum(z.purchased) q FROM movement_sources z JOIN movements m ON m.id=z.movement
                         WHERE m.pack=? GROUP BY m.day ORDER BY m.day""",
            (pack,),
        )
        current = sum(r["q"] for r in daily if r["day"] <= when)
        available = current
        for r in daily:
            if r["day"] > when:
                current += r["q"]
                available = min(current, available)
        purchased = -min(-qty, available)
    else:
        purchased = 0
    cur = db.execute(
        """INSERT INTO movements(pack,day,kind,units,value,contract,lesson,line,reason,actor)
        VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (pack, when, kind, qty, value, contract, lesson, line, reason, actor["id"]),
    )
    db.execute(
        "INSERT INTO movement_sources VALUES (?,?,?)", (cur.fetchone()[0], purchased, qty - purchased)
    )


def balance(db, pid, when="9999-12-31"):
    b = one(
        db,
        """SELECT coalesce(sum(units),0) units,coalesce(sum(value),0) value,
        coalesce(sum(contract),0) contract FROM movements WHERE pack=? AND day<=?""",
        (pid, when),
    )
    b["cash"] = one(
        db, "SELECT coalesce(sum(amount),0) a FROM cash WHERE pack=? AND day<=?", (pid, when)
    )["a"]
    b["debt"] = b["contract"] - b["cash"]
    return b


def minimum(db, pid, when, column):
    """Lowest closing balance from the proposed effective date through all later entries."""
    start = balance(db, pid, when)[column]
    lowest = start
    for row in db.execute(
        f"SELECT sum({column}) FROM movements WHERE pack=? AND day>? GROUP BY day ORDER BY day",
        (pid, when),
    ):
        start += row[0]
        lowest = min(lowest, start)
    return lowest


def price_basis(db, pack):
    orig = one(db, "SELECT * FROM opening_bases WHERE pack=?", (pack["id"],))
    return (
        (orig["full_price"], orig["full_units"])
        if orig
        else (pack["price"], pack["paid_units"] + pack["gift_units"])
    )


def take_value(db, pack, when, qty):
    require(minimum(db, pack["id"], when, "units") >= qty, "余额不足，需补充课包或核实扣课量")
    b = balance(db, pack["id"])
    price, total = price_basis(db, pack)
    used = total - b["units"]
    value = rounded(price * (used + qty), total) - (price - b["value"])
    require(
        value >= 0 and minimum(db, pack["id"], when, "value") >= value, "价值余额不足，需核对相关调整"
    )
    return value


def student(db, a, p):
    admin(a)
    sid = label(p.get("id") or ident("S"), "学生编号")
    old = one(db, "SELECT * FROM students WHERE id=?", (sid,))
    if old:
        require(p.get("edit") is True, "学生编号已经存在")
    data = {**(old or {}), **p}
    name = label(data.get("name"), "学生姓名")
    ct = label(data.get("course"), "课程")
    teacher = get(db, "teachers", data.get("main_teacher"))["id"]
    substitute = data.get("substitute_teacher") or None
    if substitute:
        get(db, "teachers", substitute)
        require(substitute != teacher, "临时代课老师与主带老师须为不同的人")
    status = data.get("status", "在读")
    category = data.get("category", "儿童")
    require(status in ("在读", "暂停", "结课", "待确认") and category in ("儿童", "成人", "待确认"), "档案状态或类别无效")
    enrolled = data.get("enrolled", today())
    vals = (
        name,
        category,
        str(data.get("contact", "")),
        ct,
        teacher,
        day(enrolled) if enrolled else "",
        status,
        substitute,
    )
    if old:
        db.execute(
            "UPDATE students SET name=?,category=?,contact=?,course=?,main_teacher=?,enrolled=?,status=?,substitute_teacher=? WHERE id=?",
            (*vals, sid),
        )
    else:
        db.execute("""INSERT INTO students(id,name,category,contact,course,main_teacher,enrolled,status,substitute_teacher)
                      VALUES (?,?,?,?,?,?,?,?,?)""", (sid, *vals))
    audit(
        db,
        a,
        "编辑学生" if old else "建档",
        sid,
        {
            "before": old,
            "after": dict(
                id=sid,
                **dict(
                    zip(
                        ("name", "category", "contact", "course", "main_teacher", "enrolled", "status", "substitute_teacher"),
                        vals,
                    )
                ),
            ),
        },
    )
    return {"id": sid}


def cash_entry(db, a, pack, when, amount, kind, method, reason):
    cid = ident("C")
    db.execute(
        "INSERT INTO cash VALUES (?,?,?,?,?,?,?,?)",
        (cid, pack, when, amount, kind, label(method, "收付方式"), reason, a["id"]),
    )
    return cid


def package(db, a, p):
    admin(a)
    sid = get(db, "students", p.get("student"))["id"]
    kind = p.get("type")
    require(kind in TYPES, "请选择课型")
    opening = bool(p.get("opening"))
    activation = cfg(db, "activation")
    when = (
        (date.fromisoformat(activation) - timedelta(days=1)).isoformat()
        if opening
        else day(p.get("day") or today())
    )
    require(opening or when >= activation, "启用日前请登记期初")
    paid, gift = units(p.get("purchased", 0)), units(p.get("gift", 0))
    price = money(p.get("price"))
    if paid + gift == 0:
        require(opening and price == 0 and p.get("original_price") not in ("", None)
                and units(p.get("original_units") or 0) > 0,
                "零余课仅用于有原合同的已用完期初课包，剩余价值应为零")
    due = money(p.get("debt", 0)) if opening else price
    received = money(p.get("receipt", 0) or 0)
    require(
        (not opening and received <= price) or (opening and received == 0),
        "核对本次收款，期初使用剩余价值和欠费",
    )
    until = p.get("until_day") or None
    require(not until or day(until) >= when, "有效期早于建包日期")
    pid = label(p.get("id") or ident("P"), "课包编号")
    course = label(p.get("course") or get(db, "students", sid)["course"], "课程")
    db.execute(
        "INSERT INTO packages VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            pid,
            sid,
            course,
            kind,
            when,
            until,
            paid,
            gift,
            price,
            int(opening),
            str(p.get("note", "")),
            get(db, "students", sid)["main_teacher"],
        ),
    )
    move(
        db,
        a,
        pid,
        when,
        "opening" if opening else "purchase",
        paid + gift,
        price,
        due,
        reason=str(p.get("note", "")),
    )
    if opening and (
        p.get("original_price") not in ("", None) or p.get("original_units") not in ("", None)
    ):
        full_price = money(p.get("original_price"))
        full_qty = units(p.get("original_units"))
        require(full_qty >= paid + gift and full_price >= price, "原合同金额或次数小于期初剩余")
        require(
            abs(rounded(full_price * (full_qty - paid - gift), full_qty) - (full_price - price)) <= 1,
            "原合同与期初余值不能对账，请核实期初依据",
        )
        db.execute("INSERT INTO opening_bases VALUES (?,?,?)", (pid, full_price, full_qty))
    for carry in p.get("fee_carries", []):
        require(opening, "课酬累计基数仅用于已核实的期初")
        rid = get(db, "rules", carry["rule"])["id"]
        db.execute(
            "INSERT INTO opening_fee_carries VALUES (?,?,?,?)",
            (pid, rid, units(carry["units"]), money(carry["amount"])),
        )
    if received:
        cash_entry(db, a, pid, when, received, "receipt", p.get("method") or "微信", "购课收款")
    audit(db, a, "期初课包" if opening else "新课包", pid, p)
    return {"id": pid}


def collect(db, a, p):
    admin(a)
    pk = get(db, "packages", p.get("pack"))
    when = day(p.get("day") or today())
    require(when >= max(pk["since"], cfg(db, "activation")), "日期早于可记账日")
    value = money(p.get("amount", 0))
    kind = p.get("kind", "receipt")
    reason = str(p.get("reason", "")).strip()
    if kind == "receipt":
        require(
            value > 0
            and value <= min(balance(db, pk["id"], when)["debt"], balance(db, pk["id"])["debt"]),
            "收款必须为正且不超过欠费",
        )
    elif kind == "refund":
        label(reason, "退款依据及差额说明")
        qty = units(p.get("units", 0) or 0)
        require(qty or value, "请输入退课数或退款金额")
        retired = take_value(db, pk, when, qty) if qty else 0
        reduction = money(p.get("contract_reduction", p.get("amount", 0)) or 0)
        b = balance(db, pk["id"], when)
        require(reduction <= b["contract"] + (pk["price"] if pk["opening"] else 0), "订单调减超出范围")
        require(
            b["debt"] + value - reduction >= 0
            and balance(db, pk["id"])["debt"] + value - reduction >= 0,
            "退款后的欠费不能为负",
        )
        if not pk["opening"]:
            # Keep actual receipts and the contract consistent at every later cutoff.
            require(value <= min(b["cash"], balance(db, pk["id"])["cash"]), "退款超过已收金额")
        move(db, a, pk["id"], when, "refund", -qty, -retired, -reduction, reason=reason)
        value = -value
    else:
        require(False, "收支类型无效")
    key = cash_entry(db, a, pk["id"], when, value, kind, p.get("method") or "微信", reason)
    audit(db, a, "登记退款" if kind == "refund" else "学费收款", key, p)
    return {"id": key}


def convert(db, a, p):
    """Retire part of an existing package and issue a separate, explicitly priced entitlement."""
    admin(a)
    src = get(db, "packages", p.get("pack"))
    reason = label(p.get("reason"), "转换或追加赠课依据")
    when = day(p.get("day") or today())
    require(when >= max(cfg(db, "activation"), src["since"]), "日期早于可调整日")
    old_units = units(p.get("from_units"))
    require(old_units > 0, "请输入原包转出数量")
    amt = take_value(db, src, when, old_units)
    new = package(
        db,
        a,
        dict(
            student=src["student"],
            type=p.get("type"),
            course=p.get("course") or src["course"],
            day=when,
            purchased=p.get("purchased", 0),
            gift=p.get("gift", 0),
            price=str(Decimal(amt) / 100),
            until_day=p.get("until_day") or src["until_day"],
            note=reason,
        ),
    )
    move(db, a, src["id"], when, "transfer_out", -old_units, -amt, reason=new["id"] + " " + reason)
    db.execute(
        "UPDATE movements SET kind='transfer_in',contract=0,reason=? WHERE pack=? AND kind='purchase'",
        (src["id"] + " " + reason, new["id"]),
    )
    audit(db, a, "转课或剩余权益重订", src["id"], {"to": new["id"], **p})
    return new


def rule(db, a, p):
    require(a["role"] == "owner", "仅老板管理员可配置分成", 403)
    teacher = get(db, "teachers", p.get("teacher"))["id"]
    since = day(p.get("since"))
    bp = scaled(p.get("percent"), 100, "分成百分比")
    require(bp <= 10000, "分成必须在0到100之间")
    require(bp == 0 or teacher != studio_teacher(db), "该老师的消课收入全额归琴行，教师分成为 0%")
    rid = ident("R")
    db.execute("INSERT INTO rules VALUES (?,?,?,?)", (rid, teacher, since, bp))
    audit(db, a, "新增分成版本", rid, p)
    return {"id": rid}


def settings(db, a, p):
    admin(a)
    low = scaled(p.get("low"), 1, "低余额阈值")
    idle = scaled(p.get("idle"), 1, "未上课天数", 1)
    for k, v in [("low", low), ("idle", idle)]:
        db.execute("UPDATE config SET value=? WHERE key=?", (str(v), k))
    audit(db, a, "提醒阈值", "settings", p)
    return {"low": low, "idle": idle}


def archive_cash(db, a, p):
    admin(a)
    when = day(p.get("day"))
    require(when < cfg(db, "activation"), "此入口用于已含期初的启用日前收付")
    kind = p.get("kind")
    require(kind in ("receipt", "refund", "payment"), "历史收付类型无效")
    reason = label(p.get("reason"), "原凭证与期初依据")
    key = ident("HIST")
    pk = get(db, "packages", p.get("pack"))["id"] if kind != "payment" else None
    teacher = get(db, "teachers", p.get("teacher"))["id"] if kind == "payment" else None
    val = money(p.get("amount"))
    require(val > 0, "原凭证金额应为正")
    db.execute(
        "INSERT INTO historical_cash VALUES (?,?,?,?,?,?,?,?,?)",
        (key, when, kind, pk, teacher, val, label(p.get("method") or "转账", "方式"), reason, a["id"]),
    )
    audit(db, a, "补录已含期初的收付", key, p)
    return {"id": key}


def teacher_profile(db, a, p):
    admin(a)
    teacher = get(db, "teachers", p.get("teacher"))
    subject = str(p.get("subject", teacher["subject"])).strip()
    db.execute("UPDATE teachers SET subject=? WHERE id=?", (subject, teacher["id"]))
    detail = {"before": {"subject": teacher["subject"]}, "after": {"subject": subject}}
    if "audience" in p:
        key = "teacher_audience." + teacher["id"]
        old = one(db, "SELECT value FROM config WHERE key=?", (key,))
        audience = str(p["audience"]).strip()
        require(len(audience) <= 80, "授课对象最多80字")
        db.execute("INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, audience))
        detail["before"]["audience"] = old["value"] if old else ""
        detail["after"]["audience"] = audience
    audit(db, a, "编辑老师档案", teacher["id"], detail)
    return {"id": teacher["id"]}
