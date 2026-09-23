#!/usr/bin/env python3
"""Bind a finished local film to a real, metadata-only TITMAS Sandbox call.

This is a schema preflight, never an architectural review or signed outcome
receipt. Only a localhost SSH tunnel may be used; no media bytes are sent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote(base: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"Accept": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = Request(base + path, payload, headers, method="POST" if payload is not None else "GET")
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            return None

    try:
        with build_opener(ProxyHandler({}), NoRedirect).open(request, timeout=20) as response:
            status, data = response.status, response.read(65537)
    except HTTPError as error:
        status, data = error.code, error.read(65537)
    if len(data) > 65536:
        raise RuntimeError("TITMAS response exceeds 64 KiB")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise RuntimeError("TITMAS returned a non-object response")
    return status, value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path, help="Completed renderer output directory")
    parser.add_argument("--base-url", default="http://127.0.0.1:18091/sandbox/v0.1/")
    parser.add_argument("--out", type=Path, help="New JSON result path; defaults inside the run directory")
    args = parser.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != "/sandbox/v0.1/":
        raise ValueError("base URL must be a local loopback tunnel ending /sandbox/v0.1/")
    run = args.run.resolve(strict=True)
    out = args.out or run / "titmas-sandbox-preflight.json"
    if out.exists():
        raise ValueError("result path already exists; select a new path for a new call")
    manifest_bytes = (run / "run.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("status") != "TECHNICAL_PASS_CONTENT_REVIEW_PENDING":
        raise ValueError("renderer run must be technically complete")
    if manifest.get("adapterId") != "guanque" or manifest.get("capture", {}).get("mode") != "film":
        raise ValueError("only completed guanque film runs are supported")
    output = manifest.get("output", {})
    if output.get("video") != "guanque-pilot.mp4":
        raise ValueError("unexpected video path in run manifest")
    video_bytes = (run / "guanque-pilot.mp4").read_bytes()
    video_sha = digest(video_bytes)
    if video_sha != output.get("sha256"):
        raise ValueError("video digest changed after rendering")
    cover_sha = digest((run / "cover.png").read_bytes())
    if cover_sha != output.get("coverSha256"):
        raise ValueError("cover digest changed after rendering")

    health_status, health = remote(args.base_url, "health")
    if health_status != 200 or health.get("service") != "titmas-sandbox-gateway" or health.get("version") != "0.1" or health.get("production_ready") is not False:
        raise RuntimeError("unexpected TITMAS service identity or maturity")
    # The credential stays inside this process; neither its value nor the
    # Authorization header is written to disk or included in diagnostics.
    keychain = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-s", "titmas-sandbox-gateway", "-a", "internal-operator-preview-01", "-w"],
        capture_output=True, check=True, timeout=5,
    )
    token = keychain.stdout.decode().rstrip("\n")
    if not token:
        raise RuntimeError("TITMAS Keychain credential is empty")
    status_code, status = remote(args.base_url, "status", token)
    if status_code != 200 or status.get("REMOTE_SCHEMA_PREFLIGHT") is not True or status.get("PRODUCTION_READY") is not False:
        raise RuntimeError("TITMAS sandbox status does not authorize bounded preflight")
    schema_status, schema = remote(args.base_url, "schemas/evidence-reference-object", token)
    if schema_status != 200 or schema.get("title") is None:
        raise RuntimeError("TITMAS evidence-reference schema unavailable")

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    request = {
        "object_id": f"guanque-video-{video_sha[:16]}",
        "object_type": "EVIDENCE_REFERENCE",
        "version": "v0.1",
        "source": {"namespace": "external:3d-building-agent-pipeline", "source_id": "architecture-video-pipeline", "version": "r2", "status": "DECLARED"},
        "status": "DECLARED",
        "created_at": now,
        "updated_at": now,
        "limitations": ["Reference metadata only; no media uploaded", "Schema preflight does not inspect video content or create a signed outcome receipt"],
        "evidence_id": f"guanque-video-{video_sha[:16]}",
        "execution_reference": {"reference_id": manifest["runId"], "reference_type": "EXECUTION", "namespace": "external:3d-building-agent-pipeline", "version": "1", "source": "architecture-video-pipeline", "status": "DECLARED"},
        "source_reference": {"reference_id": f"sha256:{video_sha}", "reference_type": "EVIDENCE", "namespace": "external:3d-building-agent-pipeline", "version": "1", "source": "architecture-video-pipeline", "status": "DECLARED"},
        "integrity_status": "PENDING",
    }
    response_status, response = remote(args.base_url, "preflight", token, request)
    record = {
        "schema_version": "architecture-titmas-sandbox-call.v1",
        "observed_at": now,
        "service": "titmas-sandbox-gateway",
        "service_version": health["version"],
        "service_maturity": health["maturity"],
        "route": "POST /sandbox/v0.1/preflight",
        "transport": "LOCAL_LOOPBACK_TUNNEL",
        "credential_source": "MACOS_KEYCHAIN_PROCESS_ONLY",
        "run_id": manifest["runId"],
        "run_manifest_sha256": digest(manifest_bytes),
        "video_sha256": video_sha,
        "cover_sha256": cover_sha,
        "request": request,
        "request_sha256": digest(json.dumps(request, separators=(",", ":")).encode()),
        "http_status": response_status,
        "response": response,
        "result_scope": "SCHEMA_ONLY_NO_MEDIA_UPLOADED_NO_SIGNED_OUTCOME_RECEIPT",
        "commercial_d29_outcome_review": "NOT_RUN",
        "architectural_visual_review": "NOT_RUN_BY_THIS_CALL",
    }
    with out.open("x", encoding="utf-8") as file:
        json.dump(record, file, indent=2, ensure_ascii=False)
        file.write("\n")
    print(json.dumps({"record": str(out), "http_status": response_status, "result": response.get("result"), "video_sha256": video_sha, "scope": record["result_scope"]}))
    return 0 if response_status == 200 and response.get("result") == "SCHEMA_PREFLIGHT_PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, URLError, RuntimeError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f"TITMAS_SANDBOX_PREFLIGHT_FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(2)
