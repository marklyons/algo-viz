"""
LeetCode 124 - Binary Tree Maximum Path Sum
https://leetcode.com/problems/binary-tree-maximum-path-sum/
"""

PROBLEM = {
    "id": "binary-tree-maximum-path-sum",
    "title": "124. Binary Tree Maximum Path Sum",
    "leetcode_url": "https://leetcode.com/problems/binary-tree-maximum-path-sum/",
    "func_name": "maxPathSum",
    "arg_names": ["root"],
    "description": (
        "A path in a binary tree is a sequence of nodes where each pair of "
        "adjacent nodes in the sequence has an edge connecting them. A node "
        "can only appear in the sequence at most once, and the path does "
        "not need to pass through the root. Given the root of a binary "
        "tree, return the maximum path sum of any non-empty path."
    ),
    # Post-order recursion: the recursive call on a node returns the most a
    # path can contribute if it continues up through that node into its
    # parent -- either 0 (skip this node's whole subtree, if it's all
    # negative) or node.val plus whichever single child branch helps more (a
    # path can only leave a node in one direction once it heads to the
    # parent). That return value alone can't also capture a path that bends
    # through a node using *both* children at once -- valid as a final
    # answer for that node, never as something a parent could extend
    # further -- so `best_sum` threads through every call as a shared
    # one-element list, updated whenever a node's own bent-path total beats
    # the best seen so far.
    #
    # The editorial version of this splits that into two functions -- an
    # outer one taking just `root`, and an inner recursive helper closing
    # over a `nonlocal` best-sum. This tracer only steps line-by-line
    # through the one function it's told to call, though, treating any
    # other function it calls (an inner helper included) as a black box --
    # so the two are collapsed into one function that recurses on itself,
    # with `best_sum` passed along explicitly instead of closed over, and
    # `is_root_call` marking the outermost call so it alone returns the
    # overall best instead of handing its own gain up to a (nonexistent)
    # parent.
    "starter_code": '''class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def maxPathSum(root, best_sum=None):
    is_root_call = best_sum is None
    if is_root_call:
        best_sum = [float("-inf")]

    if root is None:
        gain = 0
    else:
        left_gain = max(maxPathSum(root.left, best_sum), 0)
        right_gain = max(maxPathSum(root.right, best_sum), 0)

        through_node = root.val + left_gain + right_gain
        if through_node > best_sum[0]:
            best_sum[0] = through_node

        gain = root.val + max(left_gain, right_gain)

    return best_sum[0] if is_root_call else gain
''',
    # `root` arrives as LeetCode's own level-order array (None marking a
    # missing child, with no entries for a None's own children) so it stays
    # easy to hand-edit in the given-bar. This turns that into a real
    # TreeNode tree -- using the solution's own TreeNode class -- right
    # before the traced call, the same approach merge_k_sorted_lists.py
    # takes for ListNode.
    "build_args_code": '''
def build_args(raw_args):
    values = raw_args[0]
    if not values:
        return [None]

    root = TreeNode(values[0])
    queue = [root]
    i = 1
    while queue and i < len(values):
        node = queue.pop(0)
        if i < len(values):
            if values[i] is not None:
                node.left = TreeNode(values[i])
                queue.append(node.left)
            i += 1
        if i < len(values):
            if values[i] is not None:
                node.right = TreeNode(values[i])
                queue.append(node.right)
            i += 1
    return [root]
''',
    # LeetCode's own two examples, plus edge cases: a single node (no edges
    # at all, so the answer is just that node's value even when negative)
    # and an all-negative tree (the best path is the least-negative single
    # node, not some larger combination that only makes things worse).
    "tests": [
        {
            "name": "Example 1",
            "args": [[1, 2, 3]],
            "expected": 6,
        },
        {
            "name": "Example 2",
            "args": [[-10, 9, 20, None, None, 15, 7]],
            "expected": 42,
        },
        {
            "name": "Single node",
            "args": [[-3]],
            "expected": -3,
        },
        {
            "name": "All negative values",
            "args": [[-2, -1]],
            "expected": -1,
        },
    ],
}
