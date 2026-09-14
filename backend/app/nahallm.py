from __future__ import annotations

import os
from typing import Any

import httpx


class NahaLLMUnavailable(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.getenv("NAHALLM_BASE_URL") and os.getenv("NAHALLM_API_KEY"))


def investigation_summary(case: dict[str, Any], evidence: list[dict[str, Any]], audit_events: list[dict[str, Any]]) -> str | None:
    if not configured():
        return None
    base_url = os.getenv("NAHALLM_BASE_URL", "").rstrip("/")
    payload = {
        "model": os.getenv("CLAIMTRACE_AI_MODEL", "fast"),
        "stream": False,
        "messages": [
            {"role": "system", "content": "You are ClaimTrace's evidence-review assistant. Use only supplied facts. Never determine legal liability, blame, fraud guilt, or court admissibility. Clearly distinguish evidence-backed facts from hypotheses and missing evidence. Return concise investigator notes with sections: Observed, Needs verification, Evidence gaps, Suggested next checks."},
            {"role": "user", "content": {"case": case, "evidence": evidence, "audit_event_count": len(audit_events)}},
        ],
    }
    try:
        response = httpx.post(f"{base_url}/v1/chat/completions", headers={"Authorization": f"Bearer {os.environ['NAHALLM_API_KEY']}", "Content-Type": "application/json"}, json=payload, timeout=float(os.getenv("CLAIMTRACE_AI_TIMEOUT_SECONDS", "15")))
        response.raise_for_status()
        body = response.json()
        return str(body["choices"][0]["message"]["content"]).strip()
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise NahaLLMUnavailable(str(exc)) from exc
