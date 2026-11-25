"""One transactional posting engine for manual entry, import, preview and correction."""

import json
import re
from datetime import date, timedelta

from .catalog import balance, move, price_basis, take_value
from .common import (
    TYPES,
    Problem,
    admin,
    audit,
    can_student,
    cfg,
    day,
    digest,
    dump,
    get,
    ident,
    label,
    many,
    money,
    now,
    one,
    quantity,
    require,
    rounded,
    scaled,
    studio_teacher,
    today,
    units,
)

STATES = {
    "到课": "present",
    "请假": "leave",
    "取消": "cancel",
    "缺席扣课": "absent_charge",
    "present": "present",
    "leave": "leave",
    "cancel": "cancel",
    "absent_charge": "absent_charge",
}


def optional_money(v):
    return None if v is None or v == "" else money(v)


def normalize(db, a, p):
    teacher = get(db, "teachers", p.get("teacher"))["id"]
    if a["role"] == "teacher":
        require(a["can_record"] and teacher == a["teacher"], "未授权补录该老师的授课", 403)
    t = p.get("type")
    require(t in TYPES, "课型未识别")
    when = day(p.get("day"))
    clock = str(p.get("clock") or "").strip()
    if clock:
        m = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)(?::00)?", clock)
        require(m, "时间应为 HH:MM")
        clock = f"{int(m[1]):02d}:{m[2]}"
    scene = str(p.get("scene") or "").strip()
    rows = p.get("lines", [])
    require(
        isinstance(rows, list) and len(rows) == TYPES[t][0], f"该课型应有 {TYPES[t][0]} 条独立学生记录"
    )
    scope = p.get("scope") or "unknown"
    require(scope in ("student", "session", "unknown", "weekly"), "课酬口径无效")
    attendees = []
    for r in rows:
        stu = get(db, "students", r.get("student"))
        require(can_student(db, a, stu["id"]), "未授权访问该学生", 403)
        state = STATES.get(r.get("state") or "present")
        require(state, "出勤状态未识别")
        q = r.get("units")
        q = units((0 if state in ("leave", "cancel") else 1) if q in ("", None) else q)
        require(
            state not in ("leave", "cancel") or q == 0, "请假或取消时扣课应为零，约定扣课请选择缺席扣课"
        )
        if a["role"] == "teacher":
            require(
                q == (1000 if state == "present" else 0) and state != "absent_charge",
                "特殊扣课须由管理员确认",
                403,
            )
            require(
                not any(
                    r.get(k) not in ("", None) for k in ("source_fee", "source_value", "source_unit")
                ),
                "课酬调整需管理员确认",
                403,
            )
        attendees.append(
            dict(
                student=stu["id"],
                pack=str(r.get("pack") or "").strip(),
                state=state,
                units=quantity(q),
                source_value=optional_money(r.get("source_value")),
                source_unit=optional_money(r.get("source_unit")),
                source_fee=optional_money(r.get("source_fee")),
                record=str(r.get("record") or "").strip(),
                content=str(r.get("content") or ""),
                next_focus=str(r.get("next_focus") or ""),
            )
        )
    require(len({r["student"] for r in attendees}) == len(rows), "同一场的两个学生必须是不同档案")
    require(
        clock or scene or (len(rows) == 1 and attendees[0]["record"]),
        "缺少稳定场次信息，请补开始时间或独立场次编号",
    )
    minutes = scaled(p.get("minutes") or TYPES[t][1], 1, "实际分钟", 1)
    require(minutes <= 1440, "时长超过一天")
    require(minutes == TYPES[t][1] or a["role"] != "teacher", "特殊时长需管理员确认", 403)
    course = p.get("course") or ""
    if not course:
        courses = set()
        for r in attendees:
            match = one(db, """SELECT p.course FROM packages p JOIN package_students m ON m.pack=p.id
                WHERE m.student=? AND p.id=?""", (r["student"], r["pack"])) if r["pack"] else None
            courses.add(match["course"] if match else get(db, "students", r["student"])["course"])
        require(len(courses) == 1, "多课程需要指定本次科目")
        course = courses.pop()
    history_mode = p.get("history_mode") or "included"
    require(history_mode in ("included", "omitted"), "期初归属无效")
    history_reason = str(p.get("history_reason") or "")
    if when < cfg(db, "activation") and history_mode == "omitted":
        admin(a)
        label(history_reason, "未纳入期初的核实依据")
    historical = {}
    if p.get("history_percent") not in ("", None):
        admin(a)
        require(when < cfg(db, "activation") and history_mode == "included", "单课历史分成仅用于已含期初的历史明细")
        bp = scaled(str(p["history_percent"]).removesuffix("%"), 100, "历史约定百分比")
        require(bp <= 10000, "历史约定百分比超出范围")
        historical["history_bp"] = bp
    return dict(
        **historical,
        history_mode=history_mode,
        history_reason=history_reason,
        teacher=teacher,
        type=t,
        day=when,
        clock=clock,
        scene=scene,
        course=label(course, "科目"),
        minutes=minutes,
        scope=scope,
        namespace=label(p.get("namespace") or "周表", "数据来源"),
        lines=sorted(attendees, key=lambda r: r["student"]),
    )


def identity_keys(p):
    ns = p["namespace"]
    keys = [dump(["row", ns, r["record"]]) for r in p["lines"] if r["record"]]
    require(len(keys) == len(set(keys)), "同场学生原始记录编号重复")
    if p["scene"]:
        keys.append(dump(["scene", ns, p["scene"]]))
    if p["clock"]:
        keys.append(dump(["clock", p["day"], p["teacher"], p["clock"]]))
    return keys


def canonical(p):
    # Explicit identifiers and a column definition with no supplied fees do not change a lesson.
    rows = [{k: v for k, v in r.items() if k != "record"} for r in p["lines"]]
    body = {k: v for k, v in p.items() if k not in ("namespace", "scene", "lines")}
    if len(rows) == 1 or not any(r["source_fee"] is not None for r in rows):
        body["scope"] = "single_or_empty"
    return digest({**body, "lines": rows})


def closed_end(db, teacher):
    return one(db, "SELECT coalesce(max(\"end\"),'') d FROM settlements WHERE teacher=?", (teacher,))["d"]


def open_day(db, teacher, desired):
    end = closed_end(db, teacher)
    if desired > end:
        return desired
    return max(today(), (date.fromisoformat(end) + timedelta(days=1)).isoformat())


def select_pack(db, sid, p, requested):
    sql = """SELECT p.* FROM packages p JOIN package_students m ON m.pack=p.id
             WHERE m.student=? AND p.course=? AND p.type=? AND p.since<=?
             AND (p.until_day IS NULL OR p.until_day>=?)"""
    candidates = many(db, sql, (sid, p["course"], p["type"], p["day"], p["day"]))
    if requested:
        match = next((c for c in candidates if c["id"] == requested), None)
        require(match, "指定课包与学生、日期、科目或课型不匹配")
        return match
    viable = [c for c in candidates if balance(db, c["id"], p["day"])["units"] > 0]
    require(
        len(viable) == 1, "有多个适用课包，请指定编号" if len(viable) > 1 else "缺少可用课包或余额不足"
    )
    return viable[0]


def fee_increment(db, pack, rule, qty):
    prev = one(
        db,
        """SELECT coalesce(sum(a.units),0) q,coalesce(sum(a.system_fee),0) f
        FROM attendance a JOIN lessons l ON l.id=a.lesson WHERE l.active=1 AND l.history=0
        AND a.pack=? AND a.rule=? AND a.system_fee IS NOT NULL""",
        (pack["id"], rule["id"]),
    )
    price, total = price_basis(db, pack)
    carry = one(db, "SELECT qty,amount FROM opening_fee_carries WHERE pack=? AND rule=?",
                (pack["id"], rule["id"]))
    previous_qty = prev["q"] + (carry["qty"] if carry else 0)
    previous_fee = prev["f"] + (carry["amount"] if carry else 0)
    return rounded(price * (previous_qty + qty) * rule["bp"], total * 10000) - previous_fee


PAPER_FEE_REVIEW = "历史课酬按现行分成试算，实际约定和付款待核"
STUDIO_INCOME = "本节消课收入全额归琴行，外发课酬为零"


def confirmed_card_batch(db, batch):
    return bool(batch and one(db, "SELECT 1 FROM config WHERE key='confirmed_card_ledger_batch' AND value=?", (batch,)))


def reference_fee(db, pack, rule, qty, card_batch, record, teacher, when, state):
    if teacher == studio_teacher(db):
        return 0
    # The reviewed workbook allocated rounding cents across individual teaching records.
    if card_batch and qty == 1000 and state == "present" and record:
        entry = one(
            db,
            "SELECT estimate FROM paper_fee_estimates WHERE record=? AND pack=? AND teacher=? AND day=?",
            (record, pack["id"], teacher, when),
        )
        if entry:
            return entry["estimate"]
    return fee_increment(db, pack, rule, qty) if rule else None


def post_line(db, a, lesson, p, r, history, booked, card_batch=False):
    sid, qty = r["student"], units(r["units"])
    line = ident("A")
    pack = val = system = None
    rule = one(
        db,
        "SELECT * FROM rules WHERE teacher=? AND since<=? ORDER BY since DESC LIMIT 1",
        (p["teacher"], max(p["day"], cfg(db, "activation")) if card_batch else p["day"]),
    )
    status = "pending"
    note = ""
    bp = 0 if not history and p["teacher"] == studio_teacher(db) else (rule["bp"] if rule else None)
    if history:
        status, note = "history", "历史展示，已包含期初"
        if r["pack"]:
            pack = one(db, """SELECT p.* FROM packages p JOIN package_students m ON m.pack=p.id
                    WHERE p.id=? AND m.student=? AND p.course=? AND p.type=? AND p.opening=1""",
                       (r["pack"], sid, p["course"], p["type"]))
            if not pack:
                note += "，来源课包尚未匹配"
        if "history_bp" in p:
            bp = p["history_bp"]
            if rule and rule["bp"] != bp:
                rule = None
        if p["history_reason"]:
            note += "。" + p["history_reason"]
    elif qty == 0:
        status, val, system = "ok", 0, 0
    else:
        try:
            legacy_omission = not card_batch and p["day"] < cfg(db, "activation") and p["history_mode"] == "omitted"
            basis_date = booked if legacy_omission else p["day"]
            pack = select_pack(db, sid, {**p, "day": basis_date}, r["pack"])
            if legacy_omission:
                require(r["pack"] and pack["opening"], "期初遗漏的旧课须明确关联已核实的期初课包")
            computed = take_value(db, pack, max(p["day"], booked), qty)
            if r["source_value"] is not None:
                require(r["source_value"] == computed, "原表消课金额与课包计算不同")
            if r["source_unit"] is not None:
                price, total = price_basis(db, pack)
                require(r["source_unit"] == rounded(price * 1000, total), "原表单价与课包均价不同")
            val, status = computed, "ok"
            system = reference_fee(db, pack, rule, qty, card_batch, r["record"], p["teacher"], p["day"], r["state"])
        except Problem as e:
            note = str(e)
    db.execute(
        """INSERT INTO attendance VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            line,
            lesson,
            sid,
            pack["id"] if pack else None,
            r["pack"],
            r["state"],
            qty,
            val,
            r["source_value"],
            r["source_unit"],
            r["source_fee"],
            status,
            note,
            rule["id"] if rule else None,
            bp,
            system,
            r["content"],
            r["next_focus"],
            r["record"],
        ),
    )
    if status == "ok" and qty:
        move(db, a, pack["id"], booked, "use", -qty, -val, lesson=lesson, line=line)
    return get(db, "attendance", line)


def post_payable(db, teacher, when, amount, kind, fee=None, lesson=None, related=None, reason=""):
    key = ident("Y")
    db.execute(
        "INSERT INTO payables VALUES (?,?,?,?,?,?,?,?,?,?)",
        (key, teacher, when, amount, kind, fee, lesson, related, None, reason),
    )
    return key


def recognize(db, a, l, fee, lines, value, when, reason):
    require(all(r["value"] is not None for r in lines), "请先补核课包与消课依据")
    internal = l["teacher"] == studio_teacher(db)
    require(not internal or value == 0, "该老师的授课收入全额归琴行")
    db.execute(
        "UPDATE fees SET final=?,status=?,reason=?,reviewer=?,reviewed=? WHERE id=?",
        (value, "studio" if internal else "ok", reason, a["id"], now(), fee),
    )
    if not internal:
        post_payable(db, l["teacher"], when, value, "earned", fee, l["id"], reason=reason)
    db.execute(
        "INSERT INTO retention(lesson,fee,day,value,earned) VALUES (?,?,?,?,?)",
        (l["id"], fee, when, sum(r["value"] for r in lines), value),
    )


def create_fees(db, a, l, rows, scope, card_batch=False):
    internal = not l["history"] and l["teacher"] == studio_teacher(db)
    groups = [[r] for r in rows] if scope in ("student", "weekly") else [rows]
    for group in groups:
        fee = ident("F")
        raw = [r["source_fee"] for r in group if r["source_fee"] is not None]
        conflict = len(set(raw)) > 1
        source = raw[0] if raw and not conflict and scope not in ("weekly", "unknown") else None
        calc = (
            sum(r["system_fee"] for r in group)
            if all(r["system_fee"] is not None for r in group)
            else None
        )
        if internal:
            calc = 0
        diff = source - calc if source is not None and calc is not None else None
        reason = ""
        if internal:
            reason = STUDIO_INCOME
        elif card_batch:
            reason = PAPER_FEE_REVIEW
        elif l["history"]:
            reason = "历史展示，已包含期初"
        elif conflict:
            reason = "同场原表课酬不一致"
        elif raw and scope == "unknown":
            reason = "原表课酬口径待确认"
        elif calc is None:
            reason = "课包、消课或当时分成待核"
        elif any(r["state"] == "absent_charge" for r in group):
            reason = "缺席扣课的课酬约定待核"
        elif diff:
            reason = "原表与系统课酬存在差额"
        status = "history" if l["history"] else ("studio" if internal else "pending")
        db.execute(
            "INSERT INTO fees VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                fee,
                l["id"],
                group[0]["id"] if len(group) == 1 else None,
                scope,
                source,
                dump(raw),
                calc,
                diff,
                0 if internal else None,
                status,
                reason,
                None,
                None,
            ),
        )
        if internal and all(r["value"] is not None for r in group):
            recognize(db, a, l, fee, group, 0, l["booked"], STUDIO_INCOME)
        elif not reason:
            recognize(db, a, l, fee, group, calc, l["booked"], "按有效规则确认")


def summary(db, lid):
    l = get(db, "lessons", lid)
    rows = many(db, "SELECT * FROM attendance WHERE lesson=? ORDER BY student", (lid,))
    for r in rows:
        source = one(
            db,
            "SELECT -z.purchased purchased,-z.gift gift FROM movement_sources z JOIN movements m ON m.id=z.movement WHERE m.line=? AND m.kind='use'",
            (r["id"],),
        )
        r["purchased_used"] = source["purchased"] if source else None
        r["gift_used"] = source["gift"] if source else None
        r["arrear"] = one(db, "SELECT id,day,reason,cleared FROM arrears WHERE line=?", (r["id"],))
    fees = many(db, "SELECT * FROM fees WHERE lesson=? ORDER BY rowid", (lid,))
    return dict(
        id=lid,
        day=l["day"],
        clock=l["clock"],
        scene=l["scene"],
        teacher=l["teacher"],
        course=l["course"],
        type=l["type"],
        taught=l["taught"],
        minutes=l["minutes"],
        history=l["history"],
        booked=l["booked"],
        active=l["active"],
        previous=l["previous"],
        root=l["root"],
        batch=l["batch"],
        change_note=l["change_note"],
        lines=rows,
        fees=fees,
    )


def post(db, a, raw, *, batch=None, previous=None, booked=None, reason=""):
    p = normalize(db, a, raw)
    keys = identity_keys(p)
    fp = canonical(p)
    roots = {
        r["root"] for key in keys if (r := one(db, "SELECT root FROM identities WHERE key=?", (key,)))
    }
    for r in p["lines"]:
        registered = (
            one(
                db,
                "SELECT l.root FROM attendance a JOIN lessons l ON l.id=a.lesson WHERE a.id=?",
                (r["record"],),
            )
            if r["record"]
            else None
        )
        if registered:
            roots.add(registered["root"])
    if p["scene"]:
        registered = one(db, "SELECT root FROM lessons WHERE id=?", (p["scene"],))
        if registered:
            roots.add(registered["root"])
    if previous:
        roots.discard(previous["root"])
    if roots:
        require(len(roots) == 1 and not previous, "稳定编号与多个场次冲突，需手工核查")
        root = roots.pop()
        existing = one(db, "SELECT * FROM lessons WHERE root=? ORDER BY rowid DESC LIMIT 1", (root,))
        require(
            a["role"] != "teacher" or existing["teacher"] == a["teacher"],
            "场次标识冲突，请联系管理员",
            403,
        )
        same = fp == existing["fingerprint"] and existing["active"]
        return {
            "status": "duplicate" if same else "revision",
            "lesson": existing["id"],
            "detail": summary(db, existing["id"]),
            "incoming": p,
            "message": "内容相同，跳过" if same else "与已有场次不一致，请核对原值与新值",
        }
    before_opening = p["day"] < cfg(db, "activation")
    # These source contracts are reconstructed from purchase day and contain no opening carry.
    card_batch = confirmed_card_batch(db, batch)
    history = before_opening and not card_batch and p["history_mode"] == "included"
    lid = ident("L")
    root = previous["root"] if previous else lid
    booked = booked or open_day(
        db,
        p["teacher"],
        cfg(db, "activation") if before_opening and not history and not card_batch else p["day"],
    )
    db.execute(
        """INSERT INTO lessons(id,root,previous,day,clock,teacher,course,type,minutes,taught,history,
        booked,scene,batch,fingerprint,payload,actor,created,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            lid,
            root,
            previous["id"] if previous else None,
            p["day"],
            p["clock"],
            p["teacher"],
            p["course"],
            p["type"],
            p["minutes"],
            int(any(r["state"] == "present" for r in p["lines"])),
            int(history),
            booked,
            p["scene"],
            batch,
            fp,
            dump(raw),
            a["id"],
            now(),
            reason,
        ),
    )
    for key in keys:
        db.execute("INSERT INTO identities VALUES (?,?) ON CONFLICT(key) DO NOTHING", (key, root))
    rows = [post_line(db, a, lid, p, r, history, booked, card_batch) for r in p["lines"]]
    create_fees(db, a, get(db, "lessons", lid), rows, p["scope"], card_batch)
    audit(
        db,
        a,
        "更正授课" if previous else "登记授课",
        lid,
        {"batch": batch, "previous": previous["id"] if previous else None, "reason": reason},
    )
    return {"status": "posted", "lesson": lid, "detail": summary(db, lid)}


def review_fee(db, a, p):
    admin(a)
    f = get(db, "fees", p.get("fee"))
    l = get(db, "lessons", f["lesson"])
    require(l["active"] and f["status"] == "pending", "只能补核当前待核课酬")
    reason = label(p.get("reason"), "核对依据")
    rows = many(
        db,
        "SELECT * FROM attendance WHERE lesson=? AND (CAST(? AS TEXT) IS NULL OR id=?)",
        (l["id"], f["line"], f["line"]),
    )
    basis = p.get("basis")
    if basis == "system":
        value = f["calculated"]
    elif basis == "source":
        value = f["source"]
    elif basis == "agreed":
        value = money(p.get("amount"))
    else:
        raise Problem("请选择确认依据")
    require(value is not None, "所选金额仍缺乏依据")
    when = open_day(db, l["teacher"], l["booked"])
    recognize(db, a, l, f["id"], rows, value, when, reason)
    audit(
        db,
        a,
        "补核课酬",
        f["id"],
        {"basis": basis, "final": value, "difference": f["difference"], "reason": reason},
    )
    return {"id": f["id"], "final": value}


def pending_line(db, a, p):
    admin(a)
    r = get(db, "attendance", p.get("line"))
    l = get(db, "lessons", r["lesson"])
    require(l["active"] and not l["history"] and r["status"] == "pending", "仅可处理当前待扣课记录")
    return r, l


def record_arrear(db, a, p):
    r, l = pending_line(db, a, p)
    reason = label(p.get("reason"), "欠课约定")
    key = ident("OWE")
    db.execute("INSERT INTO arrears VALUES (?,?,?,?,?,NULL)", (key, r["id"], today(), reason, a["id"]))
    audit(db, a, "登记欠课", r["id"], {"agreement": key, "reason": reason, "units": r["units"]})
    return {"id": key}


def resolve_line(db, a, p):
    r, l = pending_line(db, a, p)
    reason = label(p.get("reason"), "课包或欠课补核依据")
    chosen = get(db, "packages", p.get("pack"))
    when = open_day(db, l["teacher"], l["booked"])
    rules_for_pack = dict(l)
    owed = one(db, "SELECT * FROM arrears WHERE line=? AND cleared IS NULL", (r["id"],))
    if owed and p.get("cover_owed"):
        when = open_day(db, l["teacher"], day(p.get("day") or today()))
        require(when >= l["day"], "欠课补扣日期早于授课")
        rules_for_pack["day"] = when
    pk = select_pack(db, r["student"], rules_for_pack, chosen["id"])
    value = take_value(db, pk, when, r["units"])
    card_batch = confirmed_card_batch(db, l["batch"])
    rule = (
        get(db, "rules", r["rule"])
        if r["rule"]
        else one(
            db,
            "SELECT * FROM rules WHERE teacher=? AND since<=? ORDER BY since DESC LIMIT 1",
            (l["teacher"], max(l["day"], cfg(db, "activation")) if card_batch else l["day"]),
        )
    )
    system = reference_fee(db, pk, rule, r["units"], card_batch, r["source_record"], l["teacher"], l["day"], r["state"])
    db.execute(
        """UPDATE attendance SET pack=?,value=?,status='ok',explanation=?,rule=?,bp=?,system_fee=? WHERE id=?""",
        (
            pk["id"],
            value,
            reason,
            rule["id"] if rule else None,
            0 if l["teacher"] == studio_teacher(db) else (rule["bp"] if rule else None),
            system,
            r["id"],
        ),
    )
    move(db, a, pk["id"], when, "use", -r["units"], -value, lesson=l["id"], line=r["id"], reason=reason)
    if owed:
        db.execute("UPDATE arrears SET cleared=? WHERE id=?", (now(), owed["id"]))
    for f in many(
        db,
        """SELECT * FROM fees WHERE lesson=? AND (line IS NULL OR line=?)
           AND (status='pending' OR (status='studio' AND NOT EXISTS
               (SELECT 1 FROM retention WHERE fee=fees.id)))""",
        (l["id"], r["id"]),
    ):
        rows = many(
            db,
            "SELECT * FROM attendance WHERE lesson=? AND (CAST(? AS TEXT) IS NULL OR id=?)",
            (l["id"], f["line"], f["line"]),
        )
        if f["status"] == "studio":
            if all(x["value"] is not None for x in rows):
                recognize(db, a, l, f["id"], rows, 0, when, STUDIO_INCOME)
            continue
        if any(x["system_fee"] is None for x in rows):
            continue
        calc = sum(x["system_fee"] for x in rows)
        diff = f["source"] - calc if f["source"] is not None else None
        raw = json.loads(f["source_values"])
        pending = "原表与系统课酬存在差额" if diff else ""
        if raw and (f["scope"] == "unknown" or len(set(raw)) > 1):
            pending = "来源口径或整场金额待核"
        if any(x["state"] == "absent_charge" for x in rows):
            pending = "缺席扣课约定待核"
        if card_batch:
            pending = PAPER_FEE_REVIEW
        db.execute(
            "UPDATE fees SET calculated=?,difference=?,reason=? WHERE id=?",
            (calc, diff, pending or reason, f["id"]),
        )
        if not pending:
            recognize(db, a, l, f["id"], rows, calc, when, reason)
    audit(
        db,
        a,
        "补核学生消课",
        r["id"],
        {"before": r, "pack": pk["id"], "value": value, "day": when, "reason": reason},
    )
    return {"id": r["id"], "lesson": l["id"], "value": value}


def dependencies(db, l):
    packs = [
        r[0]
        for r in db.execute(
            "SELECT DISTINCT pack FROM attendance WHERE lesson=? AND pack IS NOT NULL", (l["id"],)
        )
    ]
    moves = []
    for pid in packs:
        anchor = one(db, "SELECT min(id) id FROM movements WHERE pack=? AND lesson=?", (pid, l["id"]))[
            "id"
        ]
        if anchor:
            moves += many(
                db,
                "SELECT id,pack,day,kind,lesson FROM movements WHERE pack=? AND id>? AND (lesson IS NULL OR lesson<>?)",
                (pid, anchor, l["id"]),
            )
    linked = many(
        db, "SELECT id,settlement FROM payables WHERE lesson=? AND settlement IS NOT NULL", (l["id"],)
    )
    paid = many(
        db,
        """SELECT alloc.payment,alloc.amount FROM allocations alloc JOIN payables y ON y.id=alloc.payable
                    WHERE y.lesson=?""",
        (l["id"],),
    )
    return {"movements": moves, "settled": linked, "payments": paid}


def correct(db, a, p, *, withdraw_roots=None):
    admin(a)
    l = get(db, "lessons", p.get("lesson"))
    require(l["active"], "原记录已有更新，请刷新", 409)
    reason = label(p.get("reason"), "更正原因")
    if p.get("replacement") is not None:
        raw = p["replacement"]
        before = normalize(db, a, json.loads(l["payload"]))
        after = normalize(db, a, raw)
        financial = lambda v: {
            **v,
            "lines": [
                {k: x for k, x in row.items() if k not in ("content", "next_focus")}
                for row in v["lines"]
            ],
        }
        if before != after and financial(before) == financial(after):
            for row in after["lines"]:
                db.execute(
                    "UPDATE attendance SET content=?,next_focus=? WHERE lesson=? AND student=?",
                    (row["content"], row["next_focus"], l["id"], row["student"]),
                )
            db.execute(
                "UPDATE lessons SET payload=?,fingerprint=?,change_note=? WHERE id=?",
                (dump(raw), canonical(after), reason, l["id"]),
            )
            audit(
                db,
                a,
                "更正教学备注",
                l["id"],
                {"before": before["lines"], "after": after["lines"], "reason": reason},
            )
            return {"id": l["id"], "replacement": l["id"], "booked": l["booked"]}
    deps = dependencies(db, l)
    if withdraw_roots:
        deps["movements"] = [m for m in deps["movements"] if m["lesson"] not in withdraw_roots]
    linked = any(deps.values()) or l["day"] <= closed_end(db, l["teacher"])
    if p.get("mode") == "withdraw":
        require(not linked, "存在后续消费、退款或结算，请按关联更正处理")
    when = open_day(db, l["teacher"], max(today(), l["booked"]) if linked else l["booked"])
    neg = many(db, "SELECT * FROM movements WHERE lesson=? AND kind='use'", (l["id"],))
    for m in neg:
        move(
            db,
            a,
            m["pack"],
            when,
            "use_reversal",
            -m["units"],
            -m["value"],
            lesson=l["id"],
            line=m["line"],
            reason=reason,
        )
    for y in many(db, "SELECT * FROM payables WHERE lesson=? AND kind='earned'", (l["id"],)):
        post_payable(
            db, l["teacher"], when, -y["amount"], "correction", y["fee"], l["id"], y["id"], reason
        )
    for r in many(db, "SELECT * FROM retention WHERE lesson=?", (l["id"],)):
        db.execute(
            "INSERT INTO retention(lesson,fee,day,value,earned) VALUES (?,?,?,?,?)",
            (l["id"], r["fee"], when, -r["value"], -r["earned"]),
        )
    db.execute("UPDATE lessons SET active=0 WHERE id=?", (l["id"],))
    out = {"id": l["id"], "booked": when}
    if p.get("replacement") is not None:
        raw = p["replacement"]
        change_day = open_day(db, raw.get("teacher"), max(when, raw["day"]) if linked else raw["day"])
        result = post(db, a, raw, batch=l["batch"], previous=l, booked=change_day, reason=reason)
        require(result["status"] == "posted", "更正与其他场次冲突")
        out["replacement"] = result["lesson"]
    audit(
        db,
        a,
        "关联更正" if linked else "撤回或替换",
        l["id"],
        {**out, "reason": reason, "dependencies": deps},
    )
    return out
