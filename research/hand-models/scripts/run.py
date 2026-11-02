import sys, numpy as np
from pipe import *
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert('RGB')
res = {}
for pm, lm in [('palm_detection_lite', 'hand_landmark_lite'), ('palm_detection_full', 'hand_landmark_full')]:
    rt = {'tflite': (tfl(pm), tfl(lm)), 'ort': (onx(pm)[0], onx(lm)[0]),
          'tract': (trc(pm, (1, 192, 192, 3)), trc(lm, (1, 224, 224, 3)))}
    xp = (np.random.default_rng(0).random((1, 192, 192, 3))).astype(np.float32)
    xl = (np.random.default_rng(1).random((1, 224, 224, 3))).astype(np.float32)
    ref = {k: (sorted(v[0](xp), key=lambda a: a.size), sorted(v[1](xl), key=lambda a: a.size)) for k, v in rt.items()}
    for k in ['ort', 'tract']:
        dp = max(float(np.abs(a - b).max()) for a, b in zip(ref['tflite'][0], ref[k][0]))
        dl = max(float(np.abs(a - b).max()) for a, b in zip(ref['tflite'][1], ref[k][1]))
        print(f'{pm.split("_")[-1]:4s} {k:5s}  max |diff| vs tflite: palm {dp:.2e}  landmark {dl:.2e}')
    for k, (p, l) in rt.items():
        print(f'{pm.split("_")[-1]:4s} {k:6s} median ms: palm {timeit(p, xp):6.1f}  landmark {timeit(l, xl):6.1f}')
    det = {k: palm(v[0], im) for k, v in rt.items()}
    for k, d in det.items(): print(f'{pm.split("_")[-1]:4s} {k:6s} palm score {d[0]:.3f} centre ({d[1][0]:.0f},{d[1][1]:.0f})')
    box = crop_box(det['tract'])
    out = {k: landmarks(v[1], im, box) for k, v in rt.items()}
    for k, (pts, pres, _, _) in out.items():
        print(f'{pm.split("_")[-1]:4s} {k:6s} presence/handedness {[round(p, 3) for p in pres]}  index tip ({pts[8][0]:.0f},{pts[8][1]:.0f})')
    res[pm] = (det['tract'], box, out['tract'])
# overlay from the full models through tract
det, box, (pts, pres, _, crop) = res['palm_detection_full']
o = im.copy(); d = ImageDraw.Draw(o)
B = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(0,17),(17,18),(18,19),(19,20)]
for a, b in B: d.line([pts[a], pts[b]], fill=(20, 220, 120), width=5)
for p in pts: d.ellipse([p[0]-7, p[1]-7, p[0]+7, p[1]+7], fill=(255, 255, 255), outline=(0, 0, 0))
cx, cy, size, rot = box
cs = [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]
poly = [(cx + size*(u*math.cos(rot) - v*math.sin(rot)), cy + size*(u*math.sin(rot) + v*math.cos(rot))) for u, v in cs]
d.polygon(poly, outline=(255, 200, 0), width=4)
o.save(sys.argv[2]); crop.save(sys.argv[2].replace('.jpg', '-crop.jpg'))
