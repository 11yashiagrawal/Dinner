import os, sys
sys.path.insert(0, os.getcwd())
from stats import median

values = [4, 1, 3, 2]
assert median(values) == 2.5
assert values == [4, 1, 3, 2]
