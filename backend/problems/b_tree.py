"""
CS Fundamentals - Populate a B-Tree

Not a LeetCode problem: a from-scratch data-structure demo alongside
"Build a Balanced BST" in the "CS Fundamentals & Data Structures"
section. Unlike a binary tree, a B-tree node holds several keys at once
(up to 2t-1, here t=2 so up to 3) and fans out to that many+1 children --
the point of this demo is watching *why* a node splits: insert keys one
at a time, and once a node would overflow past 2t-1 keys, its middle key
gets pushed up into the parent and the node splits in two. That's what
keeps every leaf at the same depth without ever needing to rebalance the
way a plain BST would.
"""


# Reference construction used only to compute `expected` for the tests
# below -- mirrors tracer.py's own node -> {keys, children} BFS flattening
# so the larger tests' expected output doesn't have to be hand-authored.
# Insertion order fully determines the resulting shape, so re-running the
# same algorithm here is a faithful (not just plausible) reference.
class _RefNode:
    __slots__ = ("keys", "children", "leaf")

    def __init__(self, leaf=True):
        self.keys = []
        self.children = []
        self.leaf = leaf


_REF_T = 2


def _ref_split_child(parent, i):
    full = parent.children[i]
    new = _RefNode(leaf=full.leaf)
    mid_key = full.keys[_REF_T - 1]
    new.keys = full.keys[_REF_T:]
    full.keys = full.keys[:_REF_T - 1]
    if not full.leaf:
        new.children = full.children[_REF_T:]
        full.children = full.children[:_REF_T]
    parent.children.insert(i + 1, new)
    parent.keys.insert(i, mid_key)


def _ref_insert_key(node, key):
    i = len(node.keys) - 1
    if node.leaf:
        node.keys.append(None)
        while i >= 0 and key < node.keys[i]:
            node.keys[i + 1] = node.keys[i]
            i -= 1
        node.keys[i + 1] = key
    else:
        while i >= 0 and key < node.keys[i]:
            i -= 1
        i += 1
        if len(node.children[i].keys) == 2 * _REF_T - 1:
            _ref_split_child(node, i)
            if key > node.keys[i]:
                i += 1
        _ref_insert_key(node.children[i], key)


def _ref_build(values):
    root = _RefNode(leaf=True)
    for v in values:
        if len(root.keys) == 2 * _REF_T - 1:
            new_root = _RefNode(leaf=False)
            new_root.children.append(root)
            _ref_split_child(new_root, 0)
            root = new_root
        _ref_insert_key(root, v)
    return root


def _flatten(root):
    index_of = {id(root): 0}
    queue = [root]
    nodes = []
    i = 0
    while i < len(queue):
        node = queue[i]
        i += 1
        idxs = []
        for c in node.children:
            if id(c) not in index_of:
                index_of[id(c)] = len(queue)
                queue.append(c)
            idxs.append(index_of[id(c)])
        nodes.append({"keys": list(node.keys), "children": idxs})
    return nodes


PROBLEM = {
    "id": "b-tree",
    "category": "CS Fundamentals & Data Structures",
    "title": "Populate a B-Tree",
    "func_name": "buildBTree",
    "arg_names": ["values"],
    "description": (
        "Insert values one at a time into a B-tree of minimum degree "
        "t=2 (each node holds up to 2t-1=3 keys and up to 2t=4 "
        "children). Once a node would overflow past 3 keys, its middle "
        "key is pushed up into the parent and the node splits into two "
        "-- watch the tree grow and occasionally gain a level as that "
        "happens. Try the 1000-key test to see a full-size tree; "
        "scroll/zoom the canvas to explore it."
    ),
    "starter_code": '''class BTreeNode:
    def __init__(self, leaf=True):
        self.keys = []
        self.children = []
        self.leaf = leaf


T = 2  # minimum degree: max 2T-1=3 keys, max 2T=4 children per node


def splitChild(parent, i):
    full = parent.children[i]
    new = BTreeNode(leaf=full.leaf)
    mid_key = full.keys[T - 1]
    new.keys = full.keys[T:]
    full.keys = full.keys[:T - 1]
    if not full.leaf:
        new.children = full.children[T:]
        full.children = full.children[:T]
    parent.children.insert(i + 1, new)
    parent.keys.insert(i, mid_key)


def insertKey(node, key):
    i = len(node.keys) - 1
    if node.leaf:
        node.keys.append(None)
        while i >= 0 and key < node.keys[i]:
            node.keys[i + 1] = node.keys[i]
            i -= 1
        node.keys[i + 1] = key
    else:
        while i >= 0 and key < node.keys[i]:
            i -= 1
        i += 1
        if len(node.children[i].keys) == 2 * T - 1:
            splitChild(node, i)
            if key > node.keys[i]:
                i += 1
        insertKey(node.children[i], key)


def insertOne(root, key):
    if len(root.keys) == 2 * T - 1:
        new_root = BTreeNode(leaf=False)
        new_root.children.append(root)
        splitChild(new_root, 0)
        root = new_root
    insertKey(root, key)
    return root


def buildBTree(values):
    root = BTreeNode(leaf=True)
    for v in values:
        root = insertOne(root, v)
    return root
''',
    "tests": [
        {
            "name": "7 keys",
            "args": [[0, 1, 2, 3, 4, 5, 6]],
            "expected": _flatten(_ref_build([0, 1, 2, 3, 4, 5, 6])),
        },
        {
            "name": "16 keys (unsorted)",
            "args": [[20, 40, 10, 30, 33, 50, 60, 5, 15, 25, 18, 31, 35, 45, 55, 65]],
            "expected": _flatten(_ref_build(
                [20, 40, 10, 30, 33, 50, 60, 5, 15, 25, 18, 31, 35, 45, 55, 65]
            )),
        },
        {
            "name": "100 keys",
            "args": [list(range(100))],
            "expected": _flatten(_ref_build(list(range(100)))),
        },
        {
            "name": "1000 keys",
            "args": [list(range(1000))],
            "expected": _flatten(_ref_build(list(range(1000)))),
        },
    ],
}
