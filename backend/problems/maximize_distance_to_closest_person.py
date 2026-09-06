"""
LeetCode 849 - Maximize Distance to Closest Person
https://leetcode.com/problems/maximize-distance-to-closest-person/
"""

PROBLEM = {
    "id": "maximize-distance-to-closest-person",
    "title": "849. Maximize Distance to Closest Person",
    "leetcode_url": "https://leetcode.com/problems/maximize-distance-to-closest-person/",
    "func_name": "maxDistToClosest",
    "arg_names": ["seats"],
    "description": (
        "seats[i] = 1 means someone is sitting in seat i, 0 means it's "
        "empty. Pick the empty seat that maximizes the distance to the "
        "nearest occupied seat, and return that distance."
    ),
    # The user's own submitted solution: a left-to-right pass fills
    # max_space[i] with the distance back to the nearest person *to the
    # left* (math.inf for a stretch of empty seats starting at index 0,
    # since there's no one to the left yet), then a right-to-left pass
    # takes the min against the distance to the nearest person *to the
    # right*, so max_space[i] ends up holding the true closest-person
    # distance for seat i either way. Kept exactly as submitted, comments
    # included.
    "starter_code": '''import math


def maxDistToClosest(seats):
    if not seats:
        return 0
    max_space = [0] * len(seats)
    for i, seat in enumerate(seats):
        if seat == 1:
            max_space[i] = 0
        else:
            if i == 0:
                max_space[i] = math.inf  # L2R pass will fix
            else:
                max_space[i] = max_space[i - 1] + 1

    right_dist = math.inf
    for i in range(len(seats) - 1, -1, -1):
        if seats[i] == 1:
            right_dist = 0
        if seats[i] == 0:
            right_dist += 1
            max_space[i] = min(max_space[i], right_dist)

    return max(max_space)
''',
    # Verified against LeetCode's own three examples.
    "tests": [
        {
            "name": "Example 1",
            "args": [[1, 0, 0, 0, 1, 0, 1]],
            "expected": 2,
        },
        {
            "name": "Example 2 (best seat is at an end)",
            "args": [[1, 0, 0, 0]],
            "expected": 3,
        },
        {
            "name": "Example 3",
            "args": [[0, 1]],
            "expected": 1,
        },
        {
            "name": "Multiple gaps, largest not at an end",
            "args": [[1, 0, 0, 1, 0, 0, 0, 1]],
            "expected": 2,
        },
    ],
}
