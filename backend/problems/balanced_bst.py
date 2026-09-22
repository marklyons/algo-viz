"""
CS Fundamentals - Build a Balanced Binary Search Tree

Not a LeetCode problem: a from-scratch data-structure demo for the new
"CS Fundamentals & Data Structures" section, alongside the LeetCode
problems. Builds a height-balanced BST out of a sorted array by always
picking the middle element as the root of each subrange -- the classic
approach, and the reason it's here: it's the cleanest way to *watch* why
picking the middle keeps both halves within one node of each other in
size, which is what keeps the tree's height at O(log n) instead of
degenerating into a linked list the way inserting an already-sorted
sequence one node at a time into a plain BST would.
"""

# Reference construction used only to compute `expected` for the tests
# below -- mirrors tracer.py's own node -> {val, left, right} flattening
# so the 1000-node test's expected output doesn't have to be hand-authored.
class _RefNode:
    __slots__ = ("val", "left", "right")

    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def _ref_build(values):
    if not values:
        return None
    mid = len(values) // 2
    return _RefNode(
        values[mid],
        _ref_build(values[:mid]),
        _ref_build(values[mid + 1:]),
    )


def _flatten(root):
    if root is None:
        return []
    index_of = {id(root): 0}
    queue = [root]
    nodes = []
    i = 0
    while i < len(queue):
        node = queue[i]
        i += 1
        left_idx = right_idx = None
        if node.left is not None:
            index_of[id(node.left)] = len(queue)
            queue.append(node.left)
            left_idx = index_of[id(node.left)]
        if node.right is not None:
            index_of[id(node.right)] = len(queue)
            queue.append(node.right)
            right_idx = index_of[id(node.right)]
        nodes.append({"val": node.val, "left": left_idx, "right": right_idx})
    return nodes


PROBLEM = {
    "id": "balanced-bst",
    "category": "CS Fundamentals & Data Structures",
    "title": "Build a Balanced BST",
    "func_name": "buildBalancedBST",
    "arg_names": ["values"],
    "description": (
        "Given a sorted array, build a height-balanced binary search "
        "tree by recursing on the middle element: it becomes the "
        "subtree's root, and the values on either side of it recurse "
        "into its left and right children. Try the 1000-node test to "
        "watch a full-size balanced tree take shape -- scroll/zoom the "
        "canvas out to see its shape, then in to read individual nodes."
    ),
    "starter_code": '''class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def buildBalancedBST(values):
    if not values:
        return None
    mid = len(values) // 2
    node = TreeNode(values[mid])
    node.left = buildBalancedBST(values[:mid])
    node.right = buildBalancedBST(values[mid + 1:])
    return node
''',
    "tests": [
        {
            "name": "7 nodes",
            "args": [[1, 2, 3, 4, 5, 6, 7]],
            "expected": _flatten(_ref_build([1, 2, 3, 4, 5, 6, 7])),
        },
        {
            "name": "100 nodes",
            "args": [list(range(100))],
            "expected": _flatten(_ref_build(list(range(100)))),
        },
        {
            "name": "1000 nodes",
            "args": [list(range(1000))],
            "expected": _flatten(_ref_build(list(range(1000)))),
        },
    ],
}
