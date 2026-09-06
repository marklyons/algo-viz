"""
LeetCode 115 - Distinct Subsequences
https://leetcode.com/problems/distinct-subsequences/
"""

PROBLEM = {
    "id": "distinct-subsequences",
    "title": "115. Distinct Subsequences",
    "leetcode_url": "https://leetcode.com/problems/distinct-subsequences/",
    "func_name": "numDistinct",
    "arg_names": ["s", "t"],
    "description": (
        "Given two strings s and t, return the number of distinct ways you "
        "can pick characters out of s, keeping their relative order, so "
        "that they spell out t exactly."
    ),
    # Rolling 1D DP: dp[j] holds the number of ways to form t[:j] using the
    # characters of s seen so far. dp[0] is always 1 -- there's exactly one
    # way to form the empty string, by picking nothing. Walking j from high
    # to low as each new s[i] comes in means dp[j-1] on the right-hand side
    # still holds *last* row's value (i.e. without s[i]) when it's read, so
    # one array does the job of the textbook 2D dp[i][j] table without ever
    # allocating the second dimension.
    "starter_code": '''def numDistinct(s, t):
    n, m = len(s), len(t)
    dp = [1] + [0] * m

    for i in range(n):
        for j in range(m, 0, -1):
            if s[i] == t[j - 1]:
                dp[j] += dp[j - 1]

    return dp[m]
''',
    # Examples verified against LeetCode's own; edge cases added for a
    # non-match and a repeated-character source string.
    "tests": [
        {
            "name": "Example 1",
            "args": ["rabbbit", "rabbit"],
            "expected": 3,
        },
        {
            "name": "Example 2",
            "args": ["babgbag", "bag"],
            "expected": 5,
        },
        {
            "name": "s equals t",
            "args": ["abc", "abc"],
            "expected": 1,
        },
        {
            "name": "no shared characters",
            "args": ["abc", "xyz"],
            "expected": 0,
        },
        {
            "name": "repeated source character",
            "args": ["aaa", "a"],
            "expected": 3,
        },
    ],
}
