# -*- coding: utf-8 -*-
"""
محلّل صفحات "أخبار الوفيات" بموقع جمعية العوامية (awamiach.sa) — يحوّل صفحة خبر واحدة لسجل وفاة
بنفس حقول قسم الوفيات في لوحة التحكم. صفحات الموقع بقالبين (قديم بلا صورة/وقت تشييع، وحديث بصورة ووقت ومكان
تشييع) وبصياغات تتغيّر من خبر لخبر، لذلك التحليل يعتمد على عناوين الأقسام لا على مواضع ثابتة.
مكتبة قياسية فقط (بدون تثبيت أي حزمة) حتى يشتغل بأي بيئة بدون إعداد.
"""
import html as htmllib
import re

BASE = "https://www.awamiach.sa/"
GREG_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
HIJRI_MONTHS = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"]
WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]

# مسمّيات ترد قبل الاسم بعنوان الخبر
HONORIFICS = ["الحاجة", "الحاج", "الشابة", "الشاب", "الطفلة", "الطفل", "السيدة", "السيد", "الشيخة", "الشيخ",
              "الدكتورة", "الدكتور", "المهندسة", "المهندس", "الأستاذة", "الأستاذ", "المرحومة", "المرحوم"]
FEMALE_HON = {"الحاجة", "الشابة", "الطفلة", "السيدة", "الشيخة", "الدكتورة", "المهندسة", "الأستاذة", "المرحومة"}
MALE_HON = {"الحاج", "الشاب", "الطفل", "السيد", "الشيخ", "الدكتور", "المهندس", "الأستاذ", "المرحوم"}
AGE_BY_HON = {"الطفل": "طفل", "الطفلة": "طفل", "الشاب": "شاب", "الشابة": "شاب", "الحاج": "بالغ", "الحاجة": "بالغ"}

_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def norm_ar(s):
    """توحيد الهمزات/الألف/التاء المربوطة/الياء لمطابقة أسماء الأشهر والأيام بصياغاتها المتعددة."""
    s = s.translate(_AR_DIGITS)
    s = re.sub("[ً-ٰٟـ]", "", s)
    return (s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه"))


def _month_index(word, months):
    w = norm_ar(word)
    for i, m in enumerate(months):
        if norm_ar(m) == w:
            return i
    return -1


def html_to_lines(fragment):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", fragment, flags=re.S)
    t = re.sub(r"<img[^>]*src=\"([^\"]*)\"[^>]*>", r"\n[IMG \1]\n", t)
    t = re.sub(r"<a[^>]*href=\"([^\"]*)\"[^>]*>", r"[LINK \1] ", t)
    t = re.sub(r"</?(br|p|div|h\d|li|ul|span|strong|tr|td|table|b)\b[^>]*>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = htmllib.unescape(t)
    out = []
    for x in t.split("\n"):
        x = re.sub(r"[‎‏⁦-⁩‪-‮⁠﻿]", "", x)
        x = re.sub(r"[⏱⚠️⏰✅❗●▪◆◇★☆]|\ufe0f", " ", x)
        x = re.sub(r"\s+", " ", x).strip()
        if x:
            out.append(x)
    return out


def article_lines(page_html):
    """أسطر محتوى الخبر فقط (بدون قوائم الموقع الجانبية)."""
    i = page_html.find("<div class=page-container>")
    if i < 0:
        return []
    seg = page_html[i:]
    for marker in ("<div class=col-md-5", '<div class="col-md-5', "generic1_block"):
        k = seg.find(marker, 50)
        if k > 0:
            seg = seg[:k]
            break
    return html_to_lines(seg[:60000])


def split_title(title):
    """'إلى رحمة الله تعالى الحاج عبدالعزيز محمد مهدي الفرج' -> (المسمى، الاسم، العائلة، ما بين قوسين)."""
    t = re.sub(r"^\s*(?:انتقل[ت]?\s+)?(?:إلى|الى)\s+رحمة\s+الله\s+تعالى\s*", "", title.strip())
    nick = ""
    m = re.search(r"[\(（]([^)）]*)[\)）]", t)
    if m:
        nick = m.group(1).strip()
        t = (t[:m.start()] + " " + t[m.end():])
    t = re.sub(r"\s+", " ", t).strip(" -–—")
    parts = t.split(" ") if t else []
    hon = ""
    if len(parts) > 2 and parts[0] in HONORIFICS:
        hon = parts.pop(0)
    name = " ".join(parts)
    family = ""
    if len(parts) >= 2:
        family = parts[-1]
        if len(parts) >= 3 and parts[-2] in ("آل", "ال", "أبو", "ابو", "بن", "ابن"):
            family = parts[-2] + " " + parts[-1]
    return hon, name, family, nick


# عناوين الأقسام (بادئة اختيارية: - ■ ◼ ▣ ▪ ◀ ⬟)
_BUL = r"^[\-–—■◼▣▪◀◄⬟●•◈\s]*"
_REL_HEADS = [
    ("spouse", r"(?:زوجة|زوجتا|زوجات|زوج)\s+(?:ال)?فقيد[ةه]?"),
    ("sons", r"أبناء\s+(?:ال)?فقيد[ةه]?"),
    ("daughters", r"بنات\s+(?:ال)?فقيد[ةه]?"),
    ("brothers", r"إخوان\s+(?:ال)?فقيد[ةه]?"),
    ("sisters", r"أخوات\s+(?:ال)?فقيد[ةه]?"),
]
_TIME_RE = re.compile(r"(\d{1,2})\s*(?:[:.]\s*(\d{2}))?\s*(صباحاً|صباحا|ظهراً|ظهرا|عصراً|عصرا|مساءً|مساءا|مساء|ليلاً|ليلا|ص|ع|م)?(?![\d\u0621-\u064A])")


def parse_time(text):
    """'09:30م' / '05:20ع' / '5 عصراً' / '٠٤:٠٠عصراً' -> 'HH:MM' بنظام 24 ساعة
    (ص/صباحاً = AM، ع/عصراً/م/مساءً/ليلاً = PM، ظهراً = بعد الظهر). بلا لاحقة ولا دقائق لا يُعتبر وقتاً."""
    t = re.sub("[\u064B-\u065F\u0670]", "", text.translate(_AR_DIGITS))   # تنوين "عصراً/عصرًا" وغيره
    for m in _TIME_RE.finditer(t):
        if m.group(2) is None and not m.group(3):
            continue
        h, mi, suf = int(m.group(1)), int(m.group(2) or 0), m.group(3) or ""
        if h > 23 or mi > 59:
            continue
        sn = norm_ar(suf)
        if sn in ("ع", "م", "عصرا", "مساء", "مساءا", "ليلا", "ظهرا"):
            if h < 12:
                h += 12
            if sn == "ظهرا" and h == 12 + 12:
                h = 12
        elif sn in ("ص", "صباحا"):
            if h == 12:
                h = 0
        return "%02d:%02d" % (h, mi)
    return ""


def _find_weekday(text):
    n = norm_ar(text)
    for d in WEEKDAYS:
        if norm_ar(d) in n:
            return d
    return ""


def _clean_value(s):
    s = re.sub(r"\s+", " ", s).strip(" -–—.،")
    return s


def parse_entry(page_html, list_title="", url=""):
    L = article_lines(page_html)
    rec = {}
    txt = "\n".join(L)

    # ----- الاسم والمسمى -----
    title = ""
    for i, l in enumerate(L):
        if "رحمة الله تعالى" in l and not re.search(r"قال تعالى|رحم الله من|ببالغ|يتقدم|﴿", l):
            after = re.sub(r"^.*?رحمة الله تعالى", "", l).strip()
            if after:
                title = after
            elif i + 1 < len(L):
                title = L[i + 1]   # القالب الحديث: الاسم بالسطر التالي
            break
    hon, name, family, nick = split_title(list_title or title)
    if not name and title:
        hon, name, family, nick = split_title(title)
    rec["honorific"] = hon
    rec["deceasedName"] = name
    rec["deceasedFamily"] = family
    if nick:
        rec["nickname"] = nick
    if hon in FEMALE_HON:
        rec["gender"] = "أنثى"
    elif hon in MALE_HON:
        rec["gender"] = "ذكر"
    elif re.search(r"الفقيد[ةه]", txt):
        rec["gender"] = "أنثى"
    elif "الفقيد" in txt:
        rec["gender"] = "ذكر"
    if hon in AGE_BY_HON:
        rec["ageCategory"] = AGE_BY_HON[hon]

    # ----- الصورة (القالب الحديث فقط) -----
    m = re.search(r"\[IMG (rafed/uploads/website_editor/[^\]]+)\]", txt)
    if m:
        rec["photoUrl"] = BASE + m.group(1)

    # ----- تقسيم الأسطر لأقسام حسب عناوينها -----
    def head_of(l):
        base = re.sub(_BUL, "", l.strip())
        for key, pat in _REL_HEADS:
            m2 = re.match(r"^(" + pat + r")\s*[:：]?\s*(.*)$", base)
            if m2:
                return ("rel", key, m2.group(1), m2.group(2))
        if re.match(r"^ذوو\s+ال?فقيد", base):
            return ("relhdr", None, base, "")
        m2 = re.match(r"^(والد[ةه]?[^:：]{0,40}|إخوان وأخوات[^:：]{0,40}|أخوات وإخوان[^:：]{0,40}|أحفاد[^:：]{0,30}|أعمام[^:：]{0,30}|أصهار[^:：]{0,30})\s*[:：]\s*(.*)$", base)
        if m2:
            return ("rel", "other", m2.group(1), m2.group(2))
        if re.match(r"^تاريخ\s+الوفاة", base):
            return ("date", None, base, base.split(":", 1)[1] if ":" in base else "")
        if re.match(r"^(?:⬟\s*)?وقت\s+و?مكان\s+التشييع", base):
            return ("funeral", None, base, "")
        if re.match(r"^التشييع\s*[:：]?", base):
            return ("funeral", None, base, base.split(":", 1)[1] if ":" in base else re.sub(r"^التشييع\s*", "", base))
        if re.match(r"^أماكن\s+العزاء", base):
            return ("condol", None, base, "")
        if re.match(r"^روابط\s+التعزي", base):
            return ("links", None, base, "")
        if re.match(r"^للرجال\s*[:：]?", base):
            return ("men", None, base, re.sub(r"^للرجال\s*[:：]?\s*", "", base))
        if re.match(r"^للنساء\s*[:：]?", base):
            return ("women", None, base, re.sub(r"^للنساء\s*[:：]?\s*", "", base))
        if re.match(r"^(ببالغ الحزن|يتقدم|رحم الله من|صدقة ليلة|قال تعالى|﴿|\"|إِنَّا|انتقل)", base):
            return ("stop", None, base, "")
        return None

    sec, sub = None, None
    rel, other = {}, []
    date_lines, funeral_lines, condol_hdr = [], [], ""
    men, women, mlink, wlink = [], [], [], []
    for l in L:
        h = head_of(l)
        if h:
            kind, key, hdr, inline = h
            inline = inline.strip()
            if kind == "rel":
                sec, sub = ("rel", key), None
                if key == "other":
                    other.append([hdr.strip(), [inline] if inline else []])
                else:
                    rel.setdefault(key, [])
                    if inline:
                        rel[key].append(inline)
            elif kind == "relhdr":
                sec, sub = ("relhdr", None), None
            elif kind == "date":
                sec, sub = ("date", None), None
                if inline:
                    date_lines.append(inline)
            elif kind == "funeral":
                sec, sub = ("funeral", None), None
                if inline:
                    funeral_lines.append(inline)
            elif kind == "condol":
                sec, sub, condol_hdr = ("condol", None), None, hdr
            elif kind == "links":
                sec, sub = ("links", None), None
            elif kind in ("men", "women"):
                sub = kind
                if not (sec and sec[0] == "links"):
                    sec = ("condol", None)
                    if inline:
                        (men if kind == "men" else women).append(inline)
                else:
                    mm = re.search(r"https?://\S+", inline)
                    if mm:
                        (mlink if kind == "men" else wlink).append(mm.group(0).rstrip(".،"))
            elif kind == "stop":
                sec, sub = ("stop", None), None
            continue
        if not sec:
            continue
        s0, k0 = sec
        if s0 == "rel":
            if k0 == "other":
                if other:
                    other[-1][1].append(l)
            else:
                rel[k0].append(l)
        elif s0 == "date":
            date_lines.append(l)
        elif s0 == "funeral":
            if not l.startswith("[IMG") and not l.startswith("[LINK"):
                funeral_lines.append(l)
        elif s0 == "condol" and sub:
            (men if sub == "men" else women).append(l)
        elif s0 == "links":
            mm = re.search(r"https?://\S+", l)
            if mm and sub:
                (mlink if sub == "men" else wlink).append(mm.group(0).rstrip(".،"))

    def join_rel(v):
        vals = []
        for a in v:
            a = re.sub(r"^[\-–—■◼▣▪]+\s*", "", a).strip()
            a = re.sub(r"[\s،,.]+$", "", a)          # نقطة/فاصلة ختامية بآخر السطر
            if a:
                vals.append(a)
        out = "، ".join(vals)
        return re.sub(r"(?:\s*[،,]\s*){2,}", "، ", out)   # فاصلتان متتاليتان بعد الدمج -> فاصلة واحدة
    rec["spouseName"] = join_rel(rel.get("spouse", []))
    rec["sons"] = join_rel(rel.get("sons", []))
    rec["daughters"] = join_rel(rel.get("daughters", []))
    rec["brothers"] = join_rel(rel.get("brothers", []))
    rec["sisters"] = join_rel(rel.get("sisters", []))
    oth = []
    for hdr, vals in other:
        v = join_rel(vals)
        if v:
            oth.append(hdr.strip(" :：") + ": " + v)
    rec["otherRelatives"] = "\n".join(oth)

    # ----- تاريخ الوفاة -----
    dtxt = norm_ar(" ".join(date_lines))
    day = _find_weekday(" ".join(date_lines))
    if day:
        rec["deathDay"] = day
    hij_alt = {"ربيع الثاني": 3, "ربيع الاخر": 3, "جمادي الاول": 4, "جمادي الاولي": 4, "جمادي الاخر": 5, "جمادي الاخره": 5,
               "جمادي الثاني": 5, "جمادي الثانيه": 5, "ذي القعده": 10, "ذي الحجه": 11}
    hij_map = {norm_ar(m): i for i, m in enumerate(HIJRI_MONTHS)}
    hij_map.update({norm_ar(k): v for k, v in hij_alt.items()})
    greg_map = {norm_ar(m): i for i, m in enumerate(GREG_MONTHS)}
    greg_map.update({"اغسطس": 7, "ابريل": 3})
    def find_date(month_map, y_lo, y_hi):
        pat = r"(\d{1,2})\s*(" + "|".join(sorted((re.escape(k) for k in month_map), key=len, reverse=True)) + r")\s*(\d{4})"
        for mm in re.finditer(pat, dtxt):
            if y_lo <= int(mm.group(3)) <= y_hi:
                return int(mm.group(1)), month_map[mm.group(2)], int(mm.group(3))
        return None
    mh = find_date(hij_map, 1300, 1600)
    mg = find_date(greg_map, 1900, 2100)
    if mh:
        rec["deathDateHijri"] = "%d %s %d هـ" % (mh[0], HIJRI_MONTHS[mh[1]], mh[2])
        rec["deathMonthHijri"] = HIJRI_MONTHS[mh[1]]
        rec["hijriYear"] = str(mh[2])
    if mg:
        rec["deathDateGregorian"] = "%04d-%02d-%02d" % (mg[2], mg[1] + 1, mg[0])
        rec["deathMonthGregorian"] = GREG_MONTHS[mg[1]]
        rec["gregorianYear"] = str(mg[2])

    # ----- التشييع -----
    ftxt = " ".join(funeral_lines)
    if ftxt:
        fd = _find_weekday(ftxt)
        if fd:
            rec["funeralDay"] = fd
        ft = parse_time(ftxt)
        if ft:
            rec["funeralTime"] = ft
        rest = re.sub("[\u064B-\u065F\u0670]", "", ftxt.translate(_AR_DIGITS))
        wk = {norm_ar(d) for d in WEEKDAYS} | {norm_ar("الأثنين")}
        rest = " ".join(w for w in rest.split() if norm_ar(w) not in wk and w not in ("يوم", "ال"))
        rest = _TIME_RE.sub(lambda m: " " if (m.group(2) is not None or m.group(3)) else m.group(0), rest)
        rest = re.sub(r"يعلن\s+عنه\s+لاحق[اً]?|الساعة|الليلة|ليلة|اليوم|غد[اً]|هذا|\|", " ", rest)
        rest = re.sub(r"^[\s\-–—:،.]*(?:من\s+)?", "", _clean_value(rest))
        place = _clean_value(rest)
        if place and not re.fullmatch(r"[\d\s:.\-]*", place):
            rec["funeralFrom"] = place

    # ----- أماكن العزاء -----
    if condol_hdr:
        mc = re.search(r"\(([^)]*)\)", condol_hdr)
        if mc:
            rec["condolenceStart"] = _clean_value(re.sub(r"^\s*(?:بدءا|بدءً|بدءًا|بدءاً|بدأ|تبدأ)\s*(?:من)?\s*", "", mc.group(1)))

    def parse_condol(lines, start_out):
        places, times = [], []
        for x in lines:
            x = _clean_value(x.replace("⚠️", " "))
            if not x or x in ("-", ":"):
                continue
            m0 = re.match(r"^(?:ت[بب]دأ|بدءا[ًً]?|بدءاً)\s+(.+?)\s+في\s+(.+)$", x)
            if m0:                       # "تبدأ هذه الليلة في حسينية ..."
                start_out.append(_clean_value(m0.group(1)))
                x = m0.group(2)
            elif re.match(r"^(?:بدءا|بدءاً|بدءً|بدءًا|تبدأ)\b", x) and not re.search(r"حسيني|مسجد|مأتم|قاعة|بيت", x):
                start_out.append(_clean_value(re.sub(r"^(?:بدءا|بدءاً|بدءً|بدءًا|تبدأ)\s*(?:من)?\s*", "", x)))
                continue
            m1 = re.search(r"[،,]?\s*(?:أوقات\s+)?القراءة\s*[:：]?\s*(.+)$", x)
            if m1:
                p = _clean_value(x[:m1.start()])
                if p:
                    places.append(p)
                t = _clean_value(m1.group(1))
                if t:
                    times.append(t.translate(_AR_DIGITS))
            elif re.search(r"\d\s*[:.]\s*\d{2}|الساعة", x.translate(_AR_DIGITS)) and not re.search(r"حسيني|مسجد|مأتم|قاعة|بيت", x):
                times.append(_clean_value(x.translate(_AR_DIGITS)))
            else:
                places.append(x)
        return _clean_value(" ".join(places)), _clean_value(" ، ".join(times))
    start_bits = []
    rec["condolenceMenPlace"], rec["condolenceMenTimes"] = parse_condol(men, start_bits)
    rec["condolenceWomenPlace"], rec["condolenceWomenTimes"] = parse_condol(women, start_bits)
    if start_bits and not rec.get("condolenceStart"):
        rec["condolenceStart"] = start_bits[0]
    rec["condolenceMenLink"] = mlink[0] if mlink else ""
    rec["condolenceWomenLink"] = wlink[0] if wlink else ""

    if url:
        rec["sourceUrl"] = url
    return rec
