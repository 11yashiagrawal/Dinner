import os, sys
sys.path.insert(0, os.environ["DINNER_WORKSPACE"])
from chunks import chunks

assert chunks([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]
