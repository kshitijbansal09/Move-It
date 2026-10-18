#!/usr/bin/env python3
"""Compare the modular program with the untouched original C++ implementation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def mask_cpp(text):
    """Hide literals/comments while preserving positions for brace matching."""
    result = list(text)
    index = 0
    while index < len(text):
        if text.startswith("//", index):
            end = text.find("\n", index)
            if end < 0:
                end = len(text)
        elif text.startswith("/*", index):
            end = text.index("*/", index + 2) + 2
        elif text[index] in ('"', "'"):
            quote = text[index]
            end = index + 1
            while end < len(text):
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == quote:
                    end += 1
                    break
                end += 1
        else:
            index += 1
            continue
        for position in range(index, min(end, len(text))):
            if result[position] != "\n":
                result[position] = " "
        index = end
    return "".join(result)


def body_of(text, function):
    masked = mask_cpp(text)
    match = re.search(r"\b" + re.escape(function) + r"\s*\(", masked)
    assert match, f"Missing function: {function}"
    opening = masked.index("{", match.end())
    depth = 1
    for position in range(opening + 1, len(masked)):
        if masked[position] == "{":
            depth += 1
        elif masked[position] == "}":
            depth -= 1
            if depth == 0:
                return text[opening:position + 1]
    raise AssertionError(f"Unclosed function: {function}")


def check_source(original):
    metadata = json.loads((ROOT / "tests/source-map.json").read_text())
    assert digest(original) == metadata["sha256"], "The original source changed since this module split."
    method_count = 0
    for class_name, module in metadata["classes"].items():
        class_source = original[original.index("class " + class_name + " {"):]
        for method in module["methods"]:
            name = method["name"]
            assert digest(body_of(class_source, name)) == method["body_sha256"], name
            if method["header_only_template"]:
                modular_source = (ROOT / module["header"]).read_text()
                qualified_name = name
            else:
                modular_source = (ROOT / module["implementation"]).read_text()
                qualified_name = class_name + "::" + name
            assert digest(body_of(modular_source, qualified_name)) == method["body_sha256"], qualified_name
            method_count += 1

    functions = {
        "security": ["rotr", "sha256Hex", "makeSalt", "hashPassword"],
        "utils": ["fmtTime", "lower", "trim"],
        "geo": ["toRadians", "distanceKm"],
        "scheduling": ["sortFCFS", "sortPriority", "allocateSeats"],
        "console": ["readLine", "parseInt", "readInt", "readDouble", "rule"],
        "self_tests": ["runTests"],
    }
    for module, names in functions.items():
        modular_source = (ROOT / "src" / (module + ".cpp")).read_text()
        for name in names:
            assert body_of(original, name) == body_of(modular_source, name), name

    original_main = original[original.index("int main("):].strip()
    modular_main_source = (ROOT / "moveit.cpp").read_text()
    assert original_main in modular_main_source, "The console entry point changed."
    entities = original[original.index("struct Station {"):original.index("string fmtTime(")].strip()
    assert entities in (ROOT / "include/entities.hpp").read_text()
    security = original[original.index("namespace sha {"):original.index("// ----------------------------------------------------------------------------\n// Entities")].strip()
    assert security in (ROOT / "src/security.cpp").read_text()
    constants = original[original.index("const int DEMAND_THRESHOLD"):original.index("class BookingService {")].strip()
    assert constants in (ROOT / "include/booking_service.hpp").read_text()
    assert "bool gEof = false;" in (ROOT / "src/console.cpp").read_text()
    print(f"PASS: original source unchanged; all {method_count} method bodies, free functions, models, constants and main() preserved.")


def normalize(output):
    output = re.sub(r"\b\d{2} [A-Z][a-z]{2}(?: \d{4},)? \d{2}:\d{2}\b", "<timestamp>", output)
    return re.sub(r"\b\d{2}:\d{2}\b", "<time>", output)


def run(binary, inputs="", arguments=()):
    return subprocess.run([str(binary), *arguments], input=inputs, text=True,
                          capture_output=True, timeout=30, check=True)


def menu(*lines):
    return "\n".join(lines) + "\n"


def compare_programs(original_binary, modular_binary):
    original_tests = run(original_binary, arguments=("--test",))
    modular_tests = run(modular_binary, arguments=("--test",))
    assert original_tests.stdout == modular_tests.stdout, "Self-test output differs."
    assert modular_tests.stdout.count("  PASS  ") == 15, "Expected all 15 original tests."
    print("PASS: all 15 original self-tests pass with identical output.")

    admin = ["1", "admin@geu.ac.in", "Password@123"]
    student = ["1", "rahul.student@geu.ac.in", "Password@123"]
    cases = {
        "exit": "0\n",
        "end of input": "",
        "invalid menu input": "not-a-number\n0\n",
        "invalid credentials": menu("1", "missing@geu.ac.in", "wrong", "0"),
        "admin login, listings and fleet": menu(*admin, "1", "3", "9", "15", "14", "2", "1", "0", "0"),
        "student booking, notification and cancellation": menu(*student, "5", "2", "normal", "6", "8", "7", "4", "6", "0", "0"),
        "duplicate booking rejection": menu(*student, "5", "1", "normal", "0", "0"),
        "student role restrictions": menu(*student, "14", "0", "0"),
        "direct ride request": menu(*student, "4", "6", "16:00", "normal", "6", "8", "0", "0"),
        "nearby alternatives and distance lookup": menu(*student, "4", "9", "16:00", "normal", "2", "1", "15", "0", "0"),
        "pending, batch scheduling, status change and deletion": menu(*admin,
            "13", "4", "6", "urgent", "13", "4", "3", "normal", "12", "4", "priority",
            "9", "10", "4", "cancelled", "11", "4", "0", "0"),
        "admin station, vehicle, driver, route and trip CRUD": menu(*admin,
            "14", "1", "2", "Demo Hub", "30.1", "78.2",
            "14", "2", "2", "DEMO-001", "12", "active",
            "14", "3", "2", "Demo Driver", "DEMO-LICENSE", "+919800000000",
            "14", "4", "2", "Demo route", "1", "10",
            "14", "5", "2", "6", "5", "4", "60", "3",
            "14", "1", "3", "10", "14", "5", "3", "5",
            "14", "4", "3", "5", "14", "1", "3", "10",
            "14", "3", "3", "4", "14", "2", "3", "6", "0", "0"),
        "signup and new account login": menu("2", "Modular Student", "modular.student@geu.ac.in",
            "demoPass123", "+919800000001", "student", "1", "modular.student@geu.ac.in",
            "demoPass123", "6", "0", "0"),
        "end of input after login": menu(*admin),
    }
    for name, inputs in cases.items():
        before = run(original_binary, inputs)
        after = run(modular_binary, inputs)
        assert normalize(before.stdout) == normalize(after.stdout), f"Console output differs: {name}"
        assert before.stderr == after.stderr, f"Error output differs: {name}"
        print(f"PASS: equivalent console session — {name}")
    print(f"Verified {len(cases)} console sessions against the original executable.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path, default=ROOT.parent / "cpp/moveit.cpp")
    parser.add_argument("--binary", type=Path, default=ROOT / "build/moveit")
    args = parser.parse_args()
    original_path = args.original.resolve()
    check_source(original_path.read_text())
    with tempfile.TemporaryDirectory(prefix="moveit-modular-check-") as temporary:
        original_binary = Path(temporary) / "original-moveit"
        compiler = shlex.split(os.environ.get("CXX", "c++"))
        subprocess.run([*compiler, "-std=c++17", "-O2", str(original_path), "-o", str(original_binary)], check=True)
        compare_programs(original_binary, args.binary.resolve())


if __name__ == "__main__":
    main()
