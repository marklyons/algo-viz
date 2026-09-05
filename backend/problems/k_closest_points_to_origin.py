"""
LeetCode 973 - K Closest Points to Origin
https://leetcode.com/problems/k-closest-points-to-origin/
"""

PROBLEM = {
    "id": "k-closest-points-to-origin",
    "title": "973. K Closest Points to Origin",
    "leetcode_url": "https://leetcode.com/problems/k-closest-points-to-origin/",
    "func_name": "kClosest",
    "arg_names": ["points", "k"],
    "description": (
        "Given an array of points on the X-Y plane, return the k points "
        "closest to the origin (0, 0), in any order (Euclidean distance)."
    ),
    # The editorial's max-heap approach: keep a heap of the k closest
    # points seen so far, keyed on *negative* squared distance so Python's
    # min-heap acts as a max-heap -- once the heap grows past size k, the
    # single farthest point among the k-best is sitting at the top and
    # gets popped. Squared distance avoids a sqrt with no effect on
    # ordering. The final sort just makes the output order deterministic
    # for testing -- any order is a correct answer on LeetCode itself.
    "starter_code": '''import heapq


def kClosest(points, k):
    heap = []
    for i in range(len(points)):
        x, y = points[i]
        dist = x * x + y * y
        heapq.heappush(heap, (-dist, i))
        if len(heap) > k:
            heapq.heappop(heap)

    result = [points[i] for _, i in heap]
    result.sort(key=lambda p: p[0] * p[0] + p[1] * p[1])
    return result
''',
    # Verified against an independent sort-by-distance reference, not
    # taken on faith.
    "tests": [
        {
            "name": "Example 1",
            "args": [[[1, 3], [-2, 2]], 1],
            "expected": [[-2, 2]],
        },
        {
            "name": "Example 2",
            "args": [[[3, 3], [5, -1], [-2, 4]], 2],
            "expected": [[3, 3], [-2, 4]],
        },
        {
            "name": "k equals number of points",
            "args": [[[0, 1], [1, 0]], 2],
            "expected": [[0, 1], [1, 0]],
        },
        {
            "name": "Tie-breaking on distance",
            "args": [[[1, 1], [2, 2], [3, 3]], 2],
            "expected": [[1, 1], [2, 2]],
        },
    ],
}
