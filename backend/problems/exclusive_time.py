"""
LeetCode 636 - Exclusive Time of Functions
https://leetcode.com/problems/exclusive-time-of-functions/
"""

PROBLEM = {
    "id": "exclusive-time-of-functions",
    "title": "636. Exclusive Time of Functions",
    "leetcode_url": "https://leetcode.com/problems/exclusive-time-of-functions/",
    "func_name": "exclusiveTime",
    "arg_names": ["n", "logs"],
    "description": (
        "On a single-threaded CPU, n functions (ids 0..n-1) run, possibly nested "
        "via recursion. Each log is \"{function_id}:{start|end}:{timestamp}\". "
        "Return the exclusive time of each function: total time spent in that "
        "function only, not including time spent in functions it called."
    ),
    "starter_code": '''def exclusiveTime(n, logs):
    result = [0] * n
    stack = []  # each entry: [function_id, start_time]
    prev_time = 0

    for log in logs:
        parts = log.split(":")
        fid = int(parts[0])
        typ = parts[1]
        time = int(parts[2])

        if typ == "start":
            if stack:
                result[stack[-1][0]] += time - prev_time
            stack.append([fid, time])
            prev_time = time
        else:
            fid_top, start = stack.pop()
            result[fid_top] += time - prev_time + 1
            prev_time = time + 1

    return result
''',
    "tests": [
        {
            "name": "Example 1",
            "args": [2, ["0:start:0", "1:start:2", "1:end:5", "0:end:6"]],
            "expected": [3, 4],
        },
        {
            "name": "Example 2 (re-entrant, no nesting)",
            "args": [1, ["0:start:0", "0:start:2", "0:end:5", "0:start:6", "0:end:6", "0:end:7"]],
            "expected": [8],
        },
        {
            "name": "Example 3",
            "args": [2, ["0:start:0", "0:start:2", "0:end:5", "1:start:6", "1:end:6", "0:end:7"]],
            "expected": [7, 1],
        },
        {
            "name": "Example 4",
            "args": [2, ["0:start:0", "0:start:2", "0:end:5", "1:start:7", "1:end:7", "0:end:8"]],
            "expected": [8, 1],
        },
        {
            "name": "Single instant call",
            "args": [1, ["0:start:0", "0:end:0"]],
            "expected": [1],
        },
    ],
}
