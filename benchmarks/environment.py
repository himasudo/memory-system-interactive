"""Read-only Linux environment snapshots. These are observations, not diagnoses."""
import datetime
from pathlib import Path
import shutil
import shlex
import subprocess
import time

SCHEMA = "memory-lab-environment-v1"
INTERPRETATION = ("Potential confound only. Snapshots do not establish thermal throttling or "
                  "a cause of timing differences; measurements remain valid observations.")
THRESHOLDS = {"frequency_delta_khz": 200000, "frequency_relative_delta": 0.20,
              "temperature_delta_millicelsius": 10000,
              "policy_and_power_changes": "any observed state/limit change"}


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def reading(value, source, reason="Read exposed attribute.", unit=None):
    result = {"status": "available" if value is not None else "unavailable",
              "value": value, "source": str(source), "reason": reason}
    if unit:
        result["unit"] = unit
    return result


def read_field(path, integer=False, unit=None, minimum=None, maximum=None):
    try:
        value = Path(path).read_text().strip()
        if not value:
            raise ValueError("empty attribute")
        if integer:
            value = int(value)
            if minimum is not None and value < minimum or maximum is not None and value > maximum:
                raise ValueError("attribute outside the expected range")
        return reading(value, path, unit=unit)
    except FileNotFoundError:
        return reading(None, path, "Attribute not exposed by this hardware/kernel.", unit)
    except PermissionError:
        return reading(None, path, "Attribute is not readable with current permissions.", unit)
    except (OSError, ValueError, UnicodeError) as error:
        return reading(None, path, "Could not read attribute: " + str(error), unit)


def discover(root, pattern):
    try:
        paths = sorted(Path(root).glob(pattern))
        return paths, "Discovered exposed sysfs entries." if paths else "No matching sysfs entries exposed."
    except OSError as error:
        return [], "Sysfs discovery unavailable: " + str(error)


def collection(entries, reason):
    return {"status": "available" if entries else "unavailable", "reason": reason, "entries": entries}


def snapshot(cpus, position, suite=None, sysroot=Path("/sys"), which=shutil.which, executor=None):
    """No writes, elevated privileges, or changes to governors/profiles/controls.

    Record all requested logical CPUs, even when their cpufreq directory is absent.
    Temperature labels/drivers are retained; a sensor index is not assumed to be CPU temperature.
    """
    root = Path(sysroot)
    started, clock = utc(), time.monotonic_ns()
    power_paths, power_reason = discover(root / "class/power_supply", "*")
    supplies = []
    for path in power_paths:
        supplies.append({"name": path.name, "type": read_field(path / "type"),
                         "online": read_field(path / "online", True, minimum=0, maximum=1),
                         "status": read_field(path / "status"),
                         "capacity_percent": read_field(path / "capacity", True, "%", 0, 100)})
    batteries = [p for p in supplies if p["type"]["value"] == "Battery"]
    mains = [p for p in supplies if p["type"]["value"] == "Mains"]
    external = [p for p in supplies if p["type"]["value"] == "Mains" or
                str(p["type"]["value"]).startswith("USB")]
    ac_values = [p["online"]["value"] for p in mains]
    ac_online = (1 if 1 in ac_values else 0 if ac_values and all(v == 0 for v in ac_values) else None)
    if any(p["online"]["value"] == 1 for p in external):
        source = "ac" if ac_online == 1 else "external power (USB/type recorded)"
    elif external and all(p["online"]["value"] == 0 for p in external) and any(p["status"]["value"] == "Discharging" for p in batteries):
        source = "battery"
    else:
        source = None
    power = {"supplies": collection(supplies, power_reason),
             "batteries": collection(batteries, "Battery supplies recorded." if batteries else "No battery supply exposed."),
             "ac_online": reading(ac_online, "power_supply Mains online attributes", "Mains online values recorded." if ac_online is not None else "No readable Mains online attribute."),
             "source": reading(source, "power_supply online/status attributes", "External supply online / battery discharging status recorded." if source else "Available attributes do not establish AC vs battery operation.")}
    profile_paths, profile_reason = discover(root / "class/platform-profile", "*/profile")
    profiles = [{"name": p.parent.name, "profile": read_field(p),
                 "choices": read_field(p.with_name("choices"))} for p in profile_paths]
    profile_tool = which("busctl")
    if profile_tool:
        attempts = []
        for service, path in [("org.freedesktop.UPower.PowerProfiles", "/org/freedesktop/UPower/PowerProfiles"),
                              ("net.hadess.PowerProfiles", "/net/hadess/PowerProfiles")]:
            # Properties.Get, with service activation and interactive auth disabled.
            # A generic client/proxy can otherwise start a profile daemon implicitly.
            argv = [profile_tool, "--system", "--auto-start=no", "--allow-interactive-authorization=no",
                    "--timeout=2", "call", service, path, "org.freedesktop.DBus.Properties",
                    "Get", "ss", service, "ActiveProfile"]
            try:
                run = (executor or subprocess.run)(argv, text=True, capture_output=True, timeout=2)
                fields = shlex.split(run.stdout) if run.returncode == 0 else []
                exposed = len(fields) == 3 and fields[:2] == ["v", "s"] and bool(fields[2])
                profile_reading = reading(fields[2] if exposed else None, service + " ActiveProfile",
                    "Read-only active profile query; daemon activation disabled." if exposed else
                    "Profile service/query unavailable or output not understood: " + run.stderr.strip())
                profile_reading.update(command=argv, returncode=run.returncode, stdout=run.stdout, stderr=run.stderr)
            except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeError) as error:
                profile_reading = reading(None, service + " ActiveProfile", "Profile query unavailable: " + str(error))
                profile_reading["command"] = argv
            attempts.append(dict(profile_reading))
            if profile_reading["status"] == "available":
                break
        profile_reading["attempts"] = attempts
    else:
        profile_reading = reading(None, "D-Bus ActiveProfile", "Optional busctl tool is not installed; no daemon activation attempted.")
    platform = {"acpi_profile": read_field(root / "firmware/acpi/platform_profile"),
                "profiles": collection(profiles, profile_reason), "service_profile": profile_reading}
    frequencies = []
    for cpu in sorted(set(cpus)):
        path = root / f"devices/system/cpu/cpu{cpu}/cpufreq"
        row = {"cpu": cpu, "governor": read_field(path / "scaling_governor"),
               "driver": read_field(path / "scaling_driver"), "related_cpus": read_field(path / "related_cpus")}
        for field in ("scaling_cur_freq", "scaling_min_freq", "scaling_max_freq",
                      "cpuinfo_cur_freq", "cpuinfo_min_freq", "cpuinfo_max_freq"):
            row[field] = read_field(path / field, True, "kHz", minimum=1)
        frequencies.append(row)
    zones, zone_reason = discover(root / "class/thermal", "thermal_zone*")
    thermal = [{"name": p.name, "type": read_field(p / "type"),
                "temperature": read_field(p / "temp", True, "millidegrees Celsius", -273150, 1000000)} for p in zones]
    devices, hwmon_reason = discover(root / "class/hwmon", "hwmon*")
    sensors = []
    for device in devices:
        inputs, _ = discover(device, "temp*_input")
        # Older drivers may expose readings in the physical device directory.
        if not inputs:
            inputs, _ = discover(device / "device", "temp*_input")
        for path in inputs:
            sensors.append({"name": device.name + "/" + path.name,
                            "driver": read_field(device / "name"),
                            "label": read_field(path.with_name(path.name.replace("_input", "_label"))),
                            "temperature": read_field(path, True, "millidegrees Celsius", -273150, 1000000)})
    result = {"position": position, "suite": suite, "captured_utc": started,
              "power": power, "platform_profile": platform,
              "boost": {"cpufreq_boost": read_field(root / "devices/system/cpu/cpufreq/boost", True, minimum=0, maximum=1),
                        "intel_no_turbo": read_field(root / "devices/system/cpu/intel_pstate/no_turbo", True, minimum=0, maximum=1)},
              "cpus": collection(frequencies, "Requested logical CPU attributes recorded; availability is per field." if frequencies else "No logical CPUs selected for telemetry."),
              "thermal_zones": collection(thermal, zone_reason),
              "hwmon": collection(sensors, "Temperature inputs recorded with exposed driver/label." if sensors else hwmon_reason + " No temperature input exposed."),
              "frequency_semantics": "scaling_cur_freq is a reported policy snapshot and may not be the exact running hardware frequency; cpuinfo_cur_freq is recorded separately when exposed. Neither is a timed-workload average.",
              "temperature_semantics": "Raw named sysfs sensor readings; no assumed CPU sensor, offset correction, or throttling diagnosis."}
    result.update(finished_utc=utc(), capture_elapsed_ns=time.monotonic_ns() - clock)
    return result


def observations(snap):
    """Only comparable available readings; missing data never implies stability."""
    out = {}
    def add(key, field, category, title):
        if field.get("status") == "available":
            out[key] = {"value": field["value"], "category": category,
                        "title": title, "unit": field.get("unit")}
    power = snap["power"]
    add("power.source", power["source"], "power", "Power supply state")
    add("power.ac_online", power["ac_online"], "power", "AC online state")
    for battery in power["batteries"]["entries"]:
        add("battery." + battery["name"], battery["status"], "power", battery["name"] + " battery status")
    platform = snap["platform_profile"]
    add("profile.acpi", platform["acpi_profile"], "policy", "ACPI platform profile")
    add("profile.daemon", platform["service_profile"], "policy", "Power-profiles active profile")
    for profile in platform["profiles"]["entries"]:
        add("profile." + profile["name"], profile["profile"], "policy", profile["name"] + " platform profile")
    for key, field in snap["boost"].items():
        add("boost." + key, field, "policy", key + (" state (1 disables boost)" if key == "intel_no_turbo" else " state (1 enables boost)"))
    for cpu in snap["cpus"]["entries"]:
        prefix = "CPU " + str(cpu["cpu"]) + " "
        for key in ("governor", "scaling_min_freq", "scaling_max_freq", "scaling_cur_freq", "cpuinfo_cur_freq"):
            add("cpu." + str(cpu["cpu"]) + "." + key, cpu[key], "frequency" if key.endswith("cur_freq") else "policy", prefix + key)
    for group in ("thermal_zones", "hwmon"):
        for sensor in snap[group]["entries"]:
            label = sensor.get("type", sensor.get("label", {})).get("value") or "label unavailable"
            driver = sensor.get("driver", {}).get("value")
            title = sensor["name"] + " (" + str(label) + ("; " + str(driver) if driver else "") + ") temperature"
            add(group + "." + sensor["temperature"]["source"], sensor["temperature"], "temperature", title)
    return out


def changes(snapshots, suite=None):
    history = {}
    for snap in snapshots:
        if not snap:
            continue
        for key, entry in observations(snap).items():
            record = history.setdefault(key, {**entry, "observations": []})
            record["observations"].append({"position": snap["position"], "suite": snap["suite"],
                                           "captured_utc": snap["captured_utc"], "value": entry["value"]})
    warnings = []
    for key, field in history.items():
        values = [r["value"] for r in field["observations"]]
        category = field["category"]
        if category in ("frequency", "temperature"):
            low, high = min(values), max(values)
            material = high - low >= THRESHOLDS["temperature_delta_millicelsius"] if category == "temperature" else (
                high - low >= THRESHOLDS["frequency_delta_khz"] and low > 0 and (high - low) / low >= THRESHOLDS["frequency_relative_delta"])
            if not material:
                continue
            description = f" ranged from {low} to {high} {field['unit']} across available snapshots."
        else:
            states = list(dict.fromkeys(values))
            if len(states) < 2:
                continue
            description = " had different observed states: " + ", ".join(map(str, states)) + "."
        warnings.append({"field": key, "category": category, "scope": "suite" if suite else "run", "suite": suite,
                         "message": field["title"] + description, "observations": field["observations"],
                         "interpretation": INTERPRETATION})
    return warnings


def finish_environment(bundle, started_clock):
    environment = bundle["environment"]
    environment["after_run"] = snapshot(bundle["machine"]["topology"]["online_cpus"], "after_run")
    environment.update(finished_utc=utc(), elapsed_ns=time.monotonic_ns() - started_clock)
    snapshots = [environment["before_run"]]
    for suite in bundle["suites"].values():
        if "environment" in suite:
            snapshots.extend([suite["environment"]["before"], suite["environment"]["after"]])
    snapshots.append(environment["after_run"])
    environment["warnings"] = changes(snapshots)


def validate_environment(bundle):
    """Optional for older bundles; new snapshots must belong to their parent suite."""
    environment = bundle.get("environment")
    if environment is None:
        if any("environment" in s for s in bundle["suites"].values()):
            raise ValueError("Suite telemetry is missing its aggregate environment provenance.")
        return
    def valid_time(value):
        try:
            return isinstance(value, str) and datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
        except ValueError:
            return False
    def check_snapshot(snap, position, suite):
        if not isinstance(snap, dict) or snap.get("position") != position or snap.get("suite") != suite:
            raise ValueError("Environment snapshot association disagrees with its suite/position.")
        if not valid_time(snap.get("captured_utc")) or not valid_time(snap.get("finished_utc")) or type(snap.get("capture_elapsed_ns")) is not int or snap["capture_elapsed_ns"] < 0:
            raise ValueError("Invalid environment snapshot timestamp / duration.")
        # Every exposed/unavailable attribute is explicit, including missing sysfs directories.
        def walk(value):
            if isinstance(value, dict):
                if "status" in value and (value["status"] not in ("available", "unavailable") or not isinstance(value.get("reason"), str)):
                    raise ValueError("Telemetry availability requires a status and reason.")
                if value.get("status") == "unavailable" and "value" in value and value["value"] is not None:
                    raise ValueError("Unavailable telemetry cannot contain an invented value.")
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)
        for key in ("power", "platform_profile", "boost", "cpus", "thermal_zones", "hwmon"):
            if not isinstance(snap.get(key), dict):
                raise ValueError("Missing explicit telemetry group: " + key)
        groups = [snap["cpus"], snap["thermal_zones"], snap["hwmon"], snap["power"].get("supplies"),
                  snap["power"].get("batteries"), snap["platform_profile"].get("profiles")]
        if any(not isinstance(g, dict) or not isinstance(g.get("entries"), list) or g.get("status") not in ("available", "unavailable") for g in groups):
            raise ValueError("Telemetry collections require explicit entries and availability.")
        rows = snap["cpus"]["entries"]
        if any(not isinstance(row, dict) or type(row.get("cpu")) is not int for row in rows) or sorted(row["cpu"] for row in rows) != sorted(bundle["machine"]["topology"]["online_cpus"]):
            raise ValueError("Telemetry logical CPUs disagree with recorded online topology.")
        def fields(record, names):
            if not isinstance(record, dict) or any(not isinstance(record.get(k), dict) or "value" not in record[k] or record[k].get("status") not in ("available", "unavailable") for k in names):
                raise ValueError("Missing explicit telemetry field or availability.")
        fields(snap["power"], ["source", "ac_online"])
        fields(snap["platform_profile"], ["acpi_profile", "service_profile"])
        fields(snap["boost"], ["cpufreq_boost", "intel_no_turbo"])
        for row in rows:
            fields(row, ["governor", "driver", "related_cpus", "scaling_cur_freq", "scaling_min_freq", "scaling_max_freq",
                         "cpuinfo_cur_freq", "cpuinfo_min_freq", "cpuinfo_max_freq"])
        walk(snap)
    def check_timing(record):
        if not valid_time(record.get("started_utc")) or not valid_time(record.get("finished_utc")) or type(record.get("elapsed_ns")) is not int or record["elapsed_ns"] < 0:
            raise ValueError("Missing monotonic environment interval / UTC timestamps.")
    def check_warnings(record, suite):
        if not isinstance(record.get("warnings"), list) or any(not isinstance(w, dict) or w.get("suite") != suite or w.get("scope") != ("suite" if suite else "run") or not isinstance(w.get("message"), str) or not isinstance(w.get("observations"), list) or not isinstance(w.get("interpretation"), str) for w in record["warnings"]):
            raise ValueError("Environment warnings must retain their scope and observations.")
    if environment.get("schema") != SCHEMA:
        raise ValueError("Unsupported environment telemetry schema.")
    check_snapshot(environment.get("before_run"), "before_run", None)
    if environment.get("after_run") is not None:
        check_snapshot(environment["after_run"], "after_run", None)
        check_timing(environment)
    elif bundle["complete"]:
        raise ValueError("Complete workflow requires an after-run environment snapshot.")
    check_warnings(environment, None)
    for name, suite in bundle["suites"].items():
        interval = suite.get("environment")
        if interval is None:
            if suite["status"] == "measured":
                raise ValueError("Measured suite is missing its environment interval.")
            continue
        if interval.get("suite") != name:
            raise ValueError("Environment interval belongs to another suite.")
        check_snapshot(interval.get("before"), "before_suite", name)
        check_snapshot(interval.get("after"), "after_suite", name)
        check_timing(interval)
        check_warnings(interval, name)
