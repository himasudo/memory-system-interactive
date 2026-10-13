"""Read-only telemetry, unavailable sensors, and non-causal confound warnings."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmarks"))
from environment import changes, snapshot, read_field, validate_environment


class Environment(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.addCleanup(self.folder.cleanup)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(text))

    def machine(self):
        fields = {"class/power_supply/AC/type": "Mains", "class/power_supply/AC/online": 1,
                  "class/power_supply/BAT0/type": "Battery", "class/power_supply/BAT0/status": "Charging",
                  "class/power_supply/BAT0/capacity": 85, "firmware/acpi/platform_profile": "balanced",
                  "devices/system/cpu/cpufreq/boost": 1,
                  "class/thermal/thermal_zone0/type": "acpitz", "class/thermal/thermal_zone0/temp": 45000,
                  "class/hwmon/hwmon3/name": "k10temp", "class/hwmon/hwmon3/temp1_input": 51000,
                  "class/hwmon/hwmon3/temp1_label": "Tctl"}
        for cpu in (0, 4):
            for name, value in {"scaling_governor": "schedutil", "scaling_driver": "acpi-cpufreq",
                                "scaling_cur_freq": 1400000, "scaling_min_freq": 1400000,
                                "scaling_max_freq": 2300000, "cpuinfo_min_freq": 1400000,
                                "cpuinfo_max_freq": 4000000, "related_cpus": str(cpu)}.items():
                fields[f"devices/system/cpu/cpu{cpu}/cpufreq/{name}"] = value
        for path, value in fields.items():
            self.write(path, value)

    def capture(self, position="before_suite", suite="loaded"):
        return snapshot([0, 4], position, suite, self.root, which=lambda _: None)

    def test_named_power_frequency_and_thermal_readings_without_writes(self):
        self.machine()
        before = {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        s = self.capture()
        self.assertEqual(s["power"]["source"]["value"], "ac")
        self.assertEqual(s["power"]["batteries"]["entries"][0]["status"]["value"], "Charging")
        self.assertEqual(s["platform_profile"]["acpi_profile"]["value"], "balanced")
        self.assertEqual(s["boost"]["cpufreq_boost"]["value"], 1)
        self.assertEqual([r["cpu"] for r in s["cpus"]["entries"]], [0, 4])
        self.assertEqual(s["cpus"]["entries"][0]["scaling_cur_freq"]["value"], 1400000)
        self.assertEqual(s["cpus"]["entries"][0]["scaling_cur_freq"]["unit"], "kHz")
        self.assertEqual(s["cpus"]["entries"][0]["cpuinfo_cur_freq"]["status"], "unavailable")
        self.assertEqual(s["thermal_zones"]["entries"][0]["type"]["value"], "acpitz")
        self.assertEqual(s["hwmon"]["entries"][0]["driver"]["value"], "k10temp")
        self.assertEqual(s["hwmon"]["entries"][0]["label"]["value"], "Tctl")
        self.assertEqual(s["hwmon"]["entries"][0]["temperature"]["value"], 51000)
        self.assertGreaterEqual(s["capture_elapsed_ns"], 0)
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()})

    def test_missing_telemetry_is_explicit_and_never_guessed(self):
        s = self.capture()
        for field in [s["power"]["source"], s["power"]["ac_online"], s["platform_profile"]["acpi_profile"],
                      s["boost"]["cpufreq_boost"], s["cpus"]["entries"][0]["scaling_cur_freq"]]:
            self.assertEqual(field["status"], "unavailable")
            self.assertIsNone(field["value"])
            self.assertTrue(field["reason"])
        for group in [s["thermal_zones"], s["hwmon"], s["power"]["batteries"]]:
            self.assertEqual(group["status"], "unavailable")
            self.assertTrue(group["reason"])
        self.assertEqual(changes([s]), [])

    def test_invalid_and_denied_attributes_are_not_benchmark_failures(self):
        self.write("frequency", "bad")
        self.assertEqual(read_field(self.root / "frequency", True)["status"], "unavailable")
        self.write("frequency", 0)
        self.assertEqual(read_field(self.root / "frequency", True, minimum=1)["status"], "unavailable")
        with patch.object(Path, "read_text", side_effect=PermissionError("denied")):
            field = read_field(self.root / "frequency")
        self.assertEqual(field["status"], "unavailable")
        self.assertIn("permissions", field["reason"])

    def test_battery_operation_requires_exposed_online_and_status_evidence(self):
        self.machine()
        self.write("class/power_supply/AC/online", 0)
        self.write("class/power_supply/BAT0/status", "Discharging")
        self.assertEqual(self.capture()["power"]["source"]["value"], "battery")
        self.write("class/power_supply/AC/online", "bad")
        self.assertEqual(self.capture()["power"]["source"]["status"], "unavailable")

    def test_multiple_profile_interfaces_and_only_read_only_cli_query(self):
        self.write("class/platform-profile/platform-profile-0/profile", "quiet")
        calls = []
        def execute(argv, **kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 0, 'v s "power-saver"\n', "")
        s = snapshot([0], "before_run", sysroot=self.root, which=lambda _: "/usr/bin/busctl", executor=execute)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1:6], ["--system", "--auto-start=no", "--allow-interactive-authorization=no", "--timeout=2", "call"])
        self.assertEqual(calls[0][-4:], ["Get", "ss", "org.freedesktop.UPower.PowerProfiles", "ActiveProfile"])
        self.assertEqual(s["platform_profile"]["profiles"]["entries"][0]["profile"]["value"], "quiet")
        self.assertEqual(s["platform_profile"]["service_profile"]["value"], "power-saver")

    def test_profile_tool_failure_and_timeout_degrade_cleanly(self):
        for failure in (subprocess.CompletedProcess([], 1, "", "daemon unavailable"), subprocess.TimeoutExpired([], 2)):
            def execute(argv, **kwargs):
                if isinstance(failure, Exception):
                    raise failure
                return failure
            s = snapshot([0], "before_run", sysroot=self.root, which=lambda _: "busctl", executor=execute)
            self.assertEqual(s["platform_profile"]["service_profile"]["status"], "unavailable")
            self.assertTrue(s["platform_profile"]["service_profile"]["reason"])

    def test_legacy_profile_service_fallback_never_activates_a_daemon(self):
        calls = []
        def execute(argv, **kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 1, "", "service absent") if argv[-2] != "net.hadess.PowerProfiles" else subprocess.CompletedProcess(argv, 0, 'v s "balanced"', "")
        s = snapshot([0], "before_run", sysroot=self.root, which=lambda _: "busctl", executor=execute)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all("--auto-start=no" in c and "--allow-interactive-authorization=no" in c and "Get" in c and "Set" not in c for c in calls))
        self.assertEqual(s["platform_profile"]["service_profile"]["value"], "balanced")

    def test_material_changes_are_descriptive_with_scope_and_evidence(self):
        self.machine()
        before = self.capture()
        self.write("devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", 2300000)
        self.write("devices/system/cpu/cpu0/cpufreq/scaling_governor", "powersave")
        self.write("class/hwmon/hwmon3/temp1_input", 65000)
        self.write("class/power_supply/AC/online", 0)
        self.write("class/power_supply/BAT0/status", "Discharging")
        after = self.capture("after_suite")
        warnings = changes([before, after], "loaded")
        self.assertEqual(set(w["category"] for w in warnings), {"frequency", "policy", "temperature", "power"})
        for warning in warnings:
            self.assertEqual(warning["suite"], "loaded")
            self.assertEqual(warning["scope"], "suite")
            self.assertEqual(len(warning["observations"]), 2)
            self.assertIn("do not establish", warning["interpretation"])
            self.assertNotIn("caused", warning["message"])
            self.assertNotIn("throttling", warning["message"])

    def test_one_hot_or_low_frequency_snapshot_is_not_a_diagnosis(self):
        self.machine()
        self.write("class/hwmon/hwmon3/temp1_input", 99000)
        self.write("devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", 400000)
        s = self.capture()
        self.assertEqual(changes([s], "loaded"), [])
        self.assertEqual(changes([s, copy.deepcopy(s)], "loaded"), [])

    def test_gradual_cumulative_changes_and_thresholds(self):
        self.machine()
        snapshots = [self.capture("before_run", None)]
        for temperature in (56000, 61000):
            self.write("class/hwmon/hwmon3/temp1_input", temperature)
            snapshots.append(self.capture("after_suite"))
        self.assertFalse(changes(snapshots[:2]))
        self.assertEqual(len(changes(snapshots)), 1)
        self.write("devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", 1500000)
        self.assertFalse(any(w["category"] == "frequency" for w in changes([snapshots[0], self.capture()])))


if __name__ == "__main__":
    unittest.main()
