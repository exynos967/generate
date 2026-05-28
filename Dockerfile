FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=4173 \
    SITE_DIRECTORY=/app \
    PUBLIC_BASE_URL=

WORKDIR /app

COPY server.py index.html login.html styles.css video-studio.js app.js ./

RUN mkdir -p /app/uploads

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4173/healthz', timeout=3)"

CMD ["python", "server.py"]
