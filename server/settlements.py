from datetime import date, timedelta

from .common import (
    admin,
    audit,
    cfg,
    day,
    dump,
    get,
    ident,
    label,
    many,
    money,
    one,
    require,
    today,
)
from .lessons import post_payable


def opening(db, a, p):
    admin(a)
    tid = get(db, "teachers", p.get("teacher"))["id"]
    require(
        not one(db, "SELECT id FROM payables WHERE teacher=? AND kind='opening'", (tid,)),
        "该老师已有期初应付",
    )
    when = (date.fromisoformat(cfg(db, "activation")) - timedelta(days=1)).isoformat()
    key = post_payable(
        db, tid, when, money(p.get("amount")), "opening", reason=label(p.get("reason"), "期初依据")
    )
    audit(db, a, "期初应付", key, p)
    return {"id": key}


def selection(db, p):
    teacher = get(db, "teachers", p.get("teacher"))["id"]
    start, end = day(p.get("start")), day(p.get("end"))
    require(start <= end, "结算区间倒置")
    items = many(
        db,
        """SELECT * FROM payables WHERE teacher=? AND settlement IS NULL AND
        (day BETWEEN ? AND ? OR (kind='opening' AND day<=?)) ORDER BY day,rowid""",
        (teacher, start, end, end),
    )
    pending = many(
        db,
        """SELECT f.id,l.day,l.id lesson,f.reason FROM fees f JOIN lessons l ON l.id=f.lesson
        WHERE l.teacher=? AND l.active=1 AND f.status='pending' AND l.day BETWEEN ? AND ?""",
        (teacher, start, end),
    )
    return dict(
        teacher=teacher,
        start=start,
        end=end,
        items=items,
        excluded=pending,
        total=sum(y["amount"] for y in items),
    )


def settle(db, a, p):
    admin(a)
    s = selection(db, p)
    when = day(p.get("day") or today())
    require(when >= s["end"], "确认日不能早于结算期末")
    require(s["items"], "该区间没有可结算的应付")
    expected = p.get("items")
    require(
        expected is not None and sorted(expected) == sorted(r["id"] for r in s["items"]),
        "结算明细已变化，请重新预览",
        409,
    )
    key = ident("BILL")
    db.execute(
        "INSERT INTO settlements VALUES (?,?,?,?,?,?,?)",
        (key, s["teacher"], s["start"], s["end"], when, dump(s), a["id"]),
    )
    db.executemany("UPDATE payables SET settlement=? WHERE id=?", [(key, r["id"]) for r in s["items"]])
    audit(db, a, "确认结算单", key, {"amount": s["total"], "excluded": len(s["excluded"])})
    return {"id": key, "total": s["total"], "excluded": len(s["excluded"])}


def pay(db, a, p):
    admin(a)
    tid = get(db, "teachers", p.get("teacher"))["id"]
    when = day(p.get("day") or today())
    amount = money(p.get("amount"))
    require(amount > 0, "付款金额必须为正")
    candidates = many(
        db,
        """SELECT y.id,y.amount-coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.payable=y.id),0) unpaid
        FROM payables y JOIN settlements s ON s.id=y.settlement WHERE y.teacher=? AND s.day<=? AND y.day<=?
        ORDER BY y.day,y.rowid""",
        (tid, when, when),
    )
    if p.get("settlement"):
        keys = {
            r[0] for r in db.execute("SELECT id FROM payables WHERE settlement=?", (p["settlement"],))
        }
        candidates = [r for r in candidates if r["id"] in keys]
    require(amount <= sum(y["unpaid"] for y in candidates), "付款超过所选已结算未付余额")
    key = ident("PAY")
    db.execute(
        "INSERT INTO payments VALUES (?,?,?,?,?,?,?)",
        (
            key,
            tid,
            when,
            amount,
            label(p.get("method") or "转账", "方式"),
            a["id"],
            str(p.get("reason", "")),
        ),
    )
    # Clear credit adjustments first; signed allocations always sum to this cash payment.
    remaining = amount
    for y in sorted(candidates, key=lambda y: y["unpaid"] >= 0):
        share = min(remaining, y["unpaid"])
        if share:
            db.execute("INSERT INTO allocations VALUES (?,?,?)", (key, y["id"], share))
            remaining -= share
    require(remaining == 0, "付款分配不平衡")
    audit(db, a, "实际付款", key, p)
    return {"id": key, "amount": amount}
