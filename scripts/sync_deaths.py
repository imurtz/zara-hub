# -*- coding: utf-8 -*-
"""
مزامنة أخبار الوفيات من موقع جمعية العوامية (awamiach.sa) إلى قسم "الوفيات" بلوحة التحكم (gzara.org/Login).

كل تشغيل:
  1) يقرأ قائمة "أخبار الوفيات" بالموقع (الأحدث أولاً)
  2) يجلب من قاعدة البيانات السجلات المقابلة لأحدث 5 أخبار (أو كل الأرشيف بوضع --full) ويعرف:
       • الخبر الجديد (بلا سجل)                → يُسحب
       • السجل المحذوف من اللوحة                → يُسحب من جديد (الحذف ليس تجاهلاً دائماً)
  3) يعيد قراءة صفحة أحدث 5 أخبار + كل خبر حديث ناقص البيانات، ويحدّث السجل بما استُكمل/تغيّر بالموقع:
       • سجل لم يعدّله موظف (updatedAt == syncStamp): يُحدَّث بالكامل
       • سجل عدّله موظف: يُملأ فقط ما كان فارغاً، ولا يُستبدل ما كتبه
  4) الصفحات تُقرأ بالتوازي، وتُحفظ وثيقة الحالة (خريطة رابط→سجل + نتيجة آخر تشغيل)

الاستعمال:  python3 scripts/sync_deaths.py [--dry-run] [--full] [--backfill] [--window 60] [--refresh-latest 8]
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
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deaths_parser as P  # noqa: E402

FIREBASE_PROJECT = "awamia-zara"
FIREBASE_KEY = "AIzaSyBPos-QSrnK_x5HS742FJkNJVhXwGdq8j8"   # مفتاح ويب عام (نفس المستخدم بصفحات الموقع)؛ الحماية بقواعد Firestore
FS = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents" % FIREBASE_PROJECT
LIST_URL = P.BASE + "pages/" + urllib.parse.quote("أخبار-الوفيات") + "/"
MEDIA_UPLOAD_URL = os.environ.get("MEDIA_UPLOAD_URL", "https://zara-media-upload.murtada-ud.workers.dev/")   # نفس Worker الرفع بالمنصة
UA = "Mozilla/5.0 (compatible; AwamiaSync/1.0; +https://gzara.org)"
SOURCE_TAG = "website-sync"
STATE_PATH = "eventsMeta/deathsSync"


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
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: fs_value(x) for k, x in v.items()}}}
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
    if "mapValue" in f:
        return {k: fs_decode(x) for k, x in f["mapValue"].get("fields", {}).items()}
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


def existing_url_ids():
    """{sourceUrl: recordId} لكل سجلات الوفيات المسحوبة (تُستعمل مرة واحدة لبناء/ترحيل خريطة الحالة)."""
    q = {"structuredQuery": {"from": [{"collectionId": "events"}],
                             "where": {"fieldFilter": {"field": {"fieldPath": "category"}, "op": "EQUAL", "value": {"stringValue": "deaths"}}},
                             "select": {"fields": [{"fieldPath": "sourceUrl"}]}}}
    st, body, _ = http("%s:runQuery?key=%s" % (FS, FIREBASE_KEY), data=json.dumps(q).encode(), headers={"Content-Type": "application/json"}, method="POST")
    if st != 200:
        raise RuntimeError("استعلام السجلات الحالية فشل (%s)" % st)
    out = {}
    for row in json.loads(body):
        doc = row.get("document")
        if doc:
            u = doc.get("fields", {}).get("sourceUrl", {}).get("stringValue")
            if u:
                out[u] = doc["name"].rsplit("/", 1)[-1]
    return out


def fs_batch_get(rids):
    """يجلب عدة سجلات دفعة واحدة -> {id: {field: value}} للموجودة فقط (المحذوفة لا تظهر)."""
    rids = list(rids)

    def one(chunk):
        body = json.dumps({"documents": ["projects/%s/databases/(default)/documents/events/%s" % (FIREBASE_PROJECT, r) for r in chunk]}).encode()
        st, resp, _ = http("%s:batchGet?key=%s" % (FS, FIREBASE_KEY), data=body, headers={"Content-Type": "application/json"}, method="POST")
        if st != 200:
            raise RuntimeError("جلب السجلات دفعة واحدة فشل (%s): %s" % (st, resp[:200]))
        return json.loads(resp)
    found = {}
    with ThreadPoolExecutor(max_workers=5) as ex:            # دفعات الـ100 بالتوازي
        for rows in ex.map(one, [rids[i:i + 100] for i in range(0, len(rids), 100)]):
            for row in rows:
                f = row.get("found")
                if f:
                    found[f["name"].rsplit("/", 1)[-1]] = {k: fs_decode(v) for k, v in f.get("fields", {}).items()}
    return found


# ---------------- الموقع ----------------
def url_key(u):
    return hashlib.sha1(urllib.parse.unquote(u).strip().encode("utf8")).hexdigest()[:12]


def fetch_listing():
    for attempt in range(3):          # الموقع يرجع أحياناً صفحة بلا قائمة لحظياً فنعيد المحاولة قبل الفشل
        st, body, _ = http(LIST_URL)
        if st == 200 and b"generic1_block" in body:
            break
        time.sleep(20 * (attempt + 1))
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


# ================= روابط مختصرة بنطاق بوابة زارة: gzara.org/s/<code> =================
# لكل خبر صفحة تحويل ثابتة s/<code>.html بمستودع الموقع (GitHub Pages)، تحمل عنوان الخبر وصورته لمعاينة واتساب ثم تحوّل لصفحة الخبر.
# الكود مشتق من رابط الخبر نفسه (نفس الخبر = نفس الكود دائماً)، فلا يتكرر ولا يحتاج قاعدة بيانات.
# لا يُكتب الرابط بسجل الخبر إلا بعد أن تصبح الصفحة منشورة فعلاً (انظر publish_short) حتى لا يُرسَل رابط غير جاهز.
SHORT_HOST = "https://gzara.org/s/"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHORT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"          # بلا حروف متشابهة (i l o 0 1)


def short_code(url):
    n = int.from_bytes(hashlib.sha1(("gz-short:" + urllib.parse.unquote(url).strip()).encode("utf8")).digest()[:8], "big")
    out = ""
    for _ in range(7):
        out += SHORT_ALPHABET[n % len(SHORT_ALPHABET)]
        n //= len(SHORT_ALPHABET)
    return out


def extract_og(page_html):
    def meta(prop):
        m = re.search(r'<meta[^>]*property="%s"[^>]*content="([^"]*)"' % re.escape(prop), page_html, re.I)
        return P.htmllib.unescape(m.group(1)).strip() if m else ""
    return {"title": meta("og:title"), "image": meta("og:image").replace("//rafed", "/rafed") if meta("og:image") else ""}


def write_redirect(code, url, og):
    """يكتب s/<code>.html (يتجاوز لو موجودة بنفس الهدف). يرجّع True لو كُتب ملف جديد."""
    esc = lambda x: P.htmllib.escape(x or "", quote=True)
    target = urllib.parse.quote(urllib.parse.unquote(url), safe=":/%?=&#-_.~")
    title = og.get("title") or "جمعية العوامية الخيرية"
    html = ('<!DOCTYPE html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>%s</title>\n<meta name="robots" content="noindex">\n'
            '<meta property="og:type" content="article"><meta property="og:title" content="%s">\n'
            '<meta property="og:description" content="جمعية العوامية الخيرية للخدمات الاجتماعية">\n'
            '%s<meta property="og:url" content="%s"><link rel="canonical" href="%s">\n'
            '<meta http-equiv="refresh" content="0;url=%s">\n'
            '<script>location.replace(%s);</script>\n</head>\n'
            '<body style="font-family:sans-serif;text-align:center;padding:40px"><p>جارٍ فتح الخبر…</p><p><a href="%s">اضغط هنا إن لم تُحوَّل تلقائياً</a></p></body></html>\n'
            % (esc(title), esc(title),
               ('<meta property="og:image" content="%s"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="%s">\n' % (esc(og["image"]), esc(og["image"]))) if og.get("image") else "",
               esc(SHORT_HOST + code), esc(SHORT_HOST + code), esc(target), json.dumps(target), esc(target)))
    path = os.path.join(REPO_ROOT, "s", code + ".html")
    if os.path.exists(path) and open(path, encoding="utf8").read() == html:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf8").write(html)
    return True


def publish_short(pending_file, wait_seconds=300):
    """بعد نشر صفحات التحويل: ينتظر أن تصبح كل صفحة متاحة فعلاً، ثم يكتب الرابط المختصر بسجلها (لو ما فيه رابط يدوي)."""
    items = json.load(open(pending_file, encoding="utf8"))
    deadline = time.time() + wait_seconds
    todo = list(items)
    done = 0
    while todo and time.time() < deadline:
        left = []
        for it in todo:
            try:
                st, _, _ = http("%s%s?nocache=%d" % (SHORT_HOST, it["code"], int(time.time())), retries=1, timeout=20)
            except Exception:  # noqa: BLE001
                st = 0
            if st == 200:
                cur = fs_batch_get([it["rid"]]).get(it["rid"])
                if cur is not None and not cur.get("shortLink"):
                    fs_patch("events/" + it["rid"], {"shortLink": SHORT_HOST + it["code"]}, mask=["shortLink"])
                    print("  🔗 %s%s ← %s" % (SHORT_HOST, it["code"], it.get("label", "")))
                done += 1
            else:
                left.append(it)
        todo = left
        if todo:
            time.sleep(10)
    if todo:
        print("  ! لم تُنشر بعد: %s — ستُربط بالتشغيل القادم" % ", ".join(i["code"] for i in todo))
        json.dump(todo, open(pending_file, "w", encoding="utf8"), ensure_ascii=False)
    print("رُبط %d رابطاً مختصراً" % done)


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
    rec["syncHash"] = content_hash(parsed)
    rec["syncStamp"] = now      # لو بقي updatedAt == syncStamp فالسجل ما عُدِّل يدوياً — يجوز تحديثه بالكامل من الموقع
    return rec


def content_hash(parsed):
    core = {k: v for k, v in parsed.items() if k != "sourceUrl"}
    return hashlib.sha1(json.dumps(core, ensure_ascii=False, sort_keys=True).encode("utf8")).hexdigest()[:12]


def is_complete(f):
    """خبر مكتمل = اسم + تاريخ وفاة + تشييع (مكان/وقت) + مكان عزاء. الأخبار الحديثة الناقصة تُعاد قراءتها بكل مزامنة."""
    return bool(f.get("deceasedName") and (f.get("deathDateHijri") or f.get("deathDateGregorian"))
                and (f.get("funeralFrom") or f.get("funeralTime"))
                and (f.get("condolenceMenPlace") or f.get("condolenceWomenPlace")))


MERGE_SKIP = {"photoUrl", "nickname", "sourceUrl"}


def merge_changes(doc, parsed):
    """ما يُكتب على سجل قائم من نسخة الموقع الأحدث:
    - سجل لم يُعدَّل يدوياً (updatedAt == syncStamp): تُحدَّث كل حقوله التي تغيّرت بالموقع.
    - سجل عدّله موظف (أو سجل قديم بلا ختم): نملأ فقط الحقول الفارغة ولا نستبدل أي قيمة كُتبت — حتى لا نمسح تعديلات المستخدم.
    القيم الفارغة بالموقع لا تمسح قيمة موجودة أبداً."""
    untouched = bool(doc.get("syncStamp")) and doc.get("updatedAt") == doc.get("syncStamp")
    ch = {}
    for k, v in parsed.items():
        if k in MERGE_SKIP or v in ("", None):
            continue
        old = doc.get(k, "")
        if old == v:
            continue
        # قيمة بلا أي حرف/رقم (مثل ":" أو "-" من خبر ناقص وقت سحبه) تُعامل كفارغة فتُستبدل بالقيمة الحقيقية
        blank = old in ("", None) or not re.search(r"[0-9A-Za-z\u0621-\u064A]", str(old))
        if untouched or blank:
            ch[k] = v
    return ch, untouched


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


def load_state(listing):
    """وثيقة الحالة: ids = {بصمة الرابط: معرّف السجل}، skip = أخبار ليست إعلان وفاة. تُرحَّل تلقائياً من الصيغة القديمة (seen)."""
    state = fs_get(STATE_PATH)
    if state is not None and isinstance(state.get("ids"), dict):
        return state, dict(state["ids"]), set(state.get("skip") or [])
    url_ids = existing_url_ids()
    ids = {url_key(u): rid for u, rid in url_ids.items()}
    # الصيغة القديمة كانت تعدّ "المُشاهَد" متجاهَلاً حتى لو حُذف سجله — الآن سجل محذوف = يُعاد سحبه، فلا نرحّل المشاهَد كتجاهل
    print("ترحيل وثيقة الحالة: %d سجلاً مربوطاً برابطه" % len(ids))
    return state, ids, set()


def fetch_and_parse(it):
    page = fetch_entry(it)
    it["og"] = extract_og(page)
    return P.parse_entry(page, it["title"], it["url"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="يحلّل ويعرض فقط بدون أي كتابة")
    ap.add_argument("--backfill", action="store_true", help="يسحب كل أخبار الأرشيف غير الموجودة")
    ap.add_argument("--full", action="store_true", help="فحص كامل: يتحقق من وجود كل سجلات الأرشيف (لا أحدث النافذة فقط) ويعيد سحب المحذوف")
    ap.add_argument("--window", type=int, default=5, help="عدد أحدث الأخبار المفحوصة بالتشغيل الدوري لاكتشاف المحذوف/الناقص")
    ap.add_argument("--refresh-latest", type=int, default=5, help="أحدث كم خبراً تُعاد قراءة صفحتها كل مرة لالتقاط ما استُكمل/تغيّر بالموقع")
    ap.add_argument("--refresh-days", type=int, default=45, help="الأخبار الناقصة الأحدث من هذه المدة (يوماً) تُعاد قراءتها بكل مزامنة")
    ap.add_argument("--initial-count", type=int, default=20, help="عدد أحدث الأخبار المسحوبة بأول تشغيل بلا أي سجلات")
    ap.add_argument("--publish-short", metavar="FILE", help="ينتظر نشر صفحات التحويل ثم يكتب الروابط المختصرة بالسجلات (يُشغَّل بعد دفع ملفات s/)")
    ap.add_argument("--no-short", action="store_true", help="لا تُنشئ روابط مختصرة")
    ap.add_argument("--max-per-run", type=int, default=60, help="أقصى عدد أخبار جديدة يُسحب بالتشغيل الواحد")
    args = ap.parse_args()
    if args.publish_short:
        publish_short(args.publish_short)
        return
    t0 = time.time()
    pending_short = []

    def tick(label):
        print("   ⏱ %s: %.1fث" % (label, time.time() - t0))
    listing = fetch_listing()
    print("أخبار بالقائمة:", len(listing)); tick("قراءة قائمة الموقع")
    state, ids, skip = load_state(listing); tick("وثيقة الحالة")
    ids0, skip0 = dict(ids), set(skip)
    full = args.full or args.backfill
    check_items = listing if full else listing[:args.window]
    check_keys = {url_key(it["url"]) for it in check_items}

    # ----- ما الموجود فعلاً بقاعدة البيانات؟ (سجل حُذف من اللوحة يُعاد سحبه — الحذف ليس "تجاهلاً" دائماً) -----
    check_ids = [ids[url_key(it["url"])] for it in check_items if url_key(it["url"]) in ids]
    existing = fs_batch_get(check_ids)
    print("فحص %d سجلاً: موجود %d، مفقود/محذوف %d" % (len(check_ids), len(existing), len(check_ids) - len(existing))); tick("فحص السجلات")

    to_import = []
    for it in listing:
        k = url_key(it["url"])
        if k in skip:
            continue
        if not re.search(r"رحمة|ذمة|فقيد", it["title"]) or re.search(r"أماكن\s+عزاء", it["title"]):
            skip.add(k)                                            # ليس إعلان وفاة (مثل جداول العزاء الشهرية)
            continue
        if k not in ids:
            to_import.append(it)                                   # خبر جديد
        elif k in check_keys and ids[k] not in existing:
            to_import.append(it)                                   # سجل حُذف من اللوحة: يُعاد سحبه
    first_run = not ids
    if first_run and not args.backfill:
        marked = to_import[args.initial_count:]
        to_import = to_import[:args.initial_count]
        for it in marked:
            skip.add(url_key(it["url"]))
    if len(to_import) > args.max_per_run:
        print("تنبيه: %d خبراً للسحب، سيُسحب أحدث %d الآن والباقي بالتشغيل القادم" % (len(to_import), args.max_per_run))
        to_import = to_import[:args.max_per_run]

    # ----- ما يُعاد قراءته لالتقاط ما استُكمل/تغيّر بالموقع -----
    cutoff = (time.time() - args.refresh_days * 86400) * 1000
    to_refresh, seen_keys = [], set()
    for it in listing[:args.refresh_latest]:
        k = url_key(it["url"])
        if k in ids and ids[k] in existing and k not in seen_keys:
            to_refresh.append(it); seen_keys.add(k)
    for it in check_items:
        k = url_key(it["url"])
        d = existing.get(ids.get(k, ""))
        if d and k not in seen_keys and not is_complete(d) and (d.get("createdAt") or 0) > cutoff:
            to_refresh.append(it); seen_keys.add(k)
    print("جديد/محذوف للسحب: %d | تُعاد قراءته لالتقاط الاستكمال: %d" % (len(to_import), len(to_refresh)))

    # ----- قراءة الصفحات بالتوازي (أسرع بكثير من التتابع) -----
    jobs = {id(it): it for it in to_import + to_refresh}
    parsed_by, errors = {}, {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_and_parse, it): it for it in jobs.values()}
        for fut, it in futs.items():
            try:
                parsed_by[id(it)] = fut.result()
            except Exception as e:  # noqa: BLE001
                errors[id(it)] = str(e)

    tick("قراءة صفحات الأخبار")
    imported, updated, failed, prev_ts = 0, 0, 0, 0
    opt_new = {"deathHonorifics": set(), "funeralFrom": set(), "condolencePlaces": set(), "ageCategories": set()}

    def collect_opts(r):
        for key, fld in (("deathHonorifics", "honorific"), ("funeralFrom", "funeralFrom"), ("ageCategories", "ageCategory"),
                         ("condolencePlaces", "condolenceMenPlace"), ("condolencePlaces", "condolenceWomenPlace")):
            if r.get(fld):
                opt_new[key].add(r[fld])

    for it in reversed(to_import):          # الأقدم أولاً ليتطابق ترتيب الإدخال مع الترتيب الزمني
        try:
            if id(it) in errors:
                raise RuntimeError(errors[id(it)])
            if not re.search(r"رحمة|ذمة|فقيد", it["title"]) or re.search(r"أماكن\s+عزاء", it["title"]):
                print("  - تجاهل خبر ليس إعلان وفاة: " + it["title"][:70])
                skip.add(url_key(it["url"]))
                continue
            parsed = parsed_by[id(it)]
            if not parsed.get("deceasedName"):
                raise RuntimeError("لم يُستخرج اسم المتوفى")
            photo = upload_photo(parsed["photoUrl"]) if (parsed.get("photoUrl") and not args.dry_run) else ""
            rec = build_record(parsed, it["title"], it["url"], photo, prev_ts)
            prev_ts = rec["createdAt"]
            label = "%s %s | %s | %s" % (rec.get("honorific", ""), rec["deceasedName"], rec.get("deathDateGregorian", "؟"), rec.get("funeralFrom", ""))
            if args.dry_run:
                print("  [dry] جديد: " + label)
            else:
                fs_patch("events/" + rec["id"], dict(rec))
                ids[url_key(it["url"])] = rec["id"]
                print("  ✓ جديد: " + label)
                if not args.no_short:
                    c = short_code(it["url"]); write_redirect(c, it["url"], it.get("og") or {})
                    pending_short.append({"rid": rec["id"], "code": c, "label": label})
            collect_opts(rec)
            imported += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("  ✗ %s — %s" % (it["title"][:60], e))

    for it in to_refresh:
        k = url_key(it["url"])
        try:
            if id(it) in errors:
                raise RuntimeError(errors[id(it)])
            parsed = parsed_by[id(it)]
            doc = existing[ids[k]]
            h = content_hash(parsed)
            # لا نتوقف عند تطابق البصمة: قد يكون الحقل ناقصاً بالسجل رغم أن الخبر لم يتغيّر (مثلاً حُذفت قيمته أو كانت فارغة
            # وقت السحب الأول) — الدمج نفسه رخيص ولا يكتب شيئاً إلا لو وُجد فرق فعلي
            if not args.dry_run and not args.no_short and not doc.get("shortLink"):
                c = short_code(it["url"]); write_redirect(c, it["url"], it.get("og") or {})
                pending_short.append({"rid": ids[k], "code": c, "label": doc.get("deceasedName", "")[:30]})
            ch, untouched = merge_changes(doc, parsed)
            if parsed.get("photoUrl") and not doc.get("photo") and not args.dry_run:
                p = upload_photo(parsed["photoUrl"])
                if p:
                    ch["photo"] = p
            label = "%s | %s" % (doc.get("deceasedName", "")[:30], ",".join(sorted(ch)) or "بلا تغيير جوهري")
            if ch:
                now = int(time.time() * 1000)
                upd = dict(ch)
                upd["syncHash"] = h
                if untouched:
                    upd["updatedAt"] = now
                    upd["syncStamp"] = now      # يبقى "غير معدَّل يدوياً"
                if args.dry_run:
                    print("  [dry] تحديث: " + label)
                else:
                    fs_patch("events/" + ids[k], upd, mask=list(upd.keys()))
                    print("  ↻ تحديث من الموقع: " + label + ("" if untouched else " (ملء الفارغ فقط — السجل معدَّل يدوياً)"))
                collect_opts({**doc, **ch})
                updated += 1
            elif doc.get("syncHash") != h and not args.dry_run:
                fs_patch("events/" + ids[k], {"syncHash": h}, mask=["syncHash"])
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("  ✗ تحديث %s — %s" % (it["title"][:60], e))

    tick("الكتابة")
    if pending_short:
        json.dump(pending_short, open(os.path.join(REPO_ROOT, "short_pending.json"), "w", encoding="utf8"), ensure_ascii=False)
        print("صفحات تحويل مختصرة بانتظار النشر:", len(pending_short))
    if not args.dry_run:
        merge_options(opt_new)
        st = {"lastRun": int(time.time() * 1000), "lastImported": imported, "lastUpdated": updated, "lastFailed": failed,
              "lastError": "" if not failed else "فشل %d عنصراً — راجع سجل التشغيل" % failed}
        if ids != ids0 or skip != skip0 or not (state and isinstance(state.get("ids"), dict)):
            st.update({"ids": ids, "skip": sorted(skip), "seen": []})     # الخريطة الكبيرة تُكتب فقط عند تغيّرها
        fs_patch(STATE_PATH, st, mask=list(st.keys()))
    print("انتهى بـ %.1f ثانية: جديد %d، محدَّث %d، فشل %d" % (time.time() - t0, imported, updated, failed))
    if failed and not (imported or updated):
        sys.exit(1)


if __name__ == "__main__":
    main()
