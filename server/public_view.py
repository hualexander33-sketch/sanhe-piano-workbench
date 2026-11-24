"""Read-only operations used by the original web client on a shared link."""
from . import reports, settlements
from .common import Problem, cfg, many, today

VIEWER = {"id": "内部查看", "role": "ops", "teacher": None, "can_record": 0}


def session(db):
    teachers = reports.teachers(db, VIEWER)
    for teacher in teachers:
        teacher["rules"] = many(db, "SELECT * FROM rules WHERE teacher=? ORDER BY since DESC", (teacher["id"],))
    return dict(account=VIEWER, teachers=teachers, mode="live", today=today(), low=cfg(db, "low"),
                idle=cfg(db, "idle"), activation=cfg(db, "activation"), csrf="")


def read(db, name, params):
    if name == "meta":
        return session(db)
    if name == "audit":
        return many(db, "SELECT id,at,actor,action,ref FROM audit ORDER BY id DESC")
    if name == "settlement_preview":
        return settlements.selection(db, params)
    readers = {"report": reports.report, "details": reports.details, "students": reports.student_list,
               "profile": reports.profile, "packages": reports.packs, "lesson": reports.record,
               "batches": reports.batch_list, "batch": reports.batch_info,
               "batch_totals": reports.batch_totals, "bills": reports.bills, "export": reports.export}
    if name not in readers:
        raise Problem("此操作需要在管理端办理", 403)
    return readers[name](db, VIEWER, params)
