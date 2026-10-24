#!/usr/bin/env python3
"""v7 sans UV, trous creusés, lumières KHR. GLB compact du solitaire : table, board, hole_<i> x33, m_<i> x33 (sphere unitaire, scale 0.4 en noeud)."""
import sys, json, struct, math, base64
def valid(i):
    x, y = i % 7, i // 7
    return not ((x < 2 or x > 4) and (y < 2 or y > 4))
bin_ = bytearray(); views = []; acc = []
def blob(data, fmt, target):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); raw = struct.pack('<%d%s' % (len(data), fmt), *data); bin_.extend(raw)
    views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target}); return len(views) - 1
def acc_vec3(vi, P, minmax=True):
    d = {"bufferView": vi, "componentType": 5126, "count": len(P) // 3, "type": "VEC3"}
    if minmax:
        xs, ys, zs = P[0::3], P[1::3], P[2::3]
        d["min"] = [min(xs), min(ys), min(zs)]; d["max"] = [max(xs), max(ys), max(zs)]
    acc.append(d); return len(acc) - 1
def acc_idx(vi, I):
    acc.append({"bufferView": vi, "componentType": 5123, "count": len(I), "type": "SCALAR"}); return len(acc) - 1
meshes = []
def acc_vec2(vi, U):
    acc.append({"bufferView": vi, "componentType": 5126, "count": len(U) // 2, "type": "VEC2"}); return len(acc) - 1
def prim(P, N, I, mat, shared=False, UV=None):
    vp = blob(P, 'f', 34962); ap = acc_vec3(vp, P)
    at = {"POSITION": ap}
    if shared: at["NORMAL"] = ap
    elif N: at["NORMAL"] = acc_vec3(blob(N, 'f', 34962), N, False)
    ai = acc_idx(blob(I, 'H', 34963), I)
    if UV: at["TEXCOORD_0"] = acc_vec2(blob(UV, 'f', 34962), UV)
    return {"attributes": at, "indices": ai, "material": mat}
def mesh(*prims):
    meshes.append({"primitives": list(prims)}); return len(meshes) - 1
def planar(P, k):
    return [round(v, 4) for i in range(0, len(P), 3) for v in (P[i] / k, P[i + 2] / k)]
def sph_uv(seg=16, rings=10):
    return [round(v, 4) for a in range(rings + 1) for b in range(seg + 1) for v in (b / seg, a / rings)]
def sphere(seg=16, rings=10):
    P, I = [], []
    for a in range(rings + 1):
        th = math.pi * a / rings
        if a == 0: th = 0.03
        if a == rings: th = math.pi - 0.03
        for b in range(seg + 1):
            ph = 2 * math.pi * b / seg
            P += [round(math.sin(th) * math.cos(ph), 4), round(math.cos(th), 4), round(math.sin(th) * math.sin(ph), 4)]
    for a in range(rings):
        for b in range(seg):
            p = a * (seg + 1) + b
            I += [p, p + 1, p + seg + 1, p + 1, p + seg + 2, p + seg + 1]
    return P, I
def cylinder(r, h, seg=36):
    P, N, I = [], [], []
    for y in (0, h):
        for b in range(seg + 1):
            ph = 2 * math.pi * b / seg; c, s = math.cos(ph), math.sin(ph)
            P += [round(r * c, 3), y, round(r * s, 3)]; N += [round(c, 3), 0, round(s, 3)]
    for b in range(seg): I += [b, b + seg + 1, b + 1, b + 1, b + seg + 1, b + seg + 2]
    Q, J = [0, h, 0], []
    for b in range(seg + 1):
        ph = 2 * math.pi * b / seg; Q += [round(r * math.cos(ph), 3), h, round(r * math.sin(ph), 3)]
    for b in range(seg): J += [0, 2 + b, 1 + b]
    return P, N, I, Q, J
def disc(r, seg):
    P, I = [0, 0, 0], []
    for b in range(seg + 1):
        ph = 2 * math.pi * b / seg; P += [round(r * math.cos(ph), 3), 0, round(r * math.sin(ph), 3)]
    for b in range(seg): I += [0, b + 2, b + 1]
    return P, I

