"""
LeetCode 159 - Longest Substring with At Most Two Distinct Characters
https://leetcode.com/problems/longest-substring-with-at-most-two-distinct-characters/
"""

PROBLEM = {
    "id": "longest-substring-with-at-most-two-distinct-characters",
    "title": "159. Longest Substring with At Most Two Distinct Characters",
    "leetcode_url": "https://leetcode.com/problems/longest-substring-with-at-most-two-distinct-characters/",
    "func_name": "lengthOfLongestSubstringTwoDistinct",
    "arg_names": ["s"],
    "description": (
        "Given a string s, return the length of the longest substring "
        "that contains at most two distinct characters."
    ),
    # This is a work-in-progress attempt, kept exactly as written (bugs and
    # all) so it can be stepped through in the tracer rather than fixed up
    # front. `self`/the enclosing Solution class are stripped since the
    # tracer runs a plain function, but the body -- including the
    # `longes_len` typo that never updates `longest_len`, the `return res`
    # that references a variable which is never assigned, and whatever the
    # two-pointer reset logic does or doesn't do correctly -- is untouched.
    "starter_code": '''def lengthOfLongestSubstringTwoDistinct(s):
    if not s:
        return 0
    if len(s) <= 2:
        return len(s)

    i = 0
    j = 1
    start_of_2nd_pointer = -1
    seen_chars = set()
    seen_chars.add(s[i])
    longest_substring = f"{s[i]}{s[j]}"
    longest_len = 2

    while i < j and j < len(s):
        longes_len = max(j - i, longest_len)
        new_char = s[j]
        if len(seen_chars) == 1 and new_char not in seen_chars:
            start_of_2nd_pointer = j
            seen_chars.add(new_char)
        elif len(seen_chars) == 2 and new_char not in seen_chars:
            while(len(seen_chars) == 2):
                seen_chars = {new_char, s[start_of_2nd_pointer]}
                i = start_of_2nd_pointer
                j = start_of_2nd_pointer + 1
            print(f"Resetting to {i}")
        else:
            j += 1

        print(f"{seen_chars}, {j}")

    return res
''',
    # LeetCode's own two examples, plus the usual edge cases (empty string,
    # single character, and a string that never exceeds two distinct
    # characters). The solution above doesn't pass any of these yet -- that's
    # the point: step through with these inputs to see where it goes wrong.
    "tests": [
        {
            "name": "Example 1",
            "args": ["eceba"],
            "expected": 3,
        },
        {
            "name": "Example 2",
            "args": ["ccaabbb"],
            "expected": 5,
        },
        {
            "name": "Empty string",
            "args": [""],
            "expected": 0,
        },
        {
            "name": "Single character",
            "args": ["a"],
            "expected": 1,
        },
        {
            "name": "Already at most two distinct characters",
            "args": ["aabb"],
            "expected": 4,
        },
    ],
}
