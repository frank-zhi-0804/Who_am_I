from pathlib import Path
import json
from shapely.geometry import shape, Polygon, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

# Optional development helper. Requires Shapely; production has no Python dependency.
root = Path(__file__).resolve().parent.parent
raw = (root / 'dist/geography.js').read_text(encoding='utf-8')
data = json.loads(raw.split('=', 1)[1].strip().rstrip(';'))
china = unary_union([make_valid(shape(f['geometry'])) for f in data['features']])
world = Polygon([(-180, -85.0511), (180, -85.0511), (180, 85.0511), (-180, 85.0511), (-180, -85.0511)])
outside = world.difference(china)
assert outside.is_valid
feature = {'type': 'Feature', 'properties': {'source': 'DataV GeoAtlas; dissolved province boundaries'}, 'geometry': mapping(outside)}
(root / 'dist/china-mask.js').write_text('window.chinaOutsideData=' + json.dumps(feature, separators=(',', ':')) + ';\n', encoding='utf-8')
print('China mask generated from local province data.')
