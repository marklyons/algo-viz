"""
Generic line-by-line execution tracer for user-submitted Python solutions.

Runs a user's function under sys.settrace, snapshotting every local
variable at every executed line. The frontend replays this list of
snapshots like video frames, so stepping/scrubbing shows the *real*
state of the program at each point -- including off-by-one bugs,
instead of a canned animation.
"""

import ast
import copy
import io
import math
import sys
import time
import types
import contextlib

MAX_STEPS = 20000
MAX_SECONDS = 5.0
MAX_REPR_ITEMS = 500
MAX_STR_LEN = 2000


class TraceLimitExceeded(Exception):
    pass


def _safe_value(value, depth=0):
    """Recursively convert a Python value into something JSON-safe."""
    if depth > 6:
        return "..."
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, float) and not math.isfinite(value):
        # float("inf") is a common, idiomatic sentinel (e.g. "no answer
        # found yet"), but strict JSON has no token for it -- Python's
        # json module happily emits the non-standard `Infinity` literal,
        # which a browser's JSON.parse then rejects outright. Send it as
        # a plain string instead.
        if value != value:  # NaN is the only value that isn't equal to itself
            return "NaN"
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return value if len(value) <= MAX_STR_LEN else value[:MAX_STR_LEN] + "…"
    if isinstance(value, (list, tuple)):
        items = list(value)[:MAX_REPR_ITEMS]
        out = [_safe_value(v, depth + 1) for v in items]
        if len(value) > MAX_REPR_ITEMS:
            out.append("...")
        return out
    if isinstance(value, dict):
        out = {}
        for i, (k, v) in enumerate(value.items()):
            if i >= MAX_REPR_ITEMS:
                out["..."] = "..."
                break
            out[str(k)] = _safe_value(v, depth + 1)
        return out
    if isinstance(value, set):
        items = list(value)[:MAX_REPR_ITEMS]
        return {"__set__": [_safe_value(v, depth + 1) for v in items]}
    node_value_attr = _linked_list_value_attr(value)
    if node_value_attr is not None:
        # Duck-typed linked-list node (a LeetCode-style ListNode: whatever
        # a solution names its own class, this matches on shape --
        # `.val`/`.value` plus `.next` -- not a specific class). Walk the
        # chain into a plain array of values so the frontend can render it
        # as a connected sequence of nodes without knowing anything about
        # the user's class.
        return {"__kind__": "linked_list", "values": _walk_linked_list(value, node_value_attr, depth)}
    # Fallback for anything else (custom objects, functions, modules, etc.)
    try:
        return repr(value)
    except Exception:
        return "<unrepr-able>"


def _linked_list_value_attr(value):
    """Returns 'val' or 'value' if `value` looks like a singly-linked-list
    node (has a `.next` and one of those two value attributes), else None.
    """
    if isinstance(value, (list, tuple, dict, set, str, int, float, bool)) or value is None:
        return None
    if not hasattr(value, "next"):
        return None
    if hasattr(value, "val"):
        return "val"
    if hasattr(value, "value"):
        return "value"
    return None


def _walk_linked_list(node, value_attr, depth):
    values = []
    seen = set()
    while node is not None and len(values) < MAX_REPR_ITEMS:
        if id(node) in seen:
            values.append("<cycle>")
            break
        seen.add(id(node))
        values.append(_safe_value(getattr(node, value_attr, None), depth + 1))
        node = getattr(node, "next", None)
    return values


def _snapshot_locals(frame):
    snap = {}
    for name, value in frame.f_locals.items():
        if name.startswith("__"):
            continue
        if isinstance(value, (types.FunctionType, types.MethodType)):
            # A nested helper function definition (e.g. a closure like a
            # custom bisect helper) is code, not data -- there's nothing
            # useful to visualize about the function object itself, and
            # showing its repr ("<function ... at 0x...>") is just noise.
            continue
        try:
            snap[name] = _safe_value(copy.deepcopy(value))
        except Exception:
            try:
                snap[name] = _safe_value(value)
            except Exception:
                snap[name] = "<unavailable>"
    return snap


def trace_function_call(source_code, func_name, call_args, arg_names=None, build_args_code=None):
    """
    Exec `source_code` to define functions/classes, then call
    `func_name(*call_args)`, recording a step for every executed line
    of every user-defined function (not stdlib internals).

    `build_args_code`, if given, is a snippet defining `build_args(raw_args)`
    that's exec'd in the *same* namespace as the solution (so it can see
    classes the solution defines, e.g. a `ListNode`) and used to turn plain
    JSON test data into the real objects the function expects -- e.g.
    turning `[[1,4,5],[1,3,4]]` into actual linked-list heads before
    calling a `mergeKLists(lists)`. Problems that don't need this (anything
    taking plain ints/strings/arrays) just omit it.

    Returns dict: {
        "steps": [ {line, func, event, locals, depth}, ... ],
        "result": <return value, JSON-safe>,
        "error": None | {"message": str, "line": int|None},
        "stdout": str,
    }
    """
    steps = []
    start_time = time.time()
    step_count = {"n": 0}

    namespace = {}

    # Track which code objects belong to user-defined top-level functions
    # (populated after exec, filled in during 'call' events by matching
    # co_filename to our synthetic filename).
    filename = "<user_solution>"

    try:
        code_obj = compile(source_code, filename, "exec")
    except SyntaxError as e:
        return {
            "steps": [],
            "result": None,
            "error": {"message": f"SyntaxError: {e.msg}", "line": e.lineno},
            "stdout": "",
        }

    call_depth = {"d": 0}
    target_code_holder = {"code": None}

    def local_tracer(frame, event, arg):
        if frame.f_code.co_filename != filename:
            return None  # don't descend into library internals

        step_count["n"] += 1
        if step_count["n"] > MAX_STEPS:
            raise TraceLimitExceeded("Too many steps (possible infinite loop)")
        if time.time() - start_time > MAX_SECONDS:
            raise TraceLimitExceeded("Execution timed out (possible infinite loop)")

        if event == "line":
            steps.append({
                "line": frame.f_lineno,
                "func": frame.f_code.co_name,
                "event": "line",
                "locals": _snapshot_locals(frame),
                "depth": call_depth["d"],
            })
        elif event == "return":
            steps.append({
                "line": frame.f_lineno,
                "func": frame.f_code.co_name,
                "event": "return",
                "locals": _snapshot_locals(frame),
                "return_value": _safe_value(copy.deepcopy(arg)) if arg is not None else None,
                "depth": call_depth["d"],
            })
            call_depth["d"] -= 1
        return local_tracer

    def global_tracer(frame, event, arg):
        if frame.f_code.co_filename != filename:
            return None
        if event == "call":
            if frame.f_code is not target_code_holder["code"]:
                # A helper function the solution defines internally (e.g. a
                # nested closure like a custom bisect helper) -- step over
                # it rather than into it, so its internals don't fragment
                # the visualization of the algorithm's own state. Recursive
                # calls to the traced function itself are unaffected (same
                # code object), so recursion still traces normally.
                return None
            call_depth["d"] += 1
            steps.append({
                "line": frame.f_lineno,
                "func": frame.f_code.co_name,
                "event": "call",
                "locals": _snapshot_locals(frame),
                "depth": call_depth["d"],
            })
            step_count["n"] += 1
            return local_tracer
        return None

    result = None
    error = None
    stdout_buf = io.StringIO()

    try:
        exec(code_obj, namespace)
        if func_name not in namespace or not callable(namespace[func_name]):
            return {
                "steps": [],
                "result": None,
                "error": {"message": f"No function named '{func_name}' was defined.", "line": None},
                "stdout": "",
            }

        target = namespace[func_name]
        target_code_holder["code"] = target.__code__

        actual_args = call_args
        if build_args_code:
            exec(compile(build_args_code, "<build_args>", "exec"), namespace)
            actual_args = namespace["build_args"](call_args)

        sys.settrace(global_tracer)
        try:
            with contextlib.redirect_stdout(stdout_buf):
                result = target(*actual_args)
        finally:
            sys.settrace(None)
        result = _safe_value(result)
        if isinstance(result, dict) and result.get("__kind__") == "linked_list":
            # Keep the top-level result plain (a bare array) so a problem's
            # `expected` in tests can just be a normal list -- the richer
            # {__kind__, values} shape is still what shows up inside each
            # step's locals, which is what the frontend actually renders.
            result = result["values"]
    except TraceLimitExceeded as e:
        sys.settrace(None)
        error = {"message": str(e), "line": steps[-1]["line"] if steps else None}
    except Exception as e:
        sys.settrace(None)
        tb = sys.exc_info()[2]
        line = None
        # Walk the traceback to find the deepest frame in the user's file
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == filename:
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {"message": f"{type(e).__name__}: {e}", "line": line}

    return {
        "steps": steps,
        "result": result,
        "error": error,
        "stdout": stdout_buf.getvalue(),
    }


def _unparse_safe(node):
    try:
        return ast.unparse(node)
    except Exception:
        return None


def analyze_loops(source_code):
    """
    Statically find every for/while loop in the source (via the AST, not
    execution) so the frontend can draw a loop container and know which
    line range counts as "inside" it. Returns a list ordered by start line:

        [{"start_line", "end_line", "kind": "for"|"while",
          "target": "log" | None, "iter_expr": "logs" | "range(n)" | ...}]

    `end_lineno` (Python 3.8+) already covers the loop's full body, so a
    nested loop's range is naturally a subset of its parent's -- the
    frontend uses that containment to know which loop(s) a given line is
    inside, innermost first.
    """
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return []

    loops = []
    for node in ast.walk(tree):
        if isinstance(node, ast.For):
            simple_target = node.target.id if isinstance(node.target, ast.Name) else None
            loops.append({
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno),
                "kind": "for",
                "target": _unparse_safe(node.target),
                "iter_expr": _unparse_safe(node.iter),
                "indexed_arrays": _find_indexed_arrays(node, simple_target),
            })
        elif isinstance(node, ast.While):
            loops.append({
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno),
                "kind": "while",
                "target": None,
                "iter_expr": _unparse_safe(node.test),
                "indexed_arrays": [],
            })

    loops.sort(key=lambda l: l["start_line"])
    return loops


def _find_indexed_arrays(loop_node, target_name):
    """
    Arrays the loop's own index variable is used to subscript directly
    (e.g. `arr[i]` somewhere in a `for i in ...` loop's body) -- lets the
    frontend draw a line from the loop's current position to the matching
    array cell. Found via a plain AST walk over the loop node, so it picks
    up `arr[i]` even buried inside another subscript like `tMap[arr[i]]`,
    but only within the loop's own body -- a nested helper function
    defined elsewhere isn't part of this node's body, consistent with the
    tracer not stepping into those either.
    """
    if not target_name:
        return []
    found = []
    seen = set()
    for sub in ast.walk(loop_node):
        if not (isinstance(sub, ast.Subscript) and isinstance(sub.value, ast.Name)):
            continue
        slice_node = sub.slice
        if isinstance(slice_node, ast.Index):  # pre-3.9 AST shape
            slice_node = slice_node.value
        if isinstance(slice_node, ast.Name) and slice_node.id == target_name:
            name = sub.value.id
            if name != target_name and name not in seen:
                seen.add(name)
                found.append(name)
    return found
