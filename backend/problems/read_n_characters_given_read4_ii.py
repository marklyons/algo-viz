"""
LeetCode 158 - Read N Characters Given Read4 II - Call Multiple Times
https://leetcode.com/problems/read-n-characters-given-read4-ii-call-multiple-times/
"""

PROBLEM = {
    "id": "read-n-characters-given-read4-ii",
    "title": "158. Read N Characters Given Read4 II - Call Multiple Times",
    "leetcode_url": "https://leetcode.com/problems/read-n-characters-given-read4-ii-call-multiple-times/",
    "func_name": "read_multi",
    "arg_names": ["file", "queries"],
    "description": (
        "read4(buf4) reads up to 4 characters from a file into buf4 and "
        "returns how many it actually read. Using only read4, implement "
        "read(buf, n), which may be called repeatedly against the same "
        "file -- each call should pick up exactly where the last left off."
    ),
    # LeetCode splits this into a Solution class whose read() method gets
    # called once per query, with buf4/read_pos/write_pos as class
    # variables that persist between calls precisely so a call that reads
    # past what read4 last handed back can resume from the leftover
    # characters instead of re-reading them. This tool traces one function
    # call, so the per-call class is collapsed into a single function that
    # loops over every query -- buf4/read_pos/write_pos become ordinary
    # local variables of that loop, which is the same persistence the
    # class variables gave, just carried by a local instead of `self`.
    # `read4` itself is mocked here as a closure over the given `file`
    # string, standing in for the real disk-backed API the problem
    # describes; the read()-side algorithm -- the actual thing worth
    # stepping through -- is untouched: same buffer/pointer bookkeeping,
    # same refill-on-exhaustion check, just `return i` / `return n`
    # rewritten as "record this query's answer and move on to the next
    # one" (a break out of the inner loop, or its for-else when the loop
    # never breaks).
    "starter_code": '''def read_multi(file, queries):
    pos = 0  # the mocked file's own advancing read pointer

    def read4(buf4):
        nonlocal pos
        count = 0
        while count < 4 and pos < len(file):
            buf4[count] = file[pos]
            count += 1
            pos += 1
        return count

    buf4 = [''] * 4
    read_pos = 0
    write_pos = 0
    results = []

    for n in queries:
        buf = [''] * n
        for i in range(n):
            if read_pos == write_pos:
                write_pos = read4(buf4)
                read_pos = 0
                if write_pos == 0:
                    results.append(i)
                    break
            buf[i] = buf4[read_pos]
            read_pos += 1
        else:
            results.append(n)

    return results
''',
    # Verified against LeetCode's own two examples, plus edge cases for a
    # query landing exactly on a read4 chunk boundary and a query that
    # runs past the end of the file.
    "tests": [
        {
            "name": "Example 1",
            "args": ["abc", [1, 2, 1]],
            "expected": [1, 2, 0],
        },
        {
            "name": "Example 2",
            "args": ["abc", [4, 1]],
            "expected": [3, 0],
        },
        {
            "name": "Queries land on read4's own 4-char chunks",
            "args": ["abcdefgh", [3, 3, 3]],
            "expected": [3, 3, 2],
        },
        {
            "name": "Single query past end of file",
            "args": ["ab", [5]],
            "expected": [2],
        },
    ],
}
