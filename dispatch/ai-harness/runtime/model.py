import json
import os
import urllib.request
import urllib.error
from urllib.parse import urlparse
from pathlib import Path


def load_dispatch_env():
    """Load Dispatch's .env.local for direct Python harness runs.

    Existing shell variables win, so CI, tests, and explicit overrides keep
    working. This intentionally handles the simple KEY=VALUE format used by
    this project without adding a dotenv dependency to the harness.
    """
    env_file = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] == value[-1:] and value[:1] in ("'", '"'):
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


load_dispatch_env()


def generation_schema(schema):
    """Keep Ollama's grammar compact; Python enforces lengths and ranges afterward.

    Large string maxLength bounds can expand into a grammar the local sampler
    cannot initialize. Retain shape and enums, omit validation-only bounds.
    """
    result = {key: schema[key] for key in ('type', 'enum', 'required', 'additionalProperties') if key in schema}
    if 'properties' in schema:
        result['properties'] = {key: generation_schema(value) for key, value in schema['properties'].items()}
    if 'items' in schema:
        result['items'] = generation_schema(schema['items'])
    return result


def ollama(system, payload, schema, timeout):
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    if "://" not in host: host = "http://" + host
    if urlparse(host).scheme not in ("http", "https"): raise ValueError("Invalid Ollama host")
    data = {"model": os.environ.get("SENTRI_MODEL", "huihui_ai/qwen3-abliterated:latest"),
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload)}],
            "format": generation_schema(schema), "stream": False, "think": False, "options": {"temperature": .3, "num_predict": 6000}}
    request = urllib.request.Request(host + "/api/chat", data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(2_000_001)
    except urllib.error.HTTPError as error:
        body = error.read(8192).decode('utf-8', errors='replace')
        try:
            detail = json.loads(body).get('error', body)
        except (ValueError, AttributeError):
            detail = body
        raise RuntimeError(f'Ollama HTTP {error.code}: {detail}') from error
    if len(raw) > 2_000_000: raise RuntimeError("Ollama response too large")
    result = json.loads(raw)
    if result.get("error") or not result.get("done") or not isinstance(result.get("message", {}).get("content"), str):
        raise RuntimeError("Ollama returned an incomplete response")
    return json.loads(result["message"]["content"])
