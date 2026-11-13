#!/usr/bin/env python3

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def terraform_outputs(folder):
    result = subprocess.run(
        ["terraform", "output", "-json"],
        cwd=folder,
        capture_output=True,
        text=True,
        check=True,
    )
    return {
        name: item["value"]
        for name, item in json.loads(result.stdout).items()
    }


def get(url, timeout=30):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body, status = response.read().decode(), response.status
    except urllib.error.HTTPError as error:
        body, status = error.read().decode(), error.code
    except (urllib.error.URLError, TimeoutError) as error:
        return 0, {"error": f"no connection: {error}"}

    try:
        return status, json.loads(body)
    except ValueError:
        return status, body


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default="60616")
    parser.add_argument("--weather-url")
    parser.add_argument("--advisor-url")
    args = parser.parse_args()

    if args.weather_url and args.advisor_url:
        weather, advisor = args.weather_url, args.advisor_url
    else:
        outputs = terraform_outputs(
            Path(__file__).resolve().parent.parent
        )
        weather = outputs["weather_url"]
        advisor = outputs["advisor_url"]

    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'} {name} {detail}")

    status, body = get(f"{weather}/weather?zip={args.zip}")
    check(
        "weather tier returns a forecast",
        status == 200 and "forecast" in body,
        f"status {status}",
    )

    status, body = get(f"{weather}/weather?zip={args.zip}")
    check(
        "a repeat call is answered from DynamoDB (cache hit)",
        status == 200 and body.get("cache") == "hit",
        f"cache={body.get('cache') if isinstance(body, dict) else body}",
    )

    status, body = get(f"{weather}/history")
    check(
        "history lists the saved lookups",
        status == 200 and body.get("count", 0) >= 1,
        f"status {status}",
    )

    status, body = get(f"{weather}/weather?zip=abc")
    check("weather tier rejects a bad zip with 400", status == 400)

    status, body = get(f"{weather}/weather?zip=00000")
    check("weather tier returns 404 for an unknown zip", status == 404)

    start = time.time()
    status, body = get(f"{advisor}/advice?zip={args.zip}")
    ok = status == 200 and bool(body.get("advice"))
    check(
        "advisor tier returns clothing advice",
        ok,
        f"status {status}, {time.time() - start:.1f}s",
    )

    if ok:
        print(
            f"      source={body.get('source')} "
            f"model={body.get('model')}"
        )
        print(f"      advice: {body['advice']}")

    check(
        "advice came from Gemini (not the fallback)",
        ok and body.get("source") == "gemini",
    )

    status, body = get(f"{advisor}/advice?zip=abc")
    check("advisor tier rejects a bad zip with 400", status == 400)

    status, body = get(f"{advisor}/")
    check(
        "advisor home page loads",
        status == 200 and "<form" in str(body),
        f"status {status}",
    )

    print(f"\n{sum(results)} of {len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
