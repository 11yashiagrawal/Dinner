import os, sys
sys.path.insert(0, os.environ["DINNER_WORKSPACE"])
from ports import parse_port

for value in ("0", "65536"):
    try:
        parse_port(value)
        raise AssertionError("out-of-range port accepted")
    except ValueError:
        pass
