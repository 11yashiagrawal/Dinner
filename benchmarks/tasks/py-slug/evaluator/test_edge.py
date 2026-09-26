import os, sys
sys.path.insert(0, os.getcwd())
from slug import slugify

assert slugify("  Hello World!  ") == "hello-world"
