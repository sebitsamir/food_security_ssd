FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MODELS_DIR=/models
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app app
COPY alembic alembic
COPY alembic.ini .
COPY scripts scripts
COPY data data
COPY models /models

# Model artifacts live outside the image: mount them at /models (read-only for the API).
RUN useradd --system --uid 10001 app && mkdir /models && chown app /models
USER app
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=4s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

# Behind a load balancer set FORWARDED_ALLOW_IPS to its address (not "*") so per-user rate limits work.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\""]
