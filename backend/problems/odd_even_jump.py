"""
LeetCode 975 - Odd Even Jump
https://leetcode.com/problems/odd-even-jump/
"""

PROBLEM = {
    "id": "odd-even-jump",
    "title": "975. Odd Even Jump",
    "leetcode_url": "https://leetcode.com/problems/odd-even-jump/",
    "func_name": "oddEvenJumps",
    "arg_names": ["arr"],
    "description": (
        "You start at any index and make alternating jumps (1st, 3rd, 5th... "
        "must be an 'odd' jump to the smallest value ahead that's >= arr[i]; "
        "2nd, 4th... an 'even' jump to the largest value ahead that's <= "
        "arr[i]). Count how many starting indices can reach the last index."
    ),
    # The user's own submitted solution: a sorted-map (TreeMap-equivalent)
    # approach, walking right-to-left so every ceiling/floor lookup only
    # ever sees indices already visited. Kept exactly as submitted (down to
    # the `if(x):` truthiness checks) rather than "fixed" -- the point of
    # this tool is to show you what your own code actually does.
    "starter_code": '''from sortedcontainers import SortedDict

def oddEvenJumps(arr):
    good_starting_index_count = 1
    n = len(arr)
    higher = [None] * n
    lower = [None] * n
    higher[n - 1] = True
    lower[n - 1] = True

    # need a TreeMap equivalent, for now just using regular map so
    # i can see why a TreeMap is required or helpful
    tMap = SortedDict()
    tMap[arr[n - 1]] = n - 1

    def ceilingAt(i):
        idx = tMap.bisect_left(arr[i])
        if idx < len(tMap):
            key = tMap.keys()[idx]
            return tMap[key]
        return None

    def floorAt(i):
        idx = tMap.bisect_right(arr[i]) - 1
        if idx >= 0:
            key = tMap.keys()[idx]
            return tMap[key]
        return None

    for i in range(n - 2, -1, -1):
        higher_key_val_pair = ceilingAt(i)
        lower_key_val_pair = floorAt(i)
        if(higher_key_val_pair):
            higher[i] = lower[higher_key_val_pair]
        if(lower_key_val_pair):
            lower[i] = higher[lower_key_val_pair]
        if higher[i]:
            good_starting_index_count += 1
        tMap[arr[i]] = i

    return good_starting_index_count
''',
    # Verified against an independent monotonic-stack reference
    # implementation of the same problem, not taken on faith.
    "tests": [
        {
            "name": "Example 1",
            "args": [[10, 13, 12, 14, 15, 13, 16, 17]],
            "expected": 2,
        },
        {
            "name": "Example 2",
            "args": [[2, 3, 1, 1, 4]],
            "expected": 3,
        },
        {
            "name": "Example 3",
            "args": [[5, 1, 3, 4, 2]],
            "expected": 3,
        },
        {
            "name": "Palindrome-shaped",
            "args": [[1, 2, 3, 2, 1]],
            "expected": 3,
        },
    ],
}
