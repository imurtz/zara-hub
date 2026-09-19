# -*- coding: utf-8 -*-
"""
مزامنة أخبار الوفيات من موقع جمعية العوامية (awamiach.sa) إلى قسم "الوفيات" بلوحة التحكم (gzara.org/Login).

كل تشغيل:
  1) يقرأ قائمة "أخبار الوفيات" بالموقع (الأحدث أولاً)
  2) يعرف الأخبار الجديدة = التي لم تُسحب سابقاً (بوثيقة الحالة eventsMeta/deathsSync) ولا يوجد لها سجل بنفس رابط الخبر
  3) لكل خبر جديد: يقرأ صفحته، يحلّل متغيراته (deaths_parser.py)، يرفع صورة المتوفى (إن وُجدت) إلى R2،
     ثم يُنشئ سجلاً بمجموعة events بتصنيف deaths
  4) يحدّث وثيقة الحالة (ما سُحب + وقت آخر فحص) حتى لا يُسحب الخبر مرتين — حتى لو حذفه أحد لاحقاً من اللوحة

أول تشغيل بلا وثيقة حالة: يسحب أحدث N خبراً فقط (افتراضياً 20) ويعلّم كل ما سواها "مُشاهَد" بدون سحب، حتى لا
تُغرَق اللوحة بأرشيف الموقع كله فجأة. لسحب الأرشيف كاملاً استعمل --backfill (أو خيار backfill بالـWorkflow).

الاستعمال:  python3 scripts/sync_deaths.py [--dry-run] [--backfill] [--initial-count 20] [--max-per-run 60]
مكتبة قياسية فقط.
"""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deaths_parser as P  # noqa: E402

FIREBASE_PROJECT = "awamia-zara"
FIREBASE_KEY = "AIzaSyBPos-QSrnK_x5HS742FJkNJVhXwGdq8j8"   # مفتاح ويب عام (نفس المستخدم بصفحات الموقع)؛ الحماية بقواعد Firestore
FS = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents" % FIREBASE_PROJECT
LIST_URL = P.BASE + "pages/" + urllib.parse.quote("أخبار-الوفيات") + "/"
MEDIA_UPLOAD_URL = os.environ.get("MEDIA_UPLOAD_URL", "https://zara-media-upload.murtada-ud.workers.dev/")   # نفس Worker الرفع بالمنصة
UA = "Mozilla/5.0 (compatible; AwamiaSync/1.0; +https://gzara.org)"
SOURCE_TAG = "website-sync"


def http(url, data=None, headers=None, method=None, timeout=45, retries=3):
    h = {"User-Agent": UA}
    h.update(headers or {})
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=h, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code in (404, 400, 401, 403, 409):   # لا فائدة من إعادة المحاولة
                return e.code, body, dict(e.headers or {})
            last = e
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("فشل الطلب %s: %s" % (url, last))


# ---------------- Firestore (REST) ----------------
def fs_value(v):
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, list):
        return {"arrayValue": {"values": [fs_value(x) for x in v]}}
    return {"stringValue": str(v)}


def fs_decode(f):
    if "stringValue" in f:
        return f["stringValue"]
    if "integerValue" in f:
        return int(f["integerValue"])
    if "booleanValue" in f:
        return f["booleanValue"]
    if "arrayValue" in f:
        return [fs_decode(x) for x in f["arrayValue"].get("values", [])]
    return None


def fs_get(path):
    st, body, _ = http("%s/%s?key=%s" % (FS, path, FIREBASE_KEY))
    if st == 404:
        return None
    if st != 200:
        raise RuntimeError("قراءة %s فشلت (%s): %s" % (path, st, body[:200]))
    d = json.loads(body)
    return {k: fs_decode(v) for k, v in d.get("fields", {}).items()}


def fs_patch(path, fields, mask=None):
    q = "key=" + FIREBASE_KEY
    for k in (mask or []):
        q += "&updateMask.fieldPaths=" + urllib.parse.quote(k)
    body = json.dumps({"fields": {k: fs_value(v) for k, v in fields.items()}}).encode()
    st, resp, _ = http("%s/%s?%s" % (FS, path, q), data=body, headers={"Content-Type": "application/json"}, method="PATCH")
    if st != 200:
        raise RuntimeError("كتابة %s فشلت (%s): %s" % (path, st, resp[:300]))


def existing_source_urls():
    q = {"structuredQuery": {"from": [{"collectionId": "events"}],
                             "where": {"fieldFilter": {"field": {"fieldPath": "category"}, "op": "EQUAL", "value": {"stringValue": "deaths"}}},
                             "select": {"fields": [{"fieldPath": "sourceUrl"}]}}}
    st, body, _ = http("%s:runQuery?key=%s" % (FS, FIREBASE_KEY), data=json.dumps(q).encode(), headers={"Content-Type": "application/json"}, method="POST")
    if st != 200:
        raise RuntimeError("استعلام السجلات الحالية فشل (%s)" % st)
    out = set()
    for row in json.loads(body):
        doc = row.get("document")
        if doc:
            u = doc.get("fields", {}).get("sourceUrl", {}).get("stringValue")
            if u:
                out.add(u)
    return out


# ---------------- الموقع ----------------
def url_key(u):
    return hashlib.sha1(urllib.parse.unquote(u).strip().encode("utf8")).hexdigest()[:12]


def fetch_listing():
    st, body, _ = http(LIST_URL)
    if st != 200:
        raise RuntimeError("تعذّر فتح قائمة أخبار الوفيات (%s)" % st)
    html = body.decode("utf8", "ignore")
    items = []
    for m in re.finditer(r'<a class=generic1_block href="(pages/[^"]+)">(.*?)</a>', html, re.S):
        title = re.search(r"<h2[^>]*>(.*?)</h2>", m.group(2), re.S)
        t = P.htmllib.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip() if title else ""
        items.append({"path": m.group(1), "url": P.BASE + m.group(1), "title": t})
    seen, uniq = set(), []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            uniq.append(it)
    if not uniq:
        raise RuntimeError("لم تُستخرج أي أخبار من القائمة — ربما تغيّر تصميم الموقع")
    return uniq


def fetch_entry(item):
    u = P.BASE + urllib.parse.quote(item["path"])
    st, body, _ = http(u)
    if st != 200:
        raise RuntimeError("تعذّر فتح الخبر (%s): %s" % (st, item["path"]))
    return body.decode("utf8", "ignore")


def upload_photo(photo_url):
    """ينزّل صورة المتوفى من الموقع ويرفعها إلى R2 (نفس Worker الرفع بالمنصة) ويرجّع رابطها العام، أو "" عند أي مشكلة."""
    try:
        st, data, hdr = http(photo_url, timeout=60)
        if st != 200 or not data:
            return ""
        ct = (hdr.get("Content-Type") or hdr.get("content-type") or "").split(";")[0].strip().lower()
        if ct not in ("image/jpeg", "image/png"):
            ct = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else ("image/jpeg" if data[:3] == b"\xff\xd8\xff" else "")
        if not ct or len(data) > 14 * 1024 * 1024:
            return ""
        st2, resp, _ = http(MEDIA_UPLOAD_URL, data=data, method="POST",
                            headers={"Content-Type": ct, "X-Folder": "events", "Origin": "https://gzara.org"}, timeout=90)
        if st2 != 200:
            print("  ! رفع الصورة فشل (%s)" % st2)
            return ""
        return json.loads(resp).get("url", "")
    except Exception as e:  # noqa: BLE001
        print("  ! تعذّر رفع الصورة: %s" % e)
        return ""


def hijri_to_gregorian_approx(hy, hm, hd):
    """تقويم هجري جدولي -> ميلادي (تقريبي ±يوم واحد عن أم القرى) — يُستعمل فقط لتقدير الشهر/السنة الميلادية عند غياب التاريخ الميلادي."""
    jd = (11 * hy + 3) // 30 + 354 * hy + 30 * hm - (hm - 1) // 2 + hd + 1948440 - 385
    l = jd + 68569
    n = 4 * l // 146097
    l = l - (146097 * n + 3) // 4
    i = 4000 * (l + 1) // 1461001
    l = l - 1461 * i // 4 + 31
    j = 80 * l // 2447
    d = l - 2447 * j // 80
    l = j // 11
    m = j + 2 - 12 * l
    y = 100 * (n - 49) + i + l
    return y, m, d


def build_record(parsed, list_title, url, photo_r2, prev_ts=0):
    rec = {k: v for k, v in parsed.items() if v not in ("", None) and k not in ("photoUrl", "nickname")}
    nick = parsed.get("nickname")
    notes = []
    if nick:
        notes.append("اللقب/الكنية: " + nick)
    if not rec.get("deathDateGregorian") and not rec.get("deathDateHijri"):
        notes.append("لم يُستخرج تاريخ الوفاة تلقائياً — راجع الخبر بموقع الجمعية")
    est_ts = 0
    if not parsed.get("deathDateGregorian") and parsed.get("deathDateHijri"):
        m = re.match(r"(\d+)\s+(.+?)\s+(\d{4})", parsed["deathDateHijri"])
        if m and m.group(2) in P.HIJRI_MONTHS:
            gy, gm, gd = hijri_to_gregorian_approx(int(m.group(3)), P.HIJRI_MONTHS.index(m.group(2)) + 1, int(m.group(1)))
            if 1990 <= gy <= 2100:
                rec["deathMonthGregorian"] = P.GREG_MONTHS[gm - 1]
                rec["gregorianYear"] = str(gy)
                est_ts = int(time.mktime((gy, gm, gd, 12, 0, 0, 0, 0, -1)) * 1000)
                notes.append("الشهر والسنة الميلادية مقدَّران من التاريخ الهجري (التاريخ الميلادي بالخبر غير صحيح)")
    if notes:
        rec["notes"] = " — ".join(notes)
    rec["category"] = "deaths"
    rec["source"] = SOURCE_TAG
    rec["sourceUrl"] = url
    if photo_r2:
        rec["photo"] = photo_r2
    now = int(time.time() * 1000)
    # ترتيب العرض بالجدول ("الأحدث إدخالاً أولاً") يعتمد createdAt، فنجعله تاريخ الوفاة نفسه ليظهر الأحدث وفاةً أولاً.
    # لو ما عُرف التاريخ: بعد أقدم منه مباشرة (prev_ts) حتى يبقى بمكانه الزمني التقريبي حسب ترتيبه بقائمة الموقع
    ts = 0
    if rec.get("deathDateGregorian"):
        try:
            y, m, d = (int(x) for x in rec["deathDateGregorian"].split("-"))
            ts = int(time.mktime((y, m, d, 12, 0, 0, 0, 0, -1)) * 1000)
        except Exception:  # noqa: BLE001
            ts = 0
    if not ts:
        ts = est_ts or ((prev_ts + 60000) if prev_ts else now)
    rid = "evt-" + format(now, "x") + "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(6))
    rec["id"] = rid
    rec["createdAt"] = ts
    rec["updatedAt"] = now
    return rec


def merge_options(new_values):
    """يضيف قيم القوائم الجديدة (مسمى/مكان تشييع/مكان عزاء) لقوائم اللوحة حتى لا تظهر كـ"من تسجيل خارجي"."""
    if not any(new_values.values()):
        return
    cur = fs_get("eventsMeta/options") or {}
    defaults = {
        "funeralFrom": ["مغتسل مقبرة العوامية"],
        "condolencePlaces": [],
        "deathHonorifics": ["الحاج", "الحاجة", "الشاب", "الشابة", "الطفل", "الطفلة", "السيد", "السيدة", "الشيخ", "الدكتور", "الدكتورة"],
        "ageCategories": ["طفل", "شاب", "بالغ", "كبير السن"],
    }
    upd = {}
    for k, vals in new_values.items():
        base = list(cur.get(k) or defaults.get(k, []))
        added = [v for v in sorted(vals) if v and v not in base]
        if added:
            upd[k] = base + added
    if upd:
        fs_patch("eventsMeta/options", upd, mask=list(upd.keys()))
        print("  + خيارات جديدة بالقوائم:", {k: len(v) for k, v in upd.items()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="يحلّل ويعرض فقط بدون أي كتابة")
    ap.add_argument("--backfill", action="store_true", help="يسحب كل أخبار الأرشيف غير الموجودة")
    ap.add_argument("--initial-count", type=int, default=20, help="عدد أحدث الأخبار المسحوبة بأول تشغيل")
    ap.add_argument("--max-per-run", type=int, default=60, help="أقصى عدد أخبار يُسحب بالتشغيل الواحد")
    args = ap.parse_args()

    listing = fetch_listing()
    print("أخبار بالقائمة:", len(listing))
    state = fs_get("eventsMeta/deathsSync")     # القراءة آمنة حتى بوضع --dry-run؛ الكتابة والرفع فقط هي التي تُمنع
    seen = set((state or {}).get("seen") or [])
    have_urls = existing_source_urls()
    first_run = state is None
    print("أول تشغيل:" if first_run else "وثيقة الحالة موجودة —", "مُشاهَد سابقاً:", len(seen), "| سجلات موجودة برابط:", len(have_urls))

    if args.backfill:
        fresh = [it for it in listing if it["url"] not in have_urls]      # الأرشيف كاملاً: كل خبر ليس له سجل بعد
    else:
        fresh = [it for it in listing if url_key(it["url"]) not in seen and it["url"] not in have_urls]
    to_import, to_mark = [], []
    if first_run and not args.backfill:
        to_import = fresh[:args.initial_count]
        to_mark = fresh[args.initial_count:]
    else:
        to_import = fresh
    if len(to_import) > args.max_per_run:
        print("تنبيه: %d خبراً جديداً، سيُسحب أحدث %d الآن والباقي بالتشغيل القادم" % (len(to_import), args.max_per_run))
        to_import = to_import[:args.max_per_run]
    print("جديد للسحب:", len(to_import), "| يُعلَّم مُشاهَداً بلا سحب:", len(to_mark))

    imported, failed, prev_ts = 0, 0, 0
    opt_new = {"deathHonorifics": set(), "funeralFrom": set(), "condolencePlaces": set(), "ageCategories": set()}
    for it in reversed(to_import):          # الأقدم أولاً ليتطابق ترتيب الإدخال مع الترتيب الزمني
        try:
            page = fetch_entry(it)
            parsed = P.parse_entry(page, it["title"], it["url"])
            if not parsed.get("deceasedName"):
                raise RuntimeError("لم يُستخرج اسم المتوفى")
            photo = ""
            if parsed.get("photoUrl") and not args.dry_run:
                photo = upload_photo(parsed["photoUrl"])
            rec = build_record(parsed, it["title"], it["url"], photo, prev_ts)
            prev_ts = rec["createdAt"]
            label = "%s %s | %s | %s" % (rec.get("honorific", ""), rec["deceasedName"], rec.get("deathDateGregorian", "؟"), rec.get("funeralFrom", ""))
            if args.dry_run:
                print("  [dry] " + label)
                print("       " + json.dumps({k: v for k, v in rec.items() if k not in ("id", "createdAt", "updatedAt", "category", "source")}, ensure_ascii=False)[:600])
            else:
                fs_patch("events/" + rec["id"], {k: v for k, v in rec.items()})
                seen.add(url_key(it["url"]))
                if imported % 25 == 24:
                    fs_patch("eventsMeta/deathsSync", {"seen": sorted(seen), "lastRun": int(time.time() * 1000)}, mask=["seen", "lastRun"])
                print("  ✓ " + label)
            for key, fld in (("deathHonorifics", "honorific"), ("funeralFrom", "funeralFrom"), ("ageCategories", "ageCategory"),
                             ("condolencePlaces", "condolenceMenPlace"), ("condolencePlaces", "condolenceWomenPlace")):
                if rec.get(fld):
                    opt_new[key].add(rec[fld])
            imported += 1
            time.sleep(0.4)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("  ✗ %s — %s" % (it["title"][:60], e))
    if not args.dry_run:
        for it in to_mark:
            seen.add(url_key(it["url"]))
        merge_options(opt_new)
        fs_patch("eventsMeta/deathsSync",
                 {"seen": sorted(seen), "lastRun": int(time.time() * 1000), "lastImported": imported, "lastFailed": failed,
                  "lastError": "" if not failed else "فشل سحب %d خبراً — راجع سجل التشغيل" % failed},
                 mask=["seen", "lastRun", "lastImported", "lastFailed", "lastError"])
    print("انتهى: سُحب %d، فشل %d، مُعلَّم %d" % (imported, failed, len(to_mark)))
    if failed and not imported:
        sys.exit(1)


if __name__ == "__main__":
    main()
