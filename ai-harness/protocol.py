#!/usr/bin/env python3
"""Private stdin/stdout bridge for Protocol. No email files or prompt logs."""
import json
import os
import sys
import urllib.request
from runtime.detection import analyze_email


def main():
    try:
        if sys.argv[1:] == ["status"]:
            host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
            if "://" not in host:
                host = "http://" + host
            model = os.environ.get("SENTRI_MODEL", "huihui_ai/qwen3-abliterated:latest")
            with urllib.request.urlopen(host + "/api/tags", timeout=5) as response:
                data = json.loads(response.read(1_000_000))
            available = any(item.get("name") in (model, model + ":latest") or item.get("model") in (model, model + ":latest") for item in data.get("models", []))
            print(json.dumps({"ready": available, "model": model, "message": "Model installed; analysis availability is checked when you analyze an email" if available else "Configured model is not installed in Ollama"}))
            return 0
        raw = sys.stdin.buffer.read(100001)
        if len(raw) > 100000:
            raise ValueError("Email is too large")
        result = analyze_email(json.loads(raw))
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except ValueError:
        print(json.dumps({"error": "The model's answer did not pass email-analysis checks. Try again or use another message."}))
    except TimeoutError:
        print(json.dumps({"error": "The analysis stopped because an upstream service timed out. Check Ollama or the network connection."}))
    except OSError:
        print(json.dumps({"error": "The Ollama connection failed during analysis. Check that Ollama or its SSH tunnel is running."}))
    except RuntimeError:
        print(json.dumps({"error": "Ollama could not complete this analysis. Check the model service and try again."}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
