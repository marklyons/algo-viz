"""
LeetCode 76 - Minimum Window Substring
https://leetcode.com/problems/minimum-window-substring/
"""

PROBLEM = {
    "id": "minimum-window-substring",
    "title": "76. Minimum Window Substring",
    "leetcode_url": "https://leetcode.com/problems/minimum-window-substring/",
    "func_name": "minWindow",
    "arg_names": ["s", "t"],
    "description": (
        "Given strings s and t, return the smallest substring of s that "
        "contains every character of t (including duplicates). Return "
        "\"\" if no such substring exists."
    ),
    # The editorial's classic two-pointer sliding window: expand `right`
    # until the window contains everything `t` needs, then contract from
    # `left` as far as possible while it still does, recording the
    # smallest valid window seen. `need`/`window_counts` are plain dicts
    # (Counter is a dict subclass), so they get the same live key/value
    # rendering the sorted-map problem does -- just in insertion order
    # instead of sorted, since these aren't a SortedDict.
    "starter_code": '''from collections import Counter


def minWindow(s, t):
    if not s or not t:
        return ""

    need = Counter(t)
    required = len(need)

    left = 0
    formed = 0
    window_counts = {}

    best_len = float("inf")
    best_left = 0
    best_right = 0

    for right in range(len(s)):
        c = s[right]
        window_counts[c] = window_counts.get(c, 0) + 1

        if c in need and window_counts[c] == need[c]:
            formed += 1

        while left <= right and formed == required:
            if right - left + 1 < best_len:
                best_len = right - left + 1
                best_left = left
                best_right = right

            left_char = s[left]
            window_counts[left_char] -= 1
            if left_char in need and window_counts[left_char] < need[left_char]:
                formed -= 1

            left += 1

    return "" if best_len == float("inf") else s[best_left:best_right + 1]
''',
    "tests": [
        {
            "name": "Example 1",
            "args": ["ADOBECODEBANC", "ABC"],
            "expected": "BANC",
        },
        {
            "name": "Example 2",
            "args": ["a", "a"],
            "expected": "a",
        },
        {
            "name": "No valid window",
            "args": ["a", "aa"],
            "expected": "",
        },
        {
            "name": "Whole string is the answer",
            "args": ["ab", "ab"],
            "expected": "ab",
        },
    ],
}
