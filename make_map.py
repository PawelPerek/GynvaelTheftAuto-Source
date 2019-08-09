import sys
import json

path = sys.argv[1]

f = open(path)

f_content = f.read()

f.close()

obj = json.loads(f_content)

l = obj["layers"][0]["data"]
n = obj["layers"][0]["height"]

map = [l[i:i + n] for i in range(0, len(l), n)]

JSON = json.dumps(map)

f = open(f"./data/map.json", 'w')

f.write(JSON)

f.close()
