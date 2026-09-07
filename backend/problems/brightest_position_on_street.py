"""
LeetCode 2021 - Brightest Position on Street
https://leetcode.com/problems/brightest-position-on-street/
"""

PROBLEM = {
    "id": "brightest-position-on-street",
    "title": "2021. Brightest Position on Street",
    "leetcode_url": "https://leetcode.com/problems/brightest-position-on-street/",
    "func_name": "brightestPosition",
    "arg_names": ["lights"],
    "description": (
        "Each lights[i] = [position, range] is a street lamp that lights "
        "up [position - range, position + range]. A position's brightness "
        "is how many lamps cover it. Return the brightest position, or the "
        "smallest one if several tie."
    ),
    # A difference-array sweep: rather than an array indexed by position
    # (positions range over +/- 1e8, far too wide to allocate), record just
    # the two endpoints where each lamp's coverage starts and stops
    # mattering -- brightness goes up by 1 the instant a lamp's range
    # begins, and back down the instant after it ends. A SortedDict is the
    # natural fit here: it's keyed by position (so the tool's map rendering
    # shows exactly what the algorithm sees), but -- unlike a plain dict --
    # iterating it walks positions in order, which the second pass depends
    # on to sweep brightness from left to right.
    "starter_code": '''from sortedcontainers import SortedDict


def brightestPosition(lights):
    diff = SortedDict()
    for pos, rng in lights:
        left = pos - rng
        right = pos + rng + 1
        diff[left] = diff.get(left, 0) + 1
        diff[right] = diff.get(right, 0) - 1

    best_pos = 0
    best_brightness = 0
    brightness = 0
    for position, delta in diff.items():
        brightness += delta
        if brightness > best_brightness:
            best_brightness = brightness
            best_pos = position

    return best_pos
''',
    # Verified against LeetCode's own three examples.
    "tests": [
        {
            "name": "Example 1",
            "args": [[[-3, 2], [1, 2], [3, 3]]],
            "expected": -1,
        },
        {
            "name": "Example 2 (tie broken by smaller position)",
            "args": [[[1, 0], [0, 1]]],
            "expected": 1,
        },
        {
            "name": "Example 3 (single lamp, tie among 5 positions)",
            "args": [[[1, 2]]],
            "expected": -1,
        },
        {
            "name": "Non-overlapping lamps",
            "args": [[[-10, 1], [10, 1]]],
            "expected": -11,
        },
    ],
}
