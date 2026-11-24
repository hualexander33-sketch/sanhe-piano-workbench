"""Period activity and balances at a cutoff, shared by screens, drill-downs and CSV."""

import calendar
import csv
import io
import json
from datetime import date, timedelta

from .catalog import balance, price_basis
from .common import (
    admin,
    can_student,
    cfg,
    day,
    get,
    many,
    one,
    quantity,
    require,
    rounded,
    today,
    yuan,
)
from .lessons import dependencies, summary


def period(p):
    anchor = date.fromisoformat(day(p.get("anchor") or today()))
    scale = p.get("period", "month")
    if p.get("start") or p.get("end") or scale == "custom":
        first, last = day(p.get("start")), day(p.get("end"))
    else:
        if scale == "week":
            start = anchor - timedelta(days=anchor.weekday())
            end = start + timedelta(days=6)
        else:
            require(scale in ("month", "quarter", "year"), "时间范围无效")
            month = (
                1
                if scale == "year"
                else (anchor.month - 1) // 3 * 3 + 1
                if scale == "quarter"
                else anchor.month
            )
            length = {"year": 12, "quarter": 3, "month": 1}[scale]
            start = date(anchor.year, month, 1)
            last_month = month + length - 1
            end = date(anchor.year, last_month, calendar.monthrange(anchor.year, last_month)[1])
        first, last = start.isoformat(), end.isoformat()
        if first <= today() <= last:
            last = today()
    require(first <= last, "开始日期晚于结束日期")
    return first, last


def teachers(db, a):
    sql = """SELECT t.*,coalesce(c.value,'') audience FROM teachers t
             LEFT JOIN config c ON c.key='teacher_audience.' || t.id"""
    if a["role"] == "teacher":
        return many(db, sql + " WHERE t.id=?", (a["teacher"],))
    return many(db, sql + " ORDER BY t.rowid")


def packs(db, a, p):
    when = day(p.get("asof") or p.get("end") or today())
    rows = many(
        db,
        """SELECT p.*,o.full_units original_units,o.full_price original_price,
                  review.amount receipt_review,(unsplit.pack IS NOT NULL) split_unknown
           FROM packages p LEFT JOIN opening_bases o ON o.pack=p.id
           LEFT JOIN paper_receipt_review review ON review.pack=p.id
           LEFT JOIN paper_unsplit_packages unsplit ON unsplit.pack=p.id
           WHERE p.since<=? ORDER BY p.since,p.rowid""",
        (when,),
    )
    members = {}
    visible_students = {}
    for member in many(db, """SELECT m.pack,m.student,s.name FROM package_students m
            JOIN packages p ON p.id=m.pack JOIN students s ON s.id=m.student
            ORDER BY m.pack,(p.student=m.student) DESC,s.name,s.id"""):
        sid = member["student"]
        if sid not in visible_students:
            visible_students[sid] = can_student(db, a, sid)
        if visible_students[sid]:
            members.setdefault(member["pack"], {})[sid] = member["name"]
    out = []
    for pk in rows:
        visible = members.get(pk["id"], {})
        if not visible or (p.get("student") and p["student"] not in visible):
            continue
        if p.get("pack") and pk["id"] != p["pack"]:
            continue
        if any(p.get(k) and pk[k] != p[k] for k in ("type", "course")):
            continue
        if p.get("teacher") and pk["main_at_sale"] != p["teacher"]:
            continue
        b = balance(db, pk["id"], when)
        spent = one(
            db,
            "SELECT coalesce(-sum(units),0) n FROM movements WHERE pack=? AND day<=? AND kind IN ('use','use_reversal')",
            (pk["id"], when),
        )["n"]
        price, total = price_basis(db, pk)
        historical_used = one(db, """SELECT coalesce(sum(r.units),0) n FROM attendance r JOIN lessons l ON l.id=r.lesson
                                    WHERE r.pack=? AND l.active=1 AND l.history=1 AND l.day<=?""",
                              (pk["id"], when))["n"] if pk["opening"] else 0
        data = dict(
            **pk,
            total_units=total,
            member_ids=list(visible),
            student_name="、".join(visible.values()),
            remaining=b["units"],
            remaining_value=b["value"],
            net_cash=b["cash"],
            debt=b["debt"],
            used=spent,
            historical_used=historical_used,
            average=rounded(price * 1000, total),
        )
        if a["role"] == "teacher":
            data["student"] = next(iter(visible))
            data = {
                k: data[k]
                for k in (
                    "id",
                    "student",
                    "student_name",
                    "member_ids",
                    "split_unknown",
                    "course",
                    "type",
                    "since",
                    "until_day",
                    "paid_units",
                    "gift_units",
                    "used",
                    "historical_used",
                    "original_units",
                    "total_units",
                    "remaining",
                    "opening",
                )
            }
        out.append(data)
    return out


def student_list(db, a, p):
    when = day(p.get("asof") or today())
    packages = packs(db, a, {"asof": when})
    out = []
    for s in many(db, """SELECT s.* FROM students s WHERE coalesce(nullif(s.enrolled,''), (
                SELECT min(d) FROM (
                    SELECT min(l.day) d FROM attendance r JOIN lessons l ON l.id=r.lesson WHERE r.student=s.id AND l.active=1
                    UNION ALL SELECT min(p.since) FROM packages p JOIN package_students m ON m.pack=p.id WHERE m.student=s.id
                    UNION ALL SELECT substr(min(at),1,10) FROM audit WHERE ref=s.id AND action='建档'
                ) AS enrolled_dates))<=? ORDER BY s.name,s.id""", (when,)):
        if not can_student(db, a, s["id"]):
            continue
        if p.get("status") and s["status"] != p["status"]:
            continue
        if p.get("q", "").lower() not in (s["name"] + " " + s["id"]).lower():
            continue
        mine = [pk for pk in packages if s["id"] in pk["member_ids"]]
        # Include subjects and teachers from the same contract when applying combined filters.
        options = [(pk["course"], pk.get("main_at_sale", s["main_teacher"]), pk["type"]) for pk in mine]
        options.append((s["course"], s["main_teacher"], None))
        if not any(
            (not p.get("course") or p["course"] == course)
            and (not p.get("main_teacher") or p["main_teacher"] == lead)
            and (not p.get("type") or p["type"] == typ)
            for course, lead, typ in options
        ):
            continue
        r = one(
            db,
            """SELECT max(l.day) latest,count(*) count FROM attendance r JOIN lessons l ON l.id=r.lesson
            WHERE r.student=? AND l.active=1 AND l.day<=? AND r.state='present' """,
            (s["id"], when),
        )
        info = {
            **s,
            **r,
            "package_courses": list(dict.fromkeys(pk["course"] for pk in mine)),
            "solo": sum(pk["remaining"] for pk in mine if pk["type"] == "solo"),
            "duo": sum(pk["remaining"] for pk in mine if pk["type"] == "duo"),
        }
        if a["role"] != "teacher":
            info["debt"] = sum(pk["debt"] for pk in mine if pk["student"] == s["id"])
            info["receipt_review"] = sum(pk["receipt_review"] or 0 for pk in mine if pk["student"] == s["id"])
        out.append(info)
    return out


def profile(db, a, p):
    sid = p.get("id")
    require(can_student(db, a, sid), "未授权访问该档案", 403)
    s = get(db, "students", sid)
    details = packs(db, a, {"student": sid})
    records = many(
        db,
        """SELECT l.id,l.day,l.clock,l.teacher,l.type,l.minutes,l.history,l.change_note,r.state,r.units,r.pack,r.value,r.status,
        r.content,r.next_focus,l.course FROM lessons l JOIN attendance r ON r.lesson=l.id WHERE r.student=? AND l.active=1 ORDER BY l.day DESC,l.clock DESC""",
        (sid,),
    )
    cash = []
    changes = []
    archived_cash = []
    historical_lessons = []
    if a["role"] != "teacher":
        cash = many(
            db,
            "SELECT c.* FROM cash c JOIN package_students m ON m.pack=c.pack WHERE m.student=? ORDER BY c.day DESC,c.rowid DESC",
            (sid,),
        )
        changes = many(
            db,
            """SELECT m.* FROM movements m JOIN package_students s ON s.pack=m.pack WHERE s.student=? ORDER BY m.day DESC,m.id DESC""",
            (sid,),
        )
        archived_cash = many(db, """SELECT h.id,h.day,h.kind,h.pack,h.amount,h.method
                FROM historical_cash h JOIN package_students m ON m.pack=h.pack
                WHERE m.student=? ORDER BY h.day,h.rowid""", (sid,))
        historical_lessons = many(db, """SELECT l.teacher,sum(r.units) units,
                CASE WHEN count(r.source_value)=count(*) THEN sum(r.source_value) END source_value,
                CASE WHEN count(f.source)=count(*) THEN sum(f.source) END source_fee
                FROM attendance r JOIN lessons l ON l.id=r.lesson
                LEFT JOIN fees f ON f.line=r.id AND f.status='history'
                WHERE r.student=? AND l.active=1 AND l.history=1
                GROUP BY l.teacher ORDER BY min(l.day),l.teacher""", (sid,))
    else:
        for r in records:
            if r["teacher"] != a["teacher"]:
                r.pop("value", None)
                r["id"] = None
    events = (
        many(db, "SELECT at,action,detail FROM audit WHERE ref=? ORDER BY id DESC", (sid,))
        if a["role"] != "teacher"
        else []
    )
    for event in events:
        info = json.loads(event["detail"])
        if event["action"] == "编辑学生":
            before = info["before"]
            after = info["after"]
            event["note"] = "、".join(
                f"{before[k]} → {after[k]}"
                for k in ("status", "main_teacher", "course", "name")
                if before[k] != after[k]
            )
            if before.get("substitute_teacher") != after.get("substitute_teacher"):
                substitute = after.get("substitute_teacher")
                note = "临时代课已取消" if not substitute else "临时代课为" + get(db, "teachers", substitute)["name"]
                event["note"] = "、".join(filter(None, (event["note"], note)))
        else:
            event["note"] = ""
        del event["detail"]
    return dict(student=s, packages=details, records=records, cash=cash, archived_cash=archived_cash,
                historical_lessons=historical_lessons, changes=changes, events=events)


def record(db, a, p):
    l = get(db, "lessons", p.get("id"))
    require(a["role"] != "teacher" or a["teacher"] == l["teacher"], "仅可查看本人的授课", 403)
    d = summary(db, l["id"])
    for r in d["lines"]:
        r["name"] = get(db, "students", r["student"])["name"]
    d["payables"] = many(
        db,
        """SELECT y.*,coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.payable=y.id),0) paid
                            FROM payables y WHERE y.lesson=?""",
        (l["id"],),
    )
    d["allocations"] = many(
        db,
        """SELECT p.id,p.day,p.method,a.payable,a.amount FROM allocations a
        JOIN payments p ON p.id=a.payment JOIN payables y ON y.id=a.payable WHERE y.lesson=? ORDER BY p.day,p.rowid""",
        (l["id"],),
    )
    d["versions"] = many(
        db, "SELECT id,day,active,change_note FROM lessons WHERE root=? ORDER BY rowid", (l["root"],)
    )
    if a["role"] != "teacher":
        d["payload"] = json.loads(l["payload"])
        d["dependencies"] = dependencies(db, l)
        d["evidence"] = many(
            db, "SELECT batch,row_key,status FROM batch_rows WHERE lesson=?", (l["id"],)
        )
    else:
        for r in d["lines"]:
            if not can_student(db, a, r["student"]):
                r["content"] = r["next_focus"] = ""
        d.pop("batch", None)
    return d


def ledger(db, a, p):
    start, end = period(p)
    tid = a["teacher"] if a["role"] == "teacher" else p.get("teacher")
    tags = [(k, p.get(k)) for k in ("type", "course") if p.get(k)]

    def scope(alias, teacher_col="teacher"):
        parts = ["1=1"]
        vals = []
        for k, v in ([(teacher_col, tid)] if tid else []) + tags:
            parts.append(f"{alias}.{k}=?")
            vals.append(v)
        return " AND ".join(parts), vals

    lesson_cond, lv = scope("l")
    lessons = many(
        db,
        f"""SELECT l.id,l.day,l.clock,l.teacher,l.course,l.type,l.minutes,l.taught,l.history,l.change_note,l.scene,
          (SELECT group_concat(s.name,'、') FROM attendance x JOIN students s ON s.id=x.student WHERE x.lesson=l.id) students,
          (SELECT count(*) FROM attendance x WHERE x.lesson=l.id AND x.state='present') present,
          (SELECT count(*) FROM attendance x WHERE x.lesson=l.id AND x.state='absent_charge') absent_count
          FROM lessons l WHERE l.active=1 AND l.day BETWEEN ? AND ? AND {lesson_cond} ORDER BY l.day,l.clock""",
        (start, end, *lv),
    )
    consumption = many(
        db,
        f"""SELECT m.id,m.pack,m.day,l.day taught_day,l.id lesson,l.teacher,l.type,l.course,
         r.student,-m.units units,-m.value amount,m.kind,m.reason FROM movements m JOIN lessons l ON m.lesson=l.id
         JOIN attendance r ON r.id=m.line WHERE m.kind IN ('use','use_reversal') AND m.day BETWEEN ? AND ? AND {lesson_cond}
         ORDER BY m.day,m.id""",
        (start, end, *lv),
    )
    fees = many(
        db,
        f"""SELECT f.*,l.day,l.teacher,l.type,l.course FROM fees f JOIN lessons l ON l.id=f.lesson
         WHERE l.active=1 AND l.day BETWEEN ? AND ? AND {lesson_cond} ORDER BY l.day,f.rowid""",
        (start, end, *lv),
    )
    pending_lines = many(
        db,
        f"""SELECT r.*,l.day,l.teacher,l.type,l.course FROM attendance r JOIN lessons l ON l.id=r.lesson
         WHERE l.active=1 AND r.status='pending' AND l.day BETWEEN ? AND ? AND {lesson_cond}""",
        (start, end, *lv),
    )
    # Opening payables have no lesson; the teacher field belongs to the payable.
    yfilter = " AND ".join((["y.teacher=?"] if tid else []) + [f"l.{k}=?" for k, v in tags]) or "1=1"
    yvalues = ([tid] if tid else []) + [v for k, v in tags]
    yall = many(
        db,
        f"""SELECT y.*,l.day taught_day,l.course,l.type,
        coalesce((SELECT sum(alloc.amount) FROM allocations alloc JOIN payments t ON t.id=alloc.payment
                  WHERE alloc.payable=y.id AND t.day<=?),0) paid
        FROM payables y LEFT JOIN lessons l ON l.id=y.lesson WHERE y.day<=? AND {yfilter} ORDER BY y.day,y.rowid""",
        (end, end, *yvalues),
    )
    earnings = [y for y in yall if y["day"] >= start and y["kind"] != "opening"]
    payments = many(
        db,
        f"""SELECT t.id,t.day,t.teacher,al.amount,t.method,y.id payable,y.lesson,y.settlement FROM allocations al
         JOIN payments t ON t.id=al.payment JOIN payables y ON y.id=al.payable LEFT JOIN lessons l ON l.id=y.lesson
         WHERE t.day BETWEEN ? AND ? AND {yfilter} ORDER BY t.day,t.rowid""",
        (start, end, *yvalues),
    )
    out = dict(
        start=start,
        end=end,
        lessons=lessons,
        consumption=consumption,
        fees=fees,
        earnings=earnings,
        pending_lines=pending_lines,
        payments=payments,
        payables=yall,
    )
    if a["role"] != "teacher":
        pack_cond, pv = scope("p", "main_at_sale")
        out["cash"] = many(
            db,
            f"""SELECT c.*,p.student,p.type,p.course FROM cash c JOIN packages p ON p.id=c.pack
             WHERE c.day BETWEEN ? AND ? AND {pack_cond} ORDER BY c.day,c.rowid""",
            (start, end, *pv),
        )
        out["retention"] = many(
            db,
            f"""SELECT r.*,l.teacher,l.type,l.course,r.value-r.earned amount FROM retention r
             JOIN lessons l ON l.id=r.lesson WHERE r.day BETWEEN ? AND ? AND {lesson_cond} ORDER BY r.day,r.id""",
            (start, end, *lv),
        )
        out["packages"] = packs(db, a, {**p, "asof": end})
    return out


def has_col(rows, key):
    return sum(r[key] for r in rows)


def report(db, a, p):
    if a["role"] == "teacher":
        p = {**p, "teacher": a["teacher"]}
    x = ledger(db, a, p)
    start, end = x["start"], x["end"]
    studied = [s for s in x["lessons"] if s["taught"]]
    stats = dict(
        scenes=len(studied),
        minutes=has_col(studied, "minutes"),
        present=has_col(studied, "present"),
        absent_count=has_col(x["lessons"], "absent_count"),
        value=has_col(x["consumption"], "amount"),
        earned=has_col(x["earnings"], "amount"),
        paid=has_col(x["earnings"], "paid"),
        actual_paid=has_col(x["payments"], "amount"),
        payable=sum(y["amount"] - y["paid"] for y in x["payables"]),
        pending_fees=sum(f["status"] == "pending" for f in x["fees"]),
        pending_values=len(x["pending_lines"]),
    )
    stats["unpaid"] = stats["earned"] - stats["paid"]
    if "cash" in x:
        stats.update(
            receipts=sum(r["amount"] for r in x["cash"] if r["kind"] == "receipt"),
            refunds=-sum(r["amount"] for r in x["cash"] if r["kind"] == "refund"),
            net=has_col(x["cash"], "amount"),
            retained=has_col(x["retention"], "amount"),
            remaining_value=has_col(x["packages"], "remaining_value"),
            debt=has_col(x["packages"], "debt"),
        )
    tids = [t for t in teachers(db, a) if not p.get("teacher") or t["id"] == p["teacher"]]
    compare = []
    for t in tids:
        key = t["id"]
        ss = [s for s in studied if s["teacher"] == key]
        compare.append(
            dict(
                id=key,
                name=t["name"],
                pending_fees=sum(f["teacher"] == key and f["status"] == "pending" for f in x["fees"]),
                pending_values=sum(r["teacher"] == key for r in x["pending_lines"]),
                audience=t["audience"],
                scenes=len(ss),
                minutes=has_col(ss, "minutes"),
                present=has_col(ss, "present"),
                absent_count=sum(l["absent_count"] for l in x["lessons"] if l["teacher"] == key),
                units=sum(v["units"] for v in x["consumption"] if v["teacher"] == key),
                value=sum(v["amount"] for v in x["consumption"] if v["teacher"] == key),
                earned=sum(y["amount"] for y in x["earnings"] if y["teacher"] == key),
            )
        )
    comp = []
    for typ in ("solo", "duo"):
        used = [c for c in x["consumption"] if c["type"] == typ]
        cnt = has_col(used, "units")
        d = dict(
            type=typ,
            scenes=sum(s["type"] == typ for s in studied),
            units=cnt,
            value=has_col(used, "amount"),
            use_avg=rounded(has_col(used, "amount") * 1000, cnt) if cnt > 0 else None,
        )
        if "packages" in x:
            pk = [v for v in x["packages"] if v["type"] == typ]
            buys = [
                v
                for v in pk
                if not v["opening"]
                and start <= v["since"] <= end
                and one(db, "SELECT 1 FROM movements WHERE pack=? AND kind='purchase'", (v["id"],))
            ]
            qty = sum(v["paid_units"] + v["gift_units"] for v in buys)
            d.update(
                remaining=has_col(pk, "remaining"),
                buy_avg=rounded(has_col(buys, "price") * 1000, qty) if qty else None,
            )
        comp.append(d)
    months = (
        p.get("period") in ("quarter", "year")
        or (date.fromisoformat(end) - date.fromisoformat(start)).days > 70
    )
    buckets = {}
    cursor = date.fromisoformat(start)
    while cursor <= date.fromisoformat(end):
        dt = cursor.isoformat()
        bucket = dt[:7] if months else dt
        first = buckets.setdefault(bucket, dict(label=bucket, start=dt, end=dt, scenes=0, value=0))
        if "cash" in x:
            first["net"] = 0
        first["end"] = dt
        cursor += timedelta(days=1)
    for metric, rows, col in [
        ("scenes", studied, None),
        ("value", x["consumption"], "amount"),
        ("net", x.get("cash", []), "amount"),
    ]:
        for r in rows:
            buckets[r["day"][:7] if months else r["day"]][metric] += r[col] if col else 1
    low = int(cfg(db, "low"))
    idle = int(cfg(db, "idle"))
    alerts = []
    alert_packs = x.get("packages") if "packages" in x else packs(db, a, {"asof": end})
    for s in student_list(
        db,
        a,
        {
            "asof": end,
            "status": "在读",
            "main_teacher": p.get("teacher"),
            "course": p.get("course"),
            "type": p.get("type"),
        },
    ):
        kinds = {k["type"] for k in alert_packs if s["id"] in k["member_ids"]}
        if not kinds and s["solo"] == s["duo"] == 0:
            alerts.append(dict(kind="low", id=s["id"], name=s["name"], text="暂无可用课时"))
        for typ in kinds:
            if s[typ] <= low * 1000:
                alerts.append(
                    dict(
                        kind="low",
                        id=s["id"],
                        name=s["name"],
                        text=("一对一" if typ == "solo" else "一对二")
                        + " 剩 "
                        + quantity(s[typ])
                        + " 次",
                    )
                )
        last_known = s["latest"] or s["enrolled"]
        if last_known and (date.fromisoformat(end) - date.fromisoformat(last_known)).days >= idle:
            alerts.append(
                dict(
                    kind="idle",
                    id=s["id"],
                    name=s["name"],
                    text="最近上课 " + (s["latest"] or "暂无记录"),
                )
            )
    issues = (
        one(db, "SELECT count(*) n FROM batch_rows WHERE status IN ('issue','revision')")["n"]
        if a["role"] != "teacher"
        else 0
    )
    return dict(
        start=start,
        end=end,
        stats=stats,
        compare=compare,
        trend=list(buckets.values()),
        composition=comp,
        alerts=alerts,
        issues=issues,
    )


def details(db, a, p):
    kind = p.get("kind", "lessons")
    if kind == "historical_cash":
        admin(a)
        return {
            "kind": kind,
            "start": "",
            "end": "",
            "rows": many(db, "SELECT * FROM historical_cash ORDER BY day DESC"),
        }
    x = ledger(db, a, p)
    require(kind in x and isinstance(x[kind], list), "无权查询此类明细", 403)
    data = x[kind]
    if p.get("state") == "pending":
        data = [r for r in data if r.get("status") == "pending"]
    if p.get("only") == "taught":
        data = [r for r in data if r.get("taught")]
    if kind == "lessons" and p.get("include_versions") == "1":
        staff = a["teacher"] if a["role"] == "teacher" else p.get("teacher")
        old = many(
            db,
            "SELECT * FROM lessons WHERE active=0 AND day BETWEEN ? AND ? ORDER BY day,clock",
            (x["start"], x["end"]),
        )
        for l in old:
            if (not staff or l["teacher"] == staff) and all(
                not p.get(k) or p[k] == l[k] for k in ("type", "course")
            ):
                data.append(
                    {
                        k: l[k]
                        for k in (
                            "id",
                            "day",
                            "teacher",
                            "type",
                            "minutes",
                            "taught",
                            "scene",
                            "course",
                            "history",
                            "clock",
                            "active",
                            "change_note",
                        )
                    }
                )
        data.sort(key=lambda r: (r["day"], r["clock"]))
    if kind == "cash" and p.get("flow") in ("receipts", "refunds"):
        data = [r for r in data if r["kind"] == ("receipt" if p["flow"] == "receipts" else "refund")]
    if kind == "packages" and p.get("flow") == "debt":
        data = [r for r in data if r["debt"] > 0]
    if p.get("pack"):
        data = [
            r
            for r in data
            if r.get("pack") == p["pack"] or (kind == "packages" and r["id"] == p["pack"])
        ]
    if p.get("student") and kind != "packages":
        data = [r for r in data if r.get("student") == p["student"]]
    return {"kind": kind, "rows": data, "start": x["start"], "end": x["end"]}


def batch_info(db, a, p):
    admin(a)
    b = one(
        db,
        """SELECT b.*,f.name FROM batches b JOIN files f ON f.id=b.file WHERE b.id=?""",
        (p.get("id"),),
    )
    require(b, "批次不存在", 404)
    for k in ("definition", "overrides", "result"):
        b[k] = json.loads(b[k]) if b[k] else None
    b["versions"] = many(
        db, "SELECT id,actor,at,action FROM batch_versions WHERE batch=? ORDER BY id", (b["id"],)
    )
    return b


def batch_list(db, a, p):
    admin(a)
    return many(
        db,
        """SELECT b.id,b.created,b.actor,b.sheet,f.name,b.result IS NOT NULL confirmed
        FROM batches b JOIN files f ON f.id=b.file ORDER BY b.rowid DESC""",
    )


def batch_totals(db, a, p):
    admin(a)
    bid = p.get("id")
    require(one(db, "SELECT id FROM batches WHERE id=?", (bid,)), "批次不存在", 404)
    return one(
        db,
        """WITH active AS (
               SELECT id,taught,minutes FROM lessons WHERE batch=? AND active=1
           ), lines AS (
               SELECT r.* FROM attendance r JOIN active l ON l.id=r.lesson
           ), charges AS (
               SELECT f.* FROM fees f JOIN active l ON l.id=f.lesson
           )
           SELECT coalesce(sum(taught),0) scenes, coalesce(sum(taught*minutes),0) minutes,
               (SELECT count(*) FROM lines) students,
               (SELECT coalesce(sum(units),0) FROM lines WHERE status='ok') units,
               (SELECT coalesce(sum(value),0) FROM lines WHERE status='ok') value,
               (SELECT count(*) FROM lines WHERE status='pending') pending_lines,
               (SELECT coalesce(sum(final),0) FROM charges WHERE status='ok') earned,
               (SELECT count(*) FROM charges WHERE status='pending') pending,
               (SELECT coalesce(sum(r.value-r.earned),0) FROM retention r JOIN active l ON l.id=r.lesson) retained
           FROM active""",
        (bid,),
    )


def bills(db, a, p):
    qry = "WHERE teacher=?" if a["role"] == "teacher" or p.get("teacher") else ""
    vals = (a["teacher"] if a["role"] == "teacher" else p["teacher"],) if qry else ()
    out = many(db, "SELECT * FROM settlements " + qry + " ORDER BY day DESC,rowid DESC", vals)
    for r in out:
        r["snapshot"] = json.loads(r["snapshot"])
    return out


# Column labels and stored units are identical across detail drill-downs and exports.
MONEY_KEYS = {
    "amount",
    "earned",
    "price",
    "remaining_value",
    "debt",
    "value",
    "net_cash",
    "average",
    "source",
    "calculated",
    "final",
    "difference",
    "paid",
    "contract",
    "source_value",
    "source_unit",
    "source_fee",
    "system_fee",
    "original_price",
    "receipt_review",
}
UNIT_KEYS = {"units", "paid_units", "gift_units", "remaining", "used", "solo", "duo", "original_units", "total_units", "historical_used"}
LABELS = dict(
    original_price="原合同成交金额",
    original_units="原合同总次数",
    total_units="课包总次数（含赠课）",
    historical_used="期初前已登记扣课次数",
    id="系统编号",
    teacher="实际老师编号",
    day="业务日期",
    clock="开始时间",
    type="课型",
    scene="场次编号",
    course="课程",
    minutes="分钟",
    history="已含期初",
    students="学生",
    student="学生编号",
    student_name="学生姓名",
    name="姓名",
    role="身份",
    pack="课包编号",
    lesson="授课编号",
    units="扣课数量",
    amount="金额",
    value="消课价值",
    earned="确认课酬",
    paid="已分配付款",
    state="出勤",
    status="状态",
    kind="类型",
    source="原表课酬",
    calculated="系统课酬",
    difference="差额",
    final="最终课酬",
    remaining="剩余次数",
    remaining_value="剩余价值",
    debt="欠费",
    paid_units="购买次数",
    gift_units="赠送次数",
    used="已用次数",
    price="成交金额",
    source_record="原始记录编号",
    system_fee="系统课酬",
    bp="分成万分比",
    rule="规则版本",
    source_value="原表消课金额",
    source_unit="原表单价",
    source_fee="原表课酬",
    reason="原因",
    settlement="结算单",
    present="到课人数",
    method="方式",
    source_values="原始课酬各行值（分）",
    reviewer="确认人",
    reviewed="确认时间",
    taught_day="实际授课日",
    row_key="原始行号",
    batch="批次",
    message="说明",
    reference="来源",
    content="本节内容",
    next_focus="下次重点",
)


LABELS.update(
    member_ids="课包适用学员编号",
    package_courses="课包科目",
    receipt_review="纸卡收款待核",
    split_unknown="正课与赠课未分列",
    main_teacher="主带老师",
    main_at_sale="购课时主带老师",
    category="学生类别",
    contact="联系方式",
    enrolled="入学日期",
    latest="最近上课",
    count="已知上课次数",
    solo="一对一余额",
    duo="一对二余额",
    until_day="有效期截止",
    since="开始日期",
    opening="期初课包",
    note="备注",
    net_cash="累计净收",
    average="有效均价",
    scope="课酬口径",
    line="学生授课行",
    requested_pack="原指定课包",
    explanation="核对说明",
    related="关联原应付",
    contract="合同变动",
    actor="操作人",
    payable="应付编号",
    change_note="最近更正",
    taught="实授",
    absent_count="缺席扣课人次",
    active="当前有效版本",
    at="操作时间",
    action="操作",
    ref="对象编号",
    detail="详情",
    version="版本日期",
    purchased_used="本次使用购买权益",
    gift_used="本次使用赠课权益",
)


def export(db, a, p):
    admin(a)
    kind = p.get("kind", "lessons")
    if kind == "students":
        data = student_list(db, a, {**p, "asof": p.get("asof") or period(p)[1]})
    elif kind == "issues":
        data = []
        for r in many(
            db,
            "SELECT * FROM batch_rows WHERE (CAST(? AS TEXT) IS NULL OR batch=?) ORDER BY batch,rowid",
            (p.get("batch"), p.get("batch")),
        ):
            ev = json.loads(r.pop("evidence"))
            reason = ev.get("message", "")
            pending = False
            if r.get("lesson") and r["status"] == "posted":
                current = one(
                    db,
                    "SELECT id FROM lessons WHERE root=(SELECT root FROM lessons WHERE id=?) AND active=1",
                    (r["lesson"],),
                )
                if current:
                    fs = many(
                        db,
                        "SELECT reason FROM fees WHERE lesson=? AND status='pending'",
                        (current["id"],),
                    )
                    pending = bool(fs)
                    reason = " / ".join(f["reason"] for f in fs)
            if r["status"] in ("issue", "revision") or pending:
                data.append({**r, "message": reason, "reference": ev.get("raw")})
    elif kind == "attendance":
        data = []
        lesson_filters = {k: v for k, v in p.items() if k not in ("student", "pack")}
        for l in details(db, a, {**lesson_filters, "kind": "lessons"})["rows"]:
            for r in many(db, "SELECT * FROM attendance WHERE lesson=?", (l["id"],)):
                if any(p.get(k) and r[k] != p[k] for k in ("student", "pack")):
                    continue
                data.append(
                    dict(
                        day=l["day"],
                        clock=l["clock"],
                        teacher=l["teacher"],
                        course=l["course"],
                        type=l["type"],
                        scene=l["scene"] or l["id"],
                        **r,
                    )
                )
    elif kind == "bill":
        b = get(db, "settlements", p.get("id"))
        snap = json.loads(b["snapshot"])
        data = [
            {**r, "settlement": b["id"], "version": b["day"], "status": "已纳入"} for r in snap["items"]
        ]
        data += [
            {**r, "settlement": b["id"], "version": b["day"], "status": "待核未纳入"}
            for r in snap["excluded"]
        ]
    elif kind == "audit":
        data = many(db, "SELECT * FROM audit ORDER BY id")
    else:
        data = details(db, a, p)["rows"]
    keys = list(dict.fromkeys(k for r in data for k in r)) or ["id"]
    f = io.StringIO(newline="")
    w = csv.writer(f)
    w.writerow([LABELS.get(k, k) + ("（元）" if k in MONEY_KEYS else "") for k in keys])
    for r in data:
        line = []
        for k in keys:
            v = r.get(k)
            if r.get("split_unknown") and k in ("paid_units", "gift_units"):
                v = None
            if v is not None and k in MONEY_KEYS:
                v = yuan(v)
            elif v is not None and k in UNIT_KEYS:
                v = quantity(v)
            elif isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False)
            if (
                isinstance(v, str)
                and v.lstrip().startswith(("=", "+", "-", "@"))
                and k not in MONEY_KEYS | UNIT_KEYS
            ):
                v = "'" + v
            line.append(v)
        w.writerow(line)
    return {
        "filename": f"{kind}-{p.get('id') or p.get('end') or today()}.csv",
        "text": "\ufeff" + f.getvalue(),
        "count": len(data),
    }
