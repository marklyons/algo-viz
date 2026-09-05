"""
LeetCode 23 - Merge k Sorted Lists
https://leetcode.com/problems/merge-k-sorted-lists/
"""

PROBLEM = {
    "id": "merge-k-sorted-lists",
    "title": "23. Merge k Sorted Lists",
    "leetcode_url": "https://leetcode.com/problems/merge-k-sorted-lists/",
    "func_name": "mergeKLists",
    "arg_names": ["lists"],
    "description": (
        "You are given an array of k linked lists, each sorted in "
        "ascending order. Merge all the linked lists into one sorted "
        "linked list and return its head."
    ),
    # The editorial's classic O(N log k) approach: a min-heap keyed on
    # each list's current head value, always extending the result with
    # whichever list currently has the smallest next value.
    "starter_code": '''import heapq


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def mergeKLists(lists):
    heads = list(lists)
    heap = []
    for i in range(len(heads)):
        if heads[i]:
            heapq.heappush(heap, (heads[i].val, i))

    dummy = ListNode(0)
    tail = dummy

    while heap:
        val, i = heapq.heappop(heap)
        node = heads[i]
        heads[i] = heads[i].next
        node.next = None  # detach from its original list before splicing in
        tail.next = node
        tail = node
        if heads[i]:
            heapq.heappush(heap, (heads[i].val, i))

    return dummy.next
''',
    # `lists` arrives as plain JSON (a list of plain int lists, same shape
    # LeetCode itself uses) so it stays easy to hand-edit in the given-bar.
    # This turns that into real ListNode chains -- using the solution's own
    # ListNode class -- right before the traced call, so editing the
    # class's shape (e.g. renaming `val`) is reflected here too since this
    # runs in the same namespace as the submitted code.
    "build_args_code": '''
def build_args(raw_args):
    lists_raw = raw_args[0]
    heads = []
    for values in lists_raw:
        head = None
        tail = None
        for v in values:
            node = ListNode(v)
            if head is None:
                head = node
            else:
                tail.next = node
            tail = node
        heads.append(head)
    return [heads]
''',
    # Verified against a brute-force sort-all-values reference, not taken
    # on faith. An empty result is `None` (matching what the function
    # actually returns), not `[]`.
    "tests": [
        {
            "name": "Example 1",
            "args": [[[1, 4, 5], [1, 3, 4], [2, 6]]],
            "expected": [1, 1, 2, 3, 4, 4, 5, 6],
        },
        {
            "name": "Empty list of lists",
            "args": [[]],
            "expected": None,
        },
        {
            "name": "One empty list",
            "args": [[[]]],
            "expected": None,
        },
        {
            "name": "Single list",
            "args": [[[1, 2, 3]]],
            "expected": [1, 2, 3],
        },
    ],
}
