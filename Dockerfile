# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 studyos \
    && useradd --uid 10001 --gid studyos --no-create-home studyos

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY --from=frontend-build /build/dist ./static
RUN mkdir -p /app/data/uploads && chown -R studyos:studyos /app

USER studyos
VOLUME ["/app/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:8000/api/health > /dev/null || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
