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


def period(p, db=None):
    anchor = date.fromisoformat(day(p.get("anchor") or today()))
    scale = p.get("period", "month")
    if p.get("start") or p.get("end") or scale == "custom":
        first, last = day(p.get("start")), day(p.get("end"))
    elif scale == "all":
        first = one(db, """SELECT min(d) AS first FROM (
            SELECT min(day) d FROM lessons UNION ALL SELECT min(since) FROM packages
            UNION ALL SELECT min(day) FROM movements UNION ALL SELECT min(day) FROM cash
            UNION ALL SELECT min(day) FROM payables UNION ALL SELECT min(day) FROM payments
            UNION ALL SELECT min(day) FROM historical_cash UNION ALL SELECT min(day) FROM settlements
            UNION ALL SELECT min(nullif(enrolled,'')) FROM students
        )""")["first"]
        last = min(anchor.isoformat(), today())
        first = min(first or last, last)
    elif scale == "last_month":
        end = anchor.replace(day=1) - timedelta(days=1)
        first, last = end.replace(day=1).isoformat(), end.isoformat()
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


def data_updated(db):
    return one(db, """SELECT max(at) updated FROM audit WHERE action NOT IN
        ('网页登录','创建网页账号','修改密码','重置密码')""")["updated"]


def teachers(db, a):
    sql = """SELECT t.*,coalesce(c.value,'') audience,
             EXISTS(SELECT 1 FROM config h WHERE h.key='studio_income_teacher' AND h.value=t.id) income_to_studio
             FROM teachers t
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
            """SELECT coalesce(-sum(units),0) n, coalesce(-sum(value),0) value FROM movements
               WHERE pack=? AND day<=? AND kind IN ('use','use_reversal')""",
            (pk["id"], when),
        )
        prior_units = prior_value = 0
        if pk["opening"] and pk["original_units"] is not None:
            prior_units = pk["original_units"] - pk["paid_units"] - pk["gift_units"]
            prior_value = pk["original_price"] - pk["price"]
        used_units = spent["n"] + prior_units
        used_value = spent["value"] + prior_value
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
            used=spent["n"],
            progress_used=used_units, progress_total=used_units + b["units"],
            consumed_value=used_value, portfolio_value=used_value + b["value"],
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
                    "historical_used", "progress_used", "progress_total",
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
    low, idle = int(cfg(db, "low")) * 1000, int(cfg(db, "idle"))
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
            "shared_package": any(len(pk["member_ids"]) > 1 for pk in mine),
            "solo": sum(pk["remaining"] for pk in mine if pk["type"] == "solo"),
            "duo": sum(pk["remaining"] for pk in mine if pk["type"] == "duo"),
        }
        info["progress_used"] = sum(pk["progress_used"] for pk in mine)
        info["progress_total"] = sum(pk["progress_total"] for pk in mine)
        needs = []
        remainder = info["solo"] + info["duo"]
        if s["status"] == "待确认":
            needs.append("unknown")
        if s["status"] == "在读":
            if not mine or any(sum(pk["remaining"] for pk in mine if pk["type"] == typ) <= low
                               for typ in {pk["type"] for pk in mine}):
                needs.append("low")
            last = r["latest"] or s["enrolled"]
            if last and (date.fromisoformat(when) - date.fromisoformat(last)).days >= idle:
                needs.append("idle")
        info["follow"] = needs
        if p.get("follow") and p["follow"] not in needs:
            continue
        rem = p.get("balance")
        if (rem == "zero" and remainder != 0) or (rem == "low" and not 0 < remainder <= low) or (rem == "above" and remainder <= low):
            continue
        if a["role"] != "teacher":
            info["debt"] = sum(pk["debt"] for pk in mine if pk["student"] == s["id"])
            info["receipt_review"] = sum(pk["receipt_review"] or 0 for pk in mine if pk["student"] == s["id"])
            info["receipts_complete"] = bool(mine) and all(
                not pk["opening"] and pk["receipt_review"] is None and pk["debt"] == 0
                and pk["price"] > 0 and pk["net_cash"] == pk["price"] for pk in mine
            )
        out.append(info)
    if p.get("sort") == "balance":
        out.sort(key=lambda s: (s["solo"] + s["duo"], s["name"], s["id"]))
    elif p.get("sort") == "latest":
        out.sort(key=lambda s: s["latest"] or "", reverse=True)
    return out


def profile(db, a, p):
    sid = p.get("id")
    require(can_student(db, a, sid), "未授权访问该档案", 403)
    s = get(db, "students", sid)
    when = day(p.get("asof") or today())
    details = packs(db, a, {"student": sid, "asof": when})
    records = many(
        db,
        """SELECT l.id,l.day,l.clock,l.teacher,l.type,l.minutes,l.history,l.change_note,r.state,r.units,r.pack,r.value,r.status,
        r.content,r.next_focus,l.course,coalesce(pk.main_at_sale,s.main_teacher) main_teacher
        FROM lessons l JOIN attendance r ON r.lesson=l.id JOIN students s ON s.id=r.student
        LEFT JOIN packages pk ON pk.id=r.pack WHERE r.student=? AND l.active=1 AND l.day<=?
        ORDER BY l.day DESC,l.clock DESC,l.rowid DESC""", (sid, when),
    )
    cash = []
    changes = []
    archived_cash = []
    historical_lessons = []
    if a["role"] != "teacher":
        cash = many(
            db,
            "SELECT c.* FROM cash c JOIN package_students m ON m.pack=c.pack WHERE m.student=? AND c.day<=? ORDER BY c.day DESC,c.rowid DESC",
            (sid, when),
        )
        changes = many(
            db,
            """SELECT m.* FROM movements m JOIN package_students s ON s.pack=m.pack WHERE s.student=? AND m.day<=? ORDER BY m.day DESC,m.id DESC""",
            (sid, when),
        )
        archived_cash = many(db, """SELECT h.id,h.day,h.kind,h.pack,h.amount,h.method
                FROM historical_cash h JOIN package_students m ON m.pack=h.pack
                WHERE m.student=? AND h.day<=? ORDER BY h.day,h.rowid""", (sid, when))
        historical_lessons = many(db, """SELECT l.teacher,sum(r.units) units,
                CASE WHEN count(r.source_value)=count(*) THEN sum(r.source_value) END source_value,
                CASE WHEN count(f.source)=count(*) THEN sum(f.source) END source_fee
                FROM attendance r JOIN lessons l ON l.id=r.lesson
                LEFT JOIN fees f ON f.line=r.id AND f.status='history'
                WHERE r.student=? AND l.active=1 AND l.history=1 AND l.day<=?
                GROUP BY l.teacher ORDER BY min(l.day),l.teacher""", (sid, when))
    else:
        for r in records:
            if r["teacher"] != a["teacher"]:
                r.pop("value", None)
                r["id"] = None
    events = (
        many(db, "SELECT at,action,detail FROM audit WHERE ref=? AND substr(at,1,10)<=? ORDER BY id DESC", (sid, when))
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
    return dict(asof=when, student=s, packages=details, records=records, cash=cash, archived_cash=archived_cash,
                historical_lessons=historical_lessons, changes=changes, events=events)


def record(db, a, p):
    l = get(db, "lessons", p.get("id"))
    require(a["role"] != "teacher" or a["teacher"] == l["teacher"], "仅可查看本人的授课", 403)
    d = summary(db, l["id"])
    for r in d["lines"]:
        student = get(db, "students", r["student"])
        r["name"] = student["name"]
        r["main_teacher"] = get(db, "packages", r["pack"])["main_at_sale"] if r["pack"] else student["main_teacher"]
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


def lesson_income(db, start, end, lesson_filter, params):
    """Attach a fee once to its first consumption, and reverse it with the same lesson."""
    rows = many(db, f"""
        WITH fee_groups AS (
            SELECT f.id fee,f.line,f.lesson,l.teacher,l.course,l.type,l.day taught_day,l.booked,
                   coalesce(f.final,f.calculated) cost,
                   CASE WHEN f.status='studio' THEN '全额归琴行' WHEN f.final IS NOT NULL THEN '已核定'
                        WHEN f.calculated IS NOT NULL THEN '参考课酬' ELSE '待核' END basis
            FROM lessons l JOIN fees f ON f.lesson=l.id
            WHERE l.history=0 AND {lesson_filter}
        ), posted AS (
            SELECT g.fee,m.day,m.kind,-sum(m.value) value
            FROM movements m JOIN fee_groups g ON g.lesson=m.lesson AND (g.line IS NULL OR g.line=m.line)
            WHERE m.kind IN ('use','use_reversal')
            GROUP BY g.fee,m.day,m.kind
        ), events AS (
            SELECT * FROM posted
            UNION ALL
            SELECT g.fee,g.booked,'use',0 FROM fee_groups g
            WHERE g.cost<>0 AND NOT EXISTS (SELECT 1 FROM posted p WHERE p.fee=g.fee AND p.kind='use')
            UNION ALL
            SELECT g.fee,y.day,'use_reversal',0 FROM payables y JOIN fee_groups g ON g.fee=y.fee
            WHERE y.kind='correction' AND y.amount<>0
              AND NOT EXISTS (SELECT 1 FROM posted p WHERE p.fee=g.fee AND p.kind='use_reversal')
        ), ranked AS (
            SELECT e.*,row_number() OVER (PARTITION BY fee,kind ORDER BY day) seq FROM events e
        )
        SELECT e.day,g.taught_day,g.lesson,g.fee,g.teacher,g.course,g.type,a.student,a.pack,
               coalesce(s.name,(SELECT group_concat(st.name,'、') FROM attendance att JOIN students st
                   ON att.student=st.id WHERE att.lesson=g.lesson)) students,
               e.kind,e.value,CASE WHEN e.seq>1 THEN 0 WHEN e.kind='use_reversal' THEN -g.cost
                    ELSE g.cost END teacher_fee,
               CASE WHEN e.seq>1 THEN '已计入同节课' ELSE g.basis END fee_basis
        FROM ranked e JOIN fee_groups g ON g.fee=e.fee
        LEFT JOIN attendance a ON a.id=g.line LEFT JOIN students s ON s.id=a.student
        WHERE e.day BETWEEN ? AND ? ORDER BY e.day,g.taught_day,g.lesson,g.fee,e.kind
        """, (*params, start, end))
    for row in rows:
        cost = row["teacher_fee"]
        row["amount"] = row["value"] - cost if cost is not None else None
    return rows


def income_totals(rows):
    gross = sum(row["value"] for row in rows)
    fees = sum(row["teacher_fee"] for row in rows if row["teacher_fee"] is not None)
    # Both sides of a withdrawn estimate cancel when they fall in the same period.
    counts = {"待核": {}, "参考课酬": {}}
    for row in rows:
        count = counts.get(row["fee_basis"])
        if count is not None:
            fee = row["fee"]
            count[fee] = count.get(fee, 0) + (1 if row["kind"] == "use" else -1)
    missing = sum(n != 0 for n in counts["待核"].values())
    return dict(income_value=gross, lesson_fees=None if missing else fees,
                studio_income=None if missing else gross - fees, income_missing=missing,
                income_estimated=sum(n != 0 for n in counts["参考课酬"].values()))


def ledger(db, a, p):
    start, end = period(p, db)
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
          CASE WHEN l.history=1 THEN 'history' WHEN EXISTS(SELECT 1 FROM batches b WHERE b.id=l.batch AND b.namespace LIKE '%纸卡%') THEN 'paper'
               WHEN l.batch IS NOT NULL THEN 'import' ELSE 'manual' END origin,
          EXISTS(SELECT 1 FROM fees f WHERE f.lesson=l.id AND f.status='pending') fee_pending,
          EXISTS(SELECT 1 FROM attendance at WHERE at.lesson=l.id AND at.status='pending') line_pending,
          (SELECT group_concat(s.name,'、') FROM attendance x JOIN students s ON s.id=x.student WHERE x.lesson=l.id) students,
          (SELECT count(*) FROM attendance x WHERE x.lesson=l.id AND x.state='present') present,
          (SELECT count(*) FROM attendance x WHERE x.lesson=l.id AND x.state='absent_charge') absent_count,
          EXISTS(SELECT 1 FROM attendance x JOIN students s ON s.id=x.student
                 LEFT JOIN packages pk ON pk.id=x.pack WHERE x.lesson=l.id
                 AND coalesce(pk.main_at_sale,s.main_teacher)<>l.teacher) substitute
          FROM lessons l WHERE l.active=1 AND l.day BETWEEN ? AND ? AND {lesson_cond} ORDER BY l.day,l.clock,l.rowid""",
        (start, end, *lv),
    )
    consumption = many(
        db,
        f"""SELECT m.id,m.pack,m.day,l.day taught_day,l.id lesson,l.teacher,l.type,l.course,
         r.student,s.name student_name,-m.units units,-m.value amount,m.kind,m.reason FROM movements m JOIN lessons l ON m.lesson=l.id
         JOIN attendance r ON r.id=m.line JOIN students s ON s.id=r.student WHERE m.kind IN ('use','use_reversal') AND m.day BETWEEN ? AND ? AND {lesson_cond}
         ORDER BY m.day,m.id""",
        (start, end, *lv),
    )
    fees = many(
        db,
        f"""SELECT f.*,l.day,l.teacher,l.type,l.course,
         (SELECT group_concat(s.name,'、') FROM attendance x JOIN students s ON x.student=s.id
          WHERE x.lesson=l.id AND (f.line IS NULL OR f.line=x.id)) students,
         (SELECT x.pack FROM attendance x WHERE x.id=f.line) pack
         FROM fees f JOIN lessons l ON l.id=f.lesson
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
            f"""SELECT c.*,p.student,s.name student_name,p.main_at_sale teacher,p.type,p.course FROM cash c JOIN packages p ON p.id=c.pack JOIN students s ON s.id=p.student
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
        # Historical vouchers are real dated cash flows. Opening balances carry no new cash.
        archived = many(db, """SELECT h.id,h.day,h.kind,h.pack,h.method,h.reason,p.student,s.name student_name,
                         coalesce(h.teacher,p.main_at_sale) teacher,p.type,p.course,
                         CASE WHEN h.kind='receipt' THEN h.amount ELSE -h.amount END amount
                         FROM historical_cash h LEFT JOIN packages p ON p.id=h.pack
                         LEFT JOIN students s ON s.id=p.student WHERE h.day BETWEEN ? AND ?""", (start, end))
        income = [{**row, "origin": "学费流水"} for row in out["cash"]]
        income.extend({**row, "kind": "payment", "amount": -row["amount"], "origin": "课酬付款"}
                      for row in payments)
        income.extend({**row, "origin": "期初前收付凭证"} for row in archived
                      if (not tid or row["teacher"] == tid) and all(row[k] == v for k, v in tags))
        out["cashflow"] = sorted(income, key=lambda row: (row["day"], row["id"]))
        if not p.get("kind") or p["kind"] == "studio_income":
            out["studio_income"] = lesson_income(db, start, end, lesson_cond, lv)
    return out


def has_col(rows, key):
    return sum(r[key] for r in rows)


def reference_totals(fees):
    # Booked payables and actual payments have their own dates and never enter this estimate.
    eligible = [f for f in fees if f["status"] not in ("history", "studio")]
    known = [f for f in eligible if f["calculated"] is not None]
    pending = [f for f in known if f["status"] == "pending"]
    return dict(
        verified_fees=sum(f["final"] for f in eligible if f["final"] is not None),
        reference_pay=sum(f["calculated"] for f in known),
        reference_missing=len(eligible) - len(known),
        reference_count=len(known),
        pending_reference=sum(f["calculated"] for f in pending),
        pending_reference_count=len(pending),
    )


def comparison_period(p, start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    scale = p.get("period", "month")
    if scale == "all" or (last - first).days > 731:
        return None
    prev_end = first - timedelta(days=1)
    if p.get("start") or p.get("end") or scale in ("custom", "week"):
        days = 7 if scale == "week" and not p.get("start") else (last - first).days + 1
        prev_start = first - timedelta(days=days)
    else:
        months = {"year":12, "quarter":3, "month":1, "last_month":1}.get(scale, 1)
        y, m = divmod(first.year * 12 + first.month - 1 - months, 12)
        prev_start = date(y, m + 1, 1)
    # A finished calendar period is compared to the entire previous period.
    if scale == "week":
        complete = last.weekday() == 6
    elif scale in ("month", "quarter", "year", "last_month") and not p.get("start"):
        complete = last.day == calendar.monthrange(last.year,last.month)[1] and (
            scale not in ("quarter","year") or last.month % (3 if scale == "quarter" else 12) == 0)
    else:
        complete = True
    if not complete:
        prev_end = min(prev_end, prev_start + (last-first))
    return prev_start.isoformat(), prev_end.isoformat()


def comparable_activity(db, a, p, current, stats):
    pair = comparison_period(p, current["start"], current["end"])
    if pair is None:
        return None
    start,end = pair
    previous = ledger(db,a,{**p,"start":start,"end":end,"kind":"studio_income"})
    comparable = {}
    def add(key, now, before, observed):
        if observed and before > 0:
            comparable[key] = {"previous":before, "change":(now-before)/before}
    studied = [l for l in previous["lessons"] if l["taught"]]
    if studied and stats["scenes"]:
        # Exclude the month/week in which this teaching scope first appears in the ledger.
        staff = a["teacher"] if a["role"] == "teacher" else p.get("teacher") or ""
        earlier = one(db, """SELECT 1 recorded FROM lessons WHERE day<=? AND active=1 AND taught=1
            AND (?='' OR teacher=?) AND (?='' OR course=?) AND (?='' OR type=?) LIMIT 1""",
            (start,staff,staff,p.get("course") or "",p.get("course") or "",p.get("type") or "",p.get("type") or ""))
        add("scenes",stats["scenes"],len(studied),earlier)
        add("value",stats["value"],has_col(previous["consumption"],"amount"),earlier and current["consumption"])
        if earlier and "studio_income" in current:
            prev = income_totals(previous["studio_income"])
            if prev["studio_income"] is not None and stats["studio_income"] is not None and bool(stats["income_estimated"]) == bool(prev["income_estimated"]):
                add("studio_income",stats["studio_income"],prev["studio_income"],current["studio_income"])
    if "cashflow" in current:
        paid = [v for v in previous["cashflow"] if v["kind"]=="receipt"]
        # A dated receipt in the prior window is a cash comparator only if the book covers its start.
        inception = one(db,"SELECT min(day) first FROM (SELECT day FROM cash UNION ALL SELECT day FROM historical_cash)")["first"]
        add("income_receipts",stats["income_receipts"],has_col(paid,"amount"),inception and inception<=start and stats["income_receipts"]>0)
    return {"start":start,"end":end,"metrics":comparable} if comparable else None


def report(db, a, p):
    if a["role"] == "teacher":
        p = {**p, "teacher": a["teacher"]}
    x = ledger(db, a, {**p, "kind": "studio_income"})
    start, end = x["start"], x["end"]
    studied = [s for s in x["lessons"] if s["taught"]]
    stats = dict(
        scenes=len(studied),
        substitutes=has_col(studied, "substitute"),
        earned_entries=len(x["earnings"]),
        payment_entries=len(x["payments"]),
        **reference_totals(x["fees"]),
        minutes=has_col(studied, "minutes"),
        present=has_col(studied, "present"),
        absent_count=has_col(x["lessons"], "absent_count"),
        used_units=has_col(x["consumption"], "units"),
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
        income = x["cashflow"]
        issued = -sum(r["amount"] for r in income if r["kind"] == "payment")
        stats.update(
            **income_totals(x["studio_income"]),
            income_receipts=sum(r["amount"] for r in income if r["kind"] == "receipt"),
            income_refunds=-sum(r["amount"] for r in income if r["kind"] == "refund"),
            income_paid=issued,
            teaching_after_paid=stats["value"] - issued,
            receipts=sum(r["amount"] for r in x["cash"] if r["kind"] == "receipt"),
            refunds=-sum(r["amount"] for r in x["cash"] if r["kind"] == "refund"),
            net=has_col(x["cash"], "amount"),
            retained=has_col(x["retention"], "amount"),
            remaining_value=has_col(x["packages"], "remaining_value"),
            debt=has_col(x["packages"], "debt"),
            packages=len(x["packages"]),
            package_used=has_col(x["packages"], "progress_used"), package_total=has_col(x["packages"], "progress_total"),
            package_consumed=has_col(x["packages"], "consumed_value"), package_value=has_col(x["packages"], "portfolio_value"),
            opening_limited=sum(bool(pk["opening"] and pk["original_units"] is None) for pk in x["packages"]),
            remaining=has_col(x["packages"], "remaining"),
            registered=sum(pk["price"] for pk in x["packages"] if not pk["opening"] and pk["since"] >= start),
            receipt_review=sum(pk["receipt_review"] or 0 for pk in x["packages"]),
        )
    tids = [t for t in teachers(db, a) if not p.get("teacher") or t["id"] == p["teacher"]]
    presence = many(db, """SELECT DISTINCT l.teacher,r.student FROM lessons l JOIN attendance r ON r.lesson=l.id
        WHERE l.active=1 AND l.taught=1 AND l.day BETWEEN ? AND ? AND r.state='present'
          AND (?='' OR l.teacher=?) AND (?='' OR l.course=?) AND (?='' OR l.type=?)""",
        (start, end, *(v for k in ("teacher","course","type") for v in [p.get(k) or ""]*2)))
    stats["attending_students"] = len({v["student"] for v in presence})
    stats["teaching_staff"] = len({v["teacher"] for v in studied})
    compare = []
    for t in tids:
        key = t["id"]
        ss = [s for s in studied if s["teacher"] == key]
        teacher_fees = [f for f in x["fees"] if f["teacher"] == key]
        earnings = [y for y in x["earnings"] if y["teacher"] == key]
        payments = [v for v in x["payments"] if v["teacher"] == key]
        compare.append(
            dict(
                id=key,
                name=t["name"],
                income_to_studio=t["income_to_studio"],
                **reference_totals(teacher_fees),
                pending_fees=sum(f["status"] == "pending" for f in teacher_fees),
                pending_values=sum(r["teacher"] == key for r in x["pending_lines"]),
                audience=t["audience"],
                students=len({v["student"] for v in presence if v["teacher"] == key}),
                payable=sum(v["amount"] - v["paid"] for v in x["payables"] if v["teacher"] == key),
                allocated=sum(v["paid"] for v in x["payables"] if v["teacher"] == key),
                scenes=len(ss),
                substitutes=has_col(ss, "substitute"),
                minutes=has_col(ss, "minutes"),
                present=has_col(ss, "present"),
                absent_count=sum(l["absent_count"] for l in x["lessons"] if l["teacher"] == key),
                units=sum(v["units"] for v in x["consumption"] if v["teacher"] == key),
                value=sum(v["amount"] for v in x["consumption"] if v["teacher"] == key),
                earned=has_col(earnings, "amount"), earned_entries=len(earnings),
                actual_paid=has_col(payments, "amount"), payment_entries=len(payments),
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
        first = buckets.setdefault(bucket, dict(label=bucket, start=dt, end=dt, scenes=0, value=0, consumption_records=0))
        if "cash" in x:
            first["net"] = first["receipts"] = 0
        first["end"] = dt
        cursor += timedelta(days=1)
    for metric, rows, col in [
        ("scenes", studied, None),
        ("value", x["consumption"], "amount"),
        ("net", x.get("cash", []), "amount"),
        ("receipts", [c for c in x.get("cashflow", []) if c["kind"] == "receipt"], "amount"),
    ]:
        for r in rows:
            bucket=buckets[r["day"][:7] if months else r["day"]]
            bucket[metric] += r[col] if col else 1
            if metric == "value":
                bucket["consumption_records"] += 1
    low = int(cfg(db, "low"))
    idle = int(cfg(db, "idle"))
    alerts = []
    alert_packs = x.get("packages") if "packages" in x else packs(db, a, {"asof": end})
    roster = student_list(
        db,
        a,
        {
            "asof": end,
            "main_teacher": p.get("teacher"),
            "course": p.get("course"),
            "type": p.get("type"),
        },
    )
    stats["students"] = len(roster)
    stats["unverified_students"] = sum(s["status"] == "待确认" for s in roster)
    for s in roster:
        if s["status"] != "在读":
            continue
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
        comparison=comparable_activity(db,a,p,x,stats),
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
    if kind == "studio_income":
        flow = p.get("flow")
        if flow in ("receipt", "refund", "payment"):
            # Old bookmarked receipt/payment drill-downs retain their original vouchers.
            kind = "cashflow"
            data = [r for r in x[kind] if r["kind"] == flow]
        elif flow == "verified":
            data = [r for r in data if r["fee_basis"] in ("已核定","全额归琴行","已计入同节课")]
        elif flow == "net_tuition":
            kind = "cashflow"
            data = [r for r in x[kind] if r["kind"] in ("receipt", "refund")]
        elif flow == "lesson_fees":
            data = [r for r in data if r["fee_basis"] != "全额归琴行"]
    if p.get("state") == "pending":
        data = [r for r in data if r.get("status") == "pending"]
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
    if kind == "lessons":
        by_id = {row["id"]: row for row in data}
        for row in data:
            row["participants"] = []
        if data:
            lines = many(db, """SELECT x.lesson,x.student,s.name,x.pack,x.units,x.status,x.state,x.value,
                        coalesce(pk.main_at_sale,s.main_teacher) main_teacher
                    FROM lessons l JOIN attendance x ON x.lesson=l.id
                    JOIN students s ON s.id=x.student LEFT JOIN packages pk ON pk.id=x.pack
                    WHERE l.day BETWEEN ? AND ? ORDER BY l.day,l.rowid,x.rowid""", (x["start"], x["end"]))
            for line in lines:
                lesson = by_id.get(line.pop("lesson"))
                if lesson is not None:
                    lesson["participants"].append(line)
        needle = p.get("q", "").strip().casefold()
        for row in data:
            people = row["participants"]
            row["students"] = "、".join(person["name"] for person in people)
            row["substitute"] = any(person["main_teacher"] and person["main_teacher"] != row["teacher"] for person in people)
            row["review"] = ("history" if row["history"] else "pending" if row.get("line_pending") or row.get("fee_pending") else "confirmed")
            row["origin"] = row.get("origin") or ("history" if row["history"] else "archive")
            if not row["history"] and row.get("active", 1):
                row["class_value"] = sum(i["value"] or 0 for i in people) if all(i["status"] != "pending" and (i["value"] is not None or not i["units"]) for i in people) else None
            else:
                row["class_value"] = None
        if p.get("origin") or p.get("review"):
            data = [r for r in data if all(not p.get(k) or r[k] == p[k] for k in ("origin","review"))]
        if needle or p.get("student") or p.get("pack") or p.get("coverage") == "substitute":
            data = [r for r in data if any(
                (not needle or needle in (i["name"] + " " + i["student"]).casefold())
                and (not p.get("student") or i["student"] == p["student"])
                and (not p.get("pack") or i["pack"] == p["pack"])
                and (p.get("coverage") != "substitute" or (i["main_teacher"] and i["main_teacher"] != r["teacher"]))
                for i in r["participants"])]
    if p.get("only") == "taught":
        data = [r for r in data if r.get("taught")]
    if kind == "fees" and p.get("flow") == "verified":
        data = [r for r in data if r.get("final") is not None and r["status"] != "history"]
    if kind == "fees" and p.get("flow") == "reference":
        data = [r for r in data if r["status"] not in ("studio", "history")]
    if kind == "cash" and p.get("flow") in ("receipts", "refunds"):
        data = [r for r in data if r["kind"] == ("receipt" if p["flow"] == "receipts" else "refund")]
    if kind == "packages" and p.get("flow") == "debt":
        data = [r for r in data if r["debt"] > 0]
    if kind == "packages" and p.get("flow") == "registered":
        data = [r for r in data if not r["opening"] and r["since"] >= x["start"]]
    if kind == "packages" and p.get("flow") == "receipt_review":
        data = [r for r in data if r["receipt_review"]]
    if kind == "payables" and p.get("flow") == "outstanding":
        data = [r for r in data if r["amount"] != r["paid"]]
    if kind == "cashflow" and p.get("flow") in ("receipt", "refund", "payment"):
        data = [r for r in data if r["kind"] == p["flow"]]
    if kind == "cashflow" and p.get("flow") == "net_tuition":
        data = [r for r in data if r["kind"] in ("receipt", "refund")]
    if p.get("pack") and kind != "lessons":
        data = [
            r
            for r in data
            if r.get("pack") == p["pack"] or (kind == "packages" and r["id"] == p["pack"])
        ]
    if p.get("student") and kind not in ("packages", "lessons"):
        data = [r for r in data if r.get("student") == p["student"]]
    result = {"kind": kind, "rows": data, "start": x["start"], "end": x["end"]}
    if kind == "lessons" and p.get("display_page"):
        try:
            requested = int(p["display_page"])
        except (TypeError, ValueError):
            requested = 1
        count, size = len(data), 20
        page = max(1,min(requested,(count+size-1)//size))
        hi = max(0,count-(page-1)*size)
        taught = [v for v in data if v.get("active",1) and v["taught"]]
        people = [i for v in taught for i in v["participants"] if i["state"]=="present"]
        uses = [i for v in data if v.get("active",1) and not v["history"] for i in v["participants"]]
        result.update(rows=data[max(0,hi-size):hi],total=count,page=page,page_size=size,
            workload=dict(scenes=len(taught),minutes=has_col(taught,"minutes"),teachers=len({v["teacher"] for v in taught}),
                          students=len({i["student"] for i in people}),used=sum(i["units"] for i in uses if i["status"]!="pending"),
                          pending=sum(i["status"]=="pending" for i in uses)))
    if kind == "studio_income":
        result["totals"] = income_totals(data)
    return result


def batch_info(db, a, p):
    admin(a)
    if p.get("view") == "trace":
        header=one(db,"""SELECT b.id,b.sheet,b.actor,b.created,f.name FROM batches b
            JOIN files f ON f.id=b.file WHERE b.id=?""",(p.get("id"),))
        require(header,"批次不存在",404)
        conditions=["r.batch=?"]
        args=[header["id"]]
        if p.get("row"):
            conditions.append("r.row_key=?")
            args.append(p["row"])
        if p.get("issues")=="1":
            conditions.append("r.status IN ('issue','revision')")
        where=" AND ".join(conditions)
        count=one(db,f"SELECT count(*) n FROM batch_rows r WHERE {where}",args)["n"]
        page=min(max(1,(count+19)//20), max(1,int(p.get('trace_page','1'))) if str(p.get('trace_page','1')).isdigit() and len(str(p.get('trace_page','1')))<8 else 1)
        rows=many(db,f"""SELECT r.row_key,r.status,r.lesson,r.evidence,l.day,l.teacher FROM batch_rows r
            LEFT JOIN lessons l ON l.id=r.lesson WHERE {where} ORDER BY r.rowid LIMIT 20 OFFSET ?""",(*args,(page-1)*20))
        for row in rows:
            record=json.loads(row.pop("evidence"))
            row["note"]=record.get("message") or "；".join(map(str,record.get("errors") or []))
        return {**header,"rows":rows,"count":count,"page":page}

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
        """SELECT b.id,b.created,b.actor,b.sheet,f.name,b.result IS NOT NULL confirmed,
           (SELECT count(*) FROM batch_rows r WHERE r.batch=b.id AND r.status IN ('issue','revision')) issues
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
    "teacher_fee",
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
    teacher_fee="扣除老师课酬",
    fee_basis="课酬依据",
    fee="课酬记录编号",
    origin="流水来源",
    participants="逐位学员与课包",
    substitute="代课",
    shared_package="含共用课包",
    member_ids="课包适用学员编号",
    package_courses="课包科目",
    receipt_review="纸卡收款待核",
    receipts_complete="关联课包学费已收齐",
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


MONEY_KEYS.update({"consumed_value", "portfolio_value", "class_value"})
UNIT_KEYS.update({"progress_used", "progress_total"})
LABELS.update(progress_used="累计已消课时", progress_total="调整后总课时",
              consumed_value="累计消课金额", portfolio_value="课包总价值", class_value="场次消课金额",
              review="核对状态", follow="跟进事项", fee_pending="课酬待核", line_pending="消课待核")


def export(db, a, p):
    admin(a)
    p = {k:v for k,v in p.items() if k != "display_page"}
    kind = p.get("kind", "lessons")
    if kind == "students":
        data = student_list(db, a, {**p, "asof": p.get("asof") or period(p, db)[1]})
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
        result = details(db, a, p)
        kind, data = result["kind"], result["rows"]
    keys = list(dict.fromkeys(k for r in data for k in r)) or ["id"]
    f = io.StringIO(newline="")
    w = csv.writer(f)
    labels = {**LABELS, "day": "消课入账日", "amount": "琴行收入"} if kind == "studio_income" else LABELS
    w.writerow([labels.get(k, k) + ("（元）" if k in MONEY_KEYS else "") for k in keys])
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
