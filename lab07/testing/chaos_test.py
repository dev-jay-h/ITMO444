#!/usr/bin/env python3
import argparse
import csv
import sys
import time

from aws_helpers import get_inservice_instance_id, terminate_instance_via_asg
from http_probe import probe_once


def load_env(path: str) -> dict:
    values = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip()
    except FileNotFoundError:
        pass
    return values


def main():
    parser = argparse.ArgumentParser(description="Measure recovery time after killing one instance.")
    parser.add_argument("--tier", choices=["uploader", "viewer"], required=True)
    parser.add_argument("--slo-seconds", type=float, default=None)
    parser.add_argument("--poll-interval", type=float, default=2.0)
    parser.add_argument("--max-wait", type=float, default=600.0)
    args = parser.parse_args()

    env = {**load_env("../.env"), **load_env("../stack_outputs.env")}
    region = env.get("AWS_REGION", "us-east-2")
    alb_dns = env.get("ALB_DNS_NAME")
    if not alb_dns:
        sys.exit("ALB_DNS_NAME not found - run create_app_stack.sh first.")

    slo_seconds = args.slo_seconds if args.slo_seconds is not None else float(env.get("RECOVERY_SLO_SECONDS", 300.0))

    if args.tier == "uploader":
        port = env.get("UPLOADER_LISTENER_PORT", "8080")
        asg_name = env.get("UPLOADER_ASG_NAME")
    else:
        port = env.get("VIEWER_LISTENER_PORT", "8081")
        asg_name = env.get("VIEWER_ASG_NAME")

    if not asg_name:
        sys.exit(f"ASG name for tier {args.tier} not found in environment variables.")

    url = f"http://{alb_dns}:{port}/"
    print(f"Target URL: {url}")
    print(f"Target ASG: {asg_name}")
    print(f"Recovery SLO: {slo_seconds} seconds")

    # 1. Ensure service is up initially
    print("Checking initial service health...")
    initial_ok = False
    for _ in range(15):  # 15번 시도 (2초 간격 = 총 30초)
        res = probe_once(url)
        is_up = res[0] if isinstance(res, tuple) else res
        if is_up:
            initial_ok = True
            break
        time.sleep(2.0)

    if not initial_ok:
        sys.exit(f"Service at {url} is not healthy initially. Aborting test.")

    # 2. Get an instance to terminate
    print("Finding in-service instance to terminate...")
    instance_id = get_inservice_instance_id(asg_name, region)
    if not instance_id:
        sys.exit(f"No in-service instances found in ASG {asg_name}.")
    print(f"Target instance to terminate: {instance_id}")

    # 3. Start probing and terminate instance
    timestamp = int(time.time())
    csv_filename = f"chaos_test_{args.tier}_{timestamp}.csv"

    print(f"Starting chaos test probe loop, logging to {csv_filename}...")
    with open(csv_filename, mode="w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["timestamp", "elapsed_seconds", "is_up", "status_code", "error"])

        start_time = time.time()
        # Terminate the instance right after starting
        terminate_instance_via_asg(instance_id, region)
        print(f"Instance {instance_id} termination requested.")

        down_detected = False
        outage_start = None
        recovery_time = None
        success = False

        while True:
            now = time.time()
            elapsed = now - start_time

            if elapsed > args.max_wait:
                print("Max wait time exceeded without full recovery.")
                success = False
                break

            res = probe_once(url)
            if isinstance(res, tuple):
                is_up, status_code, err = res
            else:
                is_up = res
                status_code = 200 if is_up else 0
                err = ""

            writer.writerow([now, elapsed, is_up, status_code, err])
            csv_file.flush()

            status_str = "UP" if is_up else "DOWN"
            print(f"[{elapsed:6.1f}s] Status: {status_str} (Code: {status_code}, Err: {err})")

            if not is_up and not down_detected:
                down_detected = True
                outage_start = now
                print(f"Outage detected at {elapsed:.1f}s elapsed.")

            if down_detected and is_up:
                recovery_time = now - outage_start
                print(f"Service recovered! Outage duration (recovery time): {recovery_time:.2f}s")
                success = True
                break

            time.sleep(args.poll_interval)

    # Final verdict
    if success and recovery_time <= slo_seconds:
        print(f"PASS: recovery time {recovery_time:.2f}s met the SLO ({slo_seconds}s).")
        sys.exit(0)
    else:
        print(f"FAIL: recovery time {recovery_time if recovery_time else 'N/A'}s did not meet SLO or test failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()