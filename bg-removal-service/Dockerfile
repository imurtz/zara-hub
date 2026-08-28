FROM python:3.11-slim

WORKDIR /app

# مكتبة نظامية يحتاجها onnxruntime/pillow لمعالجة الصور
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# نحمّل نموذج rembg وقت بناء الصورة (لا وقت التشغيل) — يلغي زمن تحميل شبكي إضافي
# عند "برود" الخدمة (أول طلب بعد فترة خمول)، لأن النموذج يصبح جزءاً من طبقات الصورة نفسها
RUN python -c "from rembg import new_session; new_session('u2net_human_seg')"

COPY main.py .

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
