"""
LeetCode 857 - Minimum Cost to Hire K Workers
https://leetcode.com/problems/minimum-cost-to-hire-k-workers/
"""

PROBLEM = {
    "id": "minimum-cost-to-hire-k-workers",
    "title": "857. Minimum Cost to Hire K Workers",
    "leetcode_url": "https://leetcode.com/problems/minimum-cost-to-hire-k-workers/",
    "func_name": "mincostToHireWorkers",
    "arg_names": ["quality", "wage", "k"],
    "description": (
        "There are n workers, each with a quality and a minimum wage "
        "expectation. Hire exactly k of them into a paid group where pay "
        "is proportional to quality and everyone is paid at least their "
        "minimum -- return the smallest possible total pay for the group."
    ),
    # The user's own submitted solution: sort candidates by wage/quality
    # ratio, then slide a max-heap of the k smallest qualities across them
    # -- at each point where the heap holds exactly k workers, the current
    # (now-highest-seen) ratio sets everyone's pay, so total_quality * rate
    # is a candidate answer. Kept exactly as submitted, including the
    # self-doubting comment about whether the sort is even needed -- that's
    # exactly the kind of thing worth stepping through for yourself rather
    # than having it explained away.
    "starter_code": '''import math
import heapq


def mincostToHireWorkers(quality, wage, k):
    res = math.inf
    pairs = [] # (ratio, quality)
    for i, q in enumerate(quality):
        pairs.append(((wage[i] / q), q))
    pairs.sort(key = lambda p:p[0]) # needed? Wouldn't it just look at the first anyway?

    max_heap = [] # Qualities
    total_quality = 0
    for rate, q in pairs:
        heapq.heappush(max_heap, q * -1)
        total_quality += q

        if len(max_heap) > k:
            total_quality += heapq.heappop(max_heap)

        if len(max_heap) == k:
            res = min(total_quality * rate, res)

    return res
''',
    # Verified against the official LeetCode examples -- looked them up
    # rather than trusting recall after a first guess at Example 2's `k`
    # turned out wrong.
    "tests": [
        {
            "name": "Example 1",
            "args": [[10, 20, 5], [70, 50, 30], 2],
            "expected": 105.0,
        },
        {
            "name": "Example 2",
            "args": [[3, 1, 10, 10, 1], [4, 8, 2, 2, 7], 3],
            "expected": 30.666666666666664,
        },
        {
            "name": "k = 1 (cost is just the cheapest wage)",
            "args": [[10, 20, 5], [70, 50, 30], 1],
            "expected": 30.0,
        },
        {
            "name": "k = n (hire everyone)",
            "args": [[10, 20, 5], [70, 50, 30], 3],
            "expected": 245.0,
        },
    ],
}
