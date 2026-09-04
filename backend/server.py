"""
algo-viz backend: a small Flask app that serves the frontend, the catalog
of problems in `problems/`, and the two endpoints that run submitted code
through the tracer (see tracer.py for the actual execution engine).

Intentionally a local, single-user dev tool -- there's no auth, no rate
limiting, and the Werkzeug debugger is left on (`debug=True`). Don't expose
this beyond localhost.
"""

import importlib
import os
import sys

from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, os.path.dirname(__file__))
from tracer import trace_function_call, analyze_loops  # noqa: E402

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
PROBLEMS_DIR = os.path.join(BASE_DIR, "problems")

app = Flask(__name__, static_folder=None)


def _load_problems():
    """Import every problems/*.py module and index its PROBLEM dict by id.

    Adding a new problem is just dropping a file here -- see
    problems/exclusive_time.py for the shape a PROBLEM dict needs.
    """
    problems = {}
    for fname in sorted(os.listdir(PROBLEMS_DIR)):
        if fname.endswith(".py") and not fname.startswith("_"):
            mod_name = f"problems.{fname[:-3]}"
            mod = importlib.import_module(mod_name)
            p = mod.PROBLEM
            problems[p["id"]] = p
    return problems


PROBLEMS = _load_problems()


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


@app.route("/api/problems")
def list_problems():
    """Lightweight list for the problem picker: id + title only."""
    return jsonify([
        {"id": p["id"], "title": p["title"]} for p in PROBLEMS.values()
    ])


@app.route("/api/problems/<problem_id>")
def get_problem(problem_id):
    """Full problem definition: starter code, tests, description, etc."""
    p = PROBLEMS.get(problem_id)
    if not p:
        return jsonify({"error": "not found"}), 404
    return jsonify(p)


@app.route("/api/run", methods=["POST"])
def run():
    """Trace one execution of `code` and return the step-by-step recording.

    Body: {code, func_name, args}. Also runs static loop analysis on the
    same source so the frontend can render loop boxes and index connectors
    without the tracer needing to know anything about loops itself.
    """
    body = request.get_json(force=True)
    code = body.get("code", "")
    func_name = body.get("func_name", "")
    args = body.get("args", [])

    result = trace_function_call(code, func_name, args)
    result["loops"] = analyze_loops(code)
    return jsonify(result)


@app.route("/api/run_tests", methods=["POST"])
def run_tests():
    """Run `code` against every official test case for a problem, without
    the step-by-step trace overhead -- just pass/fail per case.

    Body: {code, func_name, problem_id}.
    """
    body = request.get_json(force=True)
    code = body.get("code", "")
    func_name = body.get("func_name", "")
    problem_id = body.get("problem_id", "")

    problem = PROBLEMS.get(problem_id)
    if not problem:
        return jsonify({"error": "unknown problem"}), 400

    outcomes = []
    for t in problem["tests"]:
        r = trace_function_call(code, func_name, t["args"])
        passed = (r["error"] is None) and (r["result"] == t["expected"])
        outcomes.append({
            "name": t["name"],
            "args": t["args"],
            "expected": t["expected"],
            "actual": r["result"],
            "error": r["error"],
            "passed": passed,
        })
    return jsonify({
        "outcomes": outcomes,
        "passed_count": sum(1 for o in outcomes if o["passed"]),
        "total": len(outcomes),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5057))
    print(f"algo-viz running at http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True, use_reloader=False)
