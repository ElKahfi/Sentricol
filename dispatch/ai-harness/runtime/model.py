import json
import os
import urllib.request
import urllib.error
from urllib.parse import urlparse


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
