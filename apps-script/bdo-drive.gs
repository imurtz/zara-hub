/**
 * بوابة زارة — رفع نسخ أوامر الصرف (PDF) إلى Google Drive
 * يُنشأ كسكربت مستقل في حساب قوقل الذي يملك المجلد، ويُنشر: نشر ← تطبيق ويب ← التنفيذ: أنا ← الوصول: أي شخص.
 * الترتيب في درايف:  أوامر الصرف / المبنى الإداري / 2026 / أمر صرف 122 — ….pdf
 * كل تصدير يُحفظ ملفاً مستقلاً بتاريخه ووقته — لا يُحذف ولا يُستبدل أي ملف سابق أبداً.
 * لا يقبل إلا ملفات PDF حقيقية بحجم معقول، ولا يقرأ ولا يعيد أي ملف آخر من درايف.
 */
const ROOT_FOLDER_ID = "";            // اختياري: معرّف مجلد موجود — إن تُرك فارغاً يُنشأ مجلد «أوامر الصرف» في جذر درايف
const ROOT_NAME = "أوامر الصرف";
const MAX_BYTES = 15 * 1024 * 1024;

function doGet() { return out_({ ok: true, ping: "zara-bdo" }); }

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.kind !== "zara-bdo") throw new Error("طلب غير معروف");
    const no = String(d.no || "").replace(/[^\d]/g, "");
    if (!no) throw new Error("رقم الأمر مفقود");
    const name = String(d.name || "").replace(/[\\/:*?"<>|\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!/\.pdf$/i.test(name)) throw new Error("اسم الملف غير صالح");
    const bytes = Utilities.base64Decode(String(d.data || ""));
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("حجم الملف غير مقبول");
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "%PDF") throw new Error("الملف ليس PDF");

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const group = String(d.group || "المبنى الإداري").replace(/[\\/]/g, " ").slice(0, 60);
      const year = /^\d{4}$/.test(String(d.year)) ? String(d.year) : String(new Date().getFullYear());
      const folder = sub_(sub_(root_(), group), year);
      const file = folder.createFile(Utilities.newBlob(bytes, "application/pdf", name));
      return out_({ ok: true, url: file.getUrl(), id: file.getId(), folder: folder.getUrl() });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function root_() {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
}
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
