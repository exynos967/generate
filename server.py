#!/usr/bin/env python3
"""Serve the static Video Studio site and host uploaded reference images.

The frontend posts image files to /api/upload/file. This server stores the file
under ./uploads and returns a public URL that the video API can fetch.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import posixpath
import uuid
from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit


MAX_UPLOAD_BYTES = 20 * 1024 * 1024
UPLOAD_ROUTE = "/api/upload/file"
UPLOAD_URL_PREFIX = "/uploads"
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
}


def json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class VideoStudioHandler(SimpleHTTPRequestHandler):
    server_version = "LLMVideoStudio/1.0"
    public_base_url = ""
    site_directory = Path(".")
    upload_dir = Path("uploads")

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(self.site_directory), **kwargs)

    def do_GET(self) -> None:
        request_path = urlsplit(self.path).path
        if request_path == "/healthz":
            self.send_json(HTTPStatus.OK, {"ok": True})
            return
        if request_path == "/":
            self.path = "/login.html"
        super().do_GET()

    def do_OPTIONS(self) -> None:
        if urlsplit(self.path).path != UPLOAD_ROUTE:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if urlsplit(self.path).path != UPLOAD_ROUTE:
            self.send_error(HTTPStatus.NOT_FOUND, "Upload endpoint not found")
            return

        try:
            payload = self.handle_upload()
        except UploadError as error:
            self.send_json(error.status, {"error": error.message})
            return
        except Exception as error:  # noqa: BLE001 - keep server alive and return JSON
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
            return

        self.send_json(HTTPStatus.OK, payload)

    def translate_path(self, path: str) -> str:
        """Keep SimpleHTTPRequestHandler static serving, but normalize safely."""
        path = urlsplit(path).path
        path = posixpath.normpath(unquote(path))
        words = [part for part in path.split("/") if part]
        resolved = Path(self.directory)
        for word in words:
            if word in {".", ".."}:
                continue
            resolved = resolved / word
        return str(resolved)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def handle_upload(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            raise UploadError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "请使用 multipart/form-data 上传图片。")

        length = self.get_content_length()
        if length <= 0:
            raise UploadError(HTTPStatus.BAD_REQUEST, "上传内容为空。")
        if length > MAX_UPLOAD_BYTES:
            raise UploadError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "图片不能超过 20MB。")

        body = self.rfile.read(length)
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body,
        )

        file_part = None
        for part in message.iter_parts():
            field_name = part.get_param("name", header="content-disposition")
            if field_name == "file" and part.get_filename():
                file_part = part
                break

        if file_part is None:
            raise UploadError(HTTPStatus.BAD_REQUEST, "没有找到 file 字段。")

        image_bytes = file_part.get_payload(decode=True) or b""
        if not image_bytes:
            raise UploadError(HTTPStatus.BAD_REQUEST, "图片内容为空。")

        media_type = file_part.get_content_type()
        if media_type not in ALLOWED_IMAGE_TYPES:
            raise UploadError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "只允许上传 jpg、png、webp、gif、avif 图片。")

        suffix = self.safe_suffix(file_part.get_filename() or "", media_type)
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        target_dir = Path(self.directory) / self.upload_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / stored_name
        target_path.write_bytes(image_bytes)

        public_url = f"{self.get_public_base_url()}{UPLOAD_URL_PREFIX}/{stored_name}"
        return {
            "url": public_url,
            "data": {"url": public_url},
            "filename": stored_name,
            "size": len(image_bytes),
            "content_type": media_type,
        }

    def get_content_length(self) -> int:
        try:
            return int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return 0

    def safe_suffix(self, filename: str, media_type: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
            return suffix
        return mimetypes.guess_extension(media_type) or ".img"

    def get_public_base_url(self) -> str:
        if self.public_base_url:
            return self.public_base_url.rstrip("/")

        proto = self.headers.get("X-Forwarded-Proto")
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host")
        if not proto:
            proto = "https" if self.server.server_port == 443 else "http"
        return f"{proto}://{host}".rstrip("/")

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class UploadError(Exception):
    def __init__(self, status: HTTPStatus, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LLM Video Studio static server with image upload")
    parser.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"), help="监听地址，默认 0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "4173")), help="监听端口，默认 4173")
    parser.add_argument("--directory", default=os.getenv("SITE_DIRECTORY", "."), help="静态网站目录，默认当前目录")
    parser.add_argument(
        "--public-base-url",
        default=os.getenv("PUBLIC_BASE_URL", ""),
        help="公网访问地址，例如 https://video.example.com；不填则从 Host / X-Forwarded-* 推断",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    directory = Path(args.directory).resolve()
    handler_class = type(
        "ConfiguredVideoStudioHandler",
        (VideoStudioHandler,),
        {
            "site_directory": directory,
            "public_base_url": args.public_base_url,
        },
    )

    server = ThreadingHTTPServer((args.host, args.port), handler_class)
    print(f"Serving {directory} on http://{args.host}:{args.port}")
    if args.public_base_url:
        print(f"Upload URLs will use {args.public_base_url.rstrip('/')}{UPLOAD_URL_PREFIX}/...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
