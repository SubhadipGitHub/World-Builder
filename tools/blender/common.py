"""Shared building blocks for the M10 fleet car models (requirements §15, architecture §23).

Frame (BM-4): metres, Blender +X forward, +Z up, width along Y, centred on the footprint, wheels on z = 0.
The glTF exporter turns +Z up into +Y up, so the app sees +X forward and +Y up, as the procedural cars.

Every face carries a colour id (`cid`, a face attribute) that also fixes its material slot (BM-6):
paint (white, tinted per car), trim (everything untinted, including the glass and livery sentinels), lamps.
"""

import math
from dataclasses import dataclass, field

import bmesh
import bpy
from mathutils import Vector

# sRGB colours by id. The two sentinels are replaced at decode time (M10-3).
COLOURS = {
    'paint': '#FFFFFF',
    'glass': '#FF00FF',
    'livery': '#00FFFF',
    'tyre': '#1C1D22',
    'hub': '#C9CDD4',
    'bumper': '#3A3D45',
    'liner': '#2A2D33',
    'chrome': '#E6E9EE',
    'rail': '#8D939E',
    'head': '#FFF3C4',
    'tail': '#E0262B',
    'lightbar': '#E8F6FF',
}
COLOUR_IDS = list(COLOURS)
SLOTS = ('paint', 'trim', 'lamps')
LAMP_COLOURS = {'head', 'tail', 'lightbar'}


def slot_of(colour):
    if colour == 'paint':
        return 0
    return 2 if colour in LAMP_COLOURS else 1


TRIANGLE_BUDGET = {0: 6000, 1: 1500}


@dataclass(frozen=True)
class Detail:
    """Resolution per LOD (BM-8, BM-11)."""
    body_ring: int
    body_sections: int
    glass_arc: int
    glass_sections: int
    wheel_segs: int
    arch_segs: int
    box_bevel: int
    sweep_path: int
    panel_lines: bool


DETAIL = {
    0: Detail(body_ring=28, body_sections=34, glass_arc=10, glass_sections=22, wheel_segs=20, arch_segs=20, box_bevel=1, sweep_path=14, panel_lines=True),
    1: Detail(body_ring=12, body_sections=12, glass_arc=6, glass_sections=0, wheel_segs=8, arch_segs=8, box_bevel=0, sweep_path=6, panel_lines=False),
}


@dataclass
class Shape:
    """One class's proportions. x fractions run from +0.5 (front) to -0.5 (rear) of the body length."""
    length: float
    width: float
    clearance: float
    wheel: float
    body_keys: list  # [(x fraction, top z)] from front to rear
    glass: tuple  # (g0, r0, r1, g1): windscreen base, roof front, roof rear, rear base (x fractions)
    roof: float  # roof height (m)
    exponent: float = 3.2  # body section roundness (higher = boxier)
    glass_exponent: float = 2.6
    tumble: float = 0.80  # roof width / glasshouse base width
    nose_radius: float = 0.38
    tail_radius: float = 0.32
    wheel_inset: float = 0.2  # wheel centre from each end, as a fraction of the length
    pillars: tuple = ()  # B- (and C-/D-) pillar x fractions inside the roof
    rear_side: str = 'paint'  # side faces behind the roof: 'paint' (C-pillar) or 'glass'
    roof_colour: str = 'paint'
    grille: bool = True
    door_lines: tuple = ()  # x fractions of vertical door seams
    extras: list = field(default_factory=list)  # callables (car) -> None


def smoothstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def interp(keys, x):
    """Smooth interpolation through (x, value) keys sorted by decreasing x."""
    if x >= keys[0][0]:
        return keys[0][1]
    for (x0, v0), (x1, v1) in zip(keys, keys[1:]):
        if x1 <= x <= x0:
            t = (x0 - x) / (x0 - x1) if x0 != x1 else 0.0
            return v0 + (v1 - v0) * smoothstep(t)
    return keys[-1][1]


def sgnpow(v, p):
    return math.copysign(abs(v) ** p, v)


def hex_srgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


class Part:
    """Polygons with a colour id each, oriented outward at creation."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.cids = []

    def vert(self, v):
        self.verts.append((float(v[0]), float(v[1]), float(v[2])))
        return len(self.verts) - 1

    def face(self, idx, colour, outward=None):
        idx = list(idx)
        if outward is not None:
            n = Vector((0.0, 0.0, 0.0))
            pts = [Vector(self.verts[i]) for i in idx]
            for a, b in zip(pts, pts[1:] + pts[:1]):
                n.x += (a.y - b.y) * (a.z + b.z)
                n.y += (a.z - b.z) * (a.x + b.x)
                n.z += (a.x - b.x) * (a.y + b.y)
            if n.dot(Vector(outward)) < 0:
                idx.reverse()
        self.faces.append(tuple(idx))
        self.cids.append(COLOUR_IDS.index(colour))

    def centre(self, idx):
        c = Vector((0.0, 0.0, 0.0))
        for i in idx:
            c += Vector(self.verts[i])
        return c / len(idx)

    def to_mesh(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        for mat in materials():
            me.materials.append(mat)
        me.attributes.new('cid', 'INT', 'FACE').data.foreach_set('value', self.cids)
        me.polygons.foreach_set('material_index', [slot_of(COLOUR_IDS[c]) for c in self.cids])
        me.validate()
        me.update()
        return me


def materials():
    out = []
    for name in SLOTS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        out.append(mat)
    return out


# ---------------------------------------------------------------- primitives


def loft(part, rings, colour_fn, axis_fn, caps=True, cap_colour='paint'):
    """Joins closed rings (equal length lists of points) into a tube. colour_fn(i, j) colours the quad between
    ring i and i + 1, edge j; axis_fn(i) gives the section centre used to orient faces outward."""
    idx = [[part.vert(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(n):
            q = (idx[i][j], idx[i][(j + 1) % n], idx[i + 1][(j + 1) % n], idx[i + 1][j])
            c = part.centre(q)
            a = (axis_fn(i) + axis_fn(i + 1)) / 2
            part.face(q, colour_fn(i, j), c - a)
    if caps:
        mid = [sum(ring, Vector((0, 0, 0))) / len(ring) for ring in (rings[0], rings[1], rings[-2], rings[-1])]
        part.face(idx[0], cap_colour, mid[0] - mid[1])
        part.face(idx[-1], cap_colour, mid[3] - mid[2])


def box(part, size, centre, colour, bevel=1):
    """A box, chamfered (bevel 1) or plain (bevel 0)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        r = min(size) * 0.28
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=bevel, profile=0.5, affect='EDGES')
    base = len(part.verts)
    for v in bm.verts:
        part.vert(v.co + Vector(centre))
    for f in bm.faces:
        idx = [base + v.index for v in f.verts]
        part.face(idx, colour, part.centre(idx) - Vector(centre))
    bm.free()


def lathe(part, profile, segs, cx, cz, y0, side, colours, outward_from):
    """Revolves (radius, dy) points around an axis parallel to Y through (cx, ·, cz). dy is measured outward
    (towards `side`); colours[k] colours the band between profile points k and k + 1."""
    rings = []
    for r, dy in profile:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            ring.append(part.vert((cx + r * math.cos(a), y0 + side * dy, cz + r * math.sin(a))))
        rings.append((r, ring))
    for k in range(len(rings) - 1):
        (ra, a), (rb, b) = rings[k], rings[k + 1]
        for s in range(segs):
            t = (s + 1) % segs
            if ra == 0:
                q = (a[0], b[s], b[t])
            elif rb == 0:
                q = (a[s], a[t], b[0])
            else:
                q = (a[s], a[t], b[t], b[s])
            part.face(q, colours[k], part.centre(q) - Vector(outward_from))


def strip(part, points_fn, n, colour, outward):
    """A ribbon: points_fn(t) -> (bottom, top) points for t in 0..1, with n segments."""
    prev = None
    for k in range(n + 1):
        lo, hi = points_fn(k / n)
        cur = (part.vert(lo), part.vert(hi))
        if prev:
            part.face((prev[0], cur[0], cur[1], prev[1]), colour, outward)
        prev = cur


# ---------------------------------------------------------------- the car


class Car:
    """Builds one LOD of a class from its Shape."""

    def __init__(self, shape, lod):
        self.s = shape
        self.lod = lod
        self.d = DETAIL[lod]
        s = shape
        self.body_len = s.length - 0.12  # bumpers add 0.06 at each end
        self.half_w = s.width / 2 - 0.04  # mirrors reach the full width
        self.wheel_x = s.length / 2 - s.wheel_inset * s.length
        self.tyre_w = min(0.28, s.width * 0.14)
        self.tyre_y = s.width / 2 - 0.05 - self.tyre_w / 2
        self.arch_r = s.wheel + 0.06
        self.body = Part()  # cut by the wheel arches (and the pickup bed)
        self.cutters = Part()
        self.rest = Part()

    # -- body geometry ------------------------------------------------------
    def xa(self, frac):
        return frac * self.body_len

    def plan_half_width(self, x):
        r = self.s.nose_radius if x > 0 else self.s.tail_radius
        a = self.body_len / 2 - r
        d = abs(x)
        if d <= a:
            return self.half_w
        return self.half_w - r + math.sqrt(max(r * r - (d - a) ** 2, 0.0))

    def top(self, x):
        return interp([(self.xa(f), z) for f, z in self.s.body_keys], x)

    def bottom(self, x):
        end = max(0.0, (abs(x) - (self.body_len / 2 - 0.45)) / 0.45)
        return self.s.clearance + 0.08 * smoothstep(end)

    def section(self, x):
        """(half width, centre z, half height) of the body at x."""
        lo, hi = self.bottom(x), self.top(x)
        return self.plan_half_width(x), (lo + hi) / 2, (hi - lo) / 2

    def surface_y(self, x, z, outset=0.0):
        w, zc, h = self.section(x)
        v = min(0.999, abs(z - zc) / h)
        n = self.s.exponent
        return w * (1 - v ** n) ** (1 / n) + outset

    def front_x(self, y):
        """The body's front (or, for negative results, use rear_x) surface x at half-width y, in plan."""
        r = self.s.nose_radius
        if y <= self.half_w - r:
            return self.body_len / 2
        return self.body_len / 2 - r + math.sqrt(max(r * r - (y - (self.half_w - r)) ** 2, 0.0))

    def rear_x(self, y):
        r = self.s.tail_radius
        if y <= self.half_w - r:
            return -self.body_len / 2
        return -(self.body_len / 2 - r + math.sqrt(max(r * r - (y - (self.half_w - r)) ** 2, 0.0)))

    # -- parts ---------------------------------------------------------------
    def build(self):
        self.build_body()
        self.build_glass()
        self.build_wheels()
        self.build_bumpers()
        self.build_lights()
        self.build_mirrors()
        self.build_livery()
        if self.d.panel_lines:
            self.build_panel_lines()
        for extra in self.s.extras:
            extra(self)
        return self

    def build_body(self):
        n = self.d.body_ring
        m = self.d.body_sections
        xs = []
        for i in range(m + 1):
            t = i / m
            xs.append(self.body_len / 2 * (0.55 * math.cos(math.pi * t) + 0.45 * (1 - 2 * t)))
        e = 2 / self.s.exponent
        rings, axes = [], []
        for x in xs:
            w, zc, h = self.section(x)
            ring = []
            for j in range(n):
                a = 2 * math.pi * j / n
                ring.append(Vector((x, w * sgnpow(math.cos(a), e), zc + h * sgnpow(math.sin(a), e))))
            rings.append(ring)
            axes.append(Vector((x, 0, zc)))
        loft(self.body, rings, lambda i, j: 'paint', lambda i: axes[i])
        # Wheel-arch cutters: one cylinder per wheel, from inside the tyre to beyond the body side.
        segs = self.d.arch_segs
        inner = self.tyre_y - self.tyre_w / 2 - 0.05
        for wx in (self.wheel_x, -self.wheel_x):
            for side in (1, -1):
                lathe(self.cutters, [(0, 0), (self.arch_r, 0), (self.arch_r, 1.0), (0, 1.0)], segs,
                      wx, self.s.wheel, side * inner, side, ['liner'] * 3, (wx, side * (inner + 0.5), self.s.wheel))

    def glass_top(self, x):
        g0, r0, r1, g1 = (self.xa(f) for f in self.s.glass)
        base = self.top(x)
        roof = self.s.roof
        if x >= r0:
            t = (g0 - x) / (g0 - r0)
            return base + (roof - base) * (1 - (1 - t) ** 1.6)
        if x <= r1:
            t = (x - g1) / (r1 - g1)
            return base + (roof - base) * (1 - (1 - t) ** 1.8)
        mid = (r0 + r1) / 2
        half = (r0 - r1) / 2
        return roof - 0.025 * ((x - mid) / half) ** 2

    def roof_z(self, x, y):
        """Height of the glasshouse's upper surface at (x, |y|), from its section arc."""
        zb = self.top(x) - 0.03
        h = max(0.012, self.glass_top(x) - zb)
        wb = self.plan_half_width(x) - 0.06
        e = 2 / self.s.glass_exponent
        best = None
        for j in range(181):
            a = math.pi / 2 * j / 180
            s = sgnpow(math.sin(a), e)
            yy = wb * sgnpow(math.cos(a), e) * (1 - (1 - self.s.tumble) * s)
            if best is None or abs(yy - abs(y)) < best[0]:
                best = (abs(yy - abs(y)), zb + h * s)
        return best[1]

    def build_glass(self):
        g0, r0, r1, g1 = (self.xa(f) for f in self.s.glass)
        frame = 0.05
        breaks = {g0, r0, r1, g1, r0 - frame, r1 + frame}
        for p in self.s.pillars:
            px = self.xa(p)
            breaks |= {px - 0.05, px + 0.05}
        xs = set(breaks)
        if self.d.glass_sections:
            for i in range(self.d.glass_sections + 1):
                xs.add(g0 + (g1 - g0) * i / self.d.glass_sections)
        else:
            xs |= {(g0 + r0) / 2, (r1 + g1) / 2}
        xs = sorted((x for x in xs if g1 <= x <= g0), reverse=True)
        k = self.d.glass_arc
        e = 2 / self.s.glass_exponent
        rings, axes = [], []
        for x in xs:
            zb = self.top(x) - 0.03
            h = max(0.012, self.glass_top(x) - zb)
            wb = self.plan_half_width(x) - 0.06
            ring = []
            for j in range(k + 1):
                a = math.pi * j / k
                s = sgnpow(math.sin(a), e)
                ring.append(Vector((x, wb * sgnpow(math.cos(a), e) * (1 - (1 - self.s.tumble) * s), zb + h * s)))
            rings.append(ring)
            axes.append(Vector((x, 0, zb)))

        pillars = [self.xa(p) for p in self.s.pillars]

        def colour(i, j):
            if j == k:  # the hidden underside edge
                return 'paint'
            xc = (xs[i] + xs[i + 1]) / 2
            ac = math.degrees(math.pi * (j + 0.5) / k)
            top = 40 < ac < 140
            if top:
                if r1 <= xc <= r0:
                    return self.s.roof_colour
                return 'glass'
            if xc > r0:
                return 'paint'  # A-pillar
            if xc < r1:
                return self.s.rear_side
            if xc > r0 - frame or xc < r1 + frame or any(abs(xc - p) < 0.05 for p in pillars):
                return 'paint'
            return 'glass'

        loft(self.rest, rings, colour, lambda i: axes[i])

    def build_wheels(self):
        segs = self.d.wheel_segs
        r = self.s.wheel
        hw = self.tyre_w / 2
        if self.lod == 0:
            tyre = [(0.62 * r, hw), (0.9 * r, hw), (r, hw - 0.05), (r, -hw + 0.05), (0.9 * r, -hw), (0.62 * r, -hw)]
            tyre_c = ['tyre'] * 5
            hub = [(0, hw + 0.014), (0.22 * r, hw + 0.014), (0.5 * r, hw + 0.006), (0.62 * r, hw)]
            hub_c = ['chrome', 'hub', 'hub']
        else:
            tyre = [(0.6 * r, hw), (r, hw - 0.03), (r, -hw + 0.03), (0.6 * r, -hw)]
            tyre_c = ['tyre'] * 3
            hub = [(0, hw + 0.01), (0.6 * r, hw)]
            hub_c = ['hub']
        for wx in (self.wheel_x, -self.wheel_x):
            for side in (1, -1):
                y0 = side * self.tyre_y
                centre = (wx, y0, r)
                lathe(self.rest, tyre, segs, wx, r, y0, side, tyre_c, centre)
                lathe(self.rest, hub, segs, wx, r, y0, side, hub_c, (wx, y0 - side * 0.5, r))

    def build_bumpers(self):
        """Bumpers swept around the plan outline of each end, flush with the footprint's ends."""
        n = self.d.sweep_path
        h_lo, h_hi = self.s.clearance - 0.02, self.s.clearance + 0.22
        prof = [(0.0, h_lo + 0.03), (0.035, h_lo), (0.06, h_lo + 0.04), (0.06, h_hi - 0.04), (0.035, h_hi), (0.0, h_hi - 0.02)]
        if self.lod == 1:
            prof = [(0.0, h_lo), (0.06, h_lo + 0.02), (0.06, h_hi - 0.02), (0.0, h_hi)]
        half = max(1, n // 2)
        for end in (1, -1):
            r = self.s.nose_radius if end > 0 else self.s.tail_radius
            a = self.body_len / 2 - r
            # Round the left corner (side to end), across the straight end, then round the right corner.
            path = [(math.pi / 2 * (1 - k / half), 1) for k in range(half + 1)]
            path += [(-math.pi / 2 * k / half, -1) for k in range(half + 1)]
            rings, axes = [], []
            for th, corner in path:
                cx = end * (a + r * math.cos(th))
                cy = corner * (self.half_w - r) + r * math.sin(th)
                nx, ny = end * math.cos(th), math.sin(th)
                taper = 0.35 + 0.65 * math.cos(th)  # thinner where it wraps round the sides
                rings.append([Vector((cx + nx * (out * taper - 0.02), cy + ny * (out * taper - 0.02), z)) for out, z in prof])
                axes.append(Vector((cx - nx * 0.3, cy - ny * 0.3, (h_lo + h_hi) / 2)))
            loft(self.rest, rings, lambda i, j: 'bumper', lambda i: axes[i], caps=True, cap_colour='bumper')

    def build_lights(self):
        s = self.s
        lod0 = self.lod == 0
        bev = self.d.box_bevel
        for side in (1, -1):
            y = self.half_w - s.nose_radius * 0.55 - 0.12
            xf = self.front_x(abs(y))
            zf = self.top(xf - 0.05) - 0.13
            box(self.rest, (0.1, 0.32, 0.12), (xf - 0.03, side * y, zf), 'head', bev)
            yr = self.half_w - s.tail_radius * 0.5 - 0.14
            xr = self.rear_x(abs(yr))
            zr = self.top(xr + 0.05) - 0.12
            box(self.rest, (0.1, 0.38, 0.12), (xr + 0.03, side * yr, zr), 'tail', bev)
        if s.grille:
            gx = self.body_len / 2
            gz = self.top(gx - 0.05) - 0.26
            box(self.rest, (0.06, 2 * (self.half_w - s.nose_radius) - 0.1, 0.14), (gx + 0.005, 0, gz), 'liner', bev)
            if lod0:
                box(self.rest, (0.04, 2 * (self.half_w - s.nose_radius) - 0.16, 0.025), (gx + 0.03, 0, gz + 0.02), 'chrome', 0)

    def build_mirrors(self):
        g0, r0 = self.xa(self.s.glass[0]), self.xa(self.s.glass[1])
        x = r0 + 0.3 * (g0 - r0)
        z = self.top(x) + 0.07
        for side in (1, -1):
            y_out = self.s.width / 2 - 0.005
            box(self.rest, (0.16, 0.18, 0.12), (x, side * (y_out - 0.09), z), 'paint', self.d.box_bevel)
            box(self.rest, (0.06, 0.16, 0.04), (x + 0.02, side * (y_out - 0.24), z - 0.04), 'bumper', 0)

    def body_strip(self, x0, x1, z0, z1, colour, n, outset=0.006):
        for side in (1, -1):
            def pts(t, side=side):
                x = x0 + (x1 - x0) * t
                return ((x, side * self.surface_y(x, z0, outset), z0), (x, side * self.surface_y(x, z1, outset), z1))
            strip(self.rest, pts, n, colour, (0, side, 0))

    def build_livery(self):
        """GoldLane stripe along the doors, between the arches, and a small door mark (B-4)."""
        x0 = self.wheel_x - self.arch_r - 0.1
        x1 = -self.wheel_x + self.arch_r + 0.1
        zs = self.s.clearance + 0.48 * (self.top(0) - self.s.clearance)
        n = 10 if self.lod == 0 else 2
        self.body_strip(x0, x1, zs - 0.035, zs + 0.035, 'livery', n)
        mx = x0 - 0.25
        self.body_strip(mx, mx - 0.3, zs + 0.08, zs + 0.22, 'livery', 2 if self.lod == 0 else 1)

    def vertical_strip(self, x0, x1, z0, z1, colour, n, outset=0.004):
        """A ribbon running up the body side at x0..x1, following its curve."""
        for side in (1, -1):
            def pts(t, side=side):
                z = z0 + (z1 - z0) * t
                return ((x0, side * self.surface_y(x0, z, outset), z), (x1, side * self.surface_y(x1, z, outset), z))
            strip(self.rest, pts, n, colour, (0, side, 0))

    def build_panel_lines(self):
        """Door shut lines and handles (LOD0 only, BM-11)."""
        top = self.top(0) - 0.04
        for f in self.s.door_lines:
            x = self.xa(f)
            self.vertical_strip(x + 0.012, x - 0.012, self.s.clearance + 0.12, top, 'liner', 4)
            self.body_strip(x - 0.14, x - 0.26, top - 0.13, top - 0.1, 'chrome', 1, 0.008)


# ---------------------------------------------------------------- assembly


def apply_boolean(target_mesh, cutter_mesh, name):
    target = bpy.data.objects.new(name, target_mesh)
    cutter = bpy.data.objects.new(name + '_cut', cutter_mesh)
    bpy.context.scene.collection.objects.link(target)
    bpy.context.scene.collection.objects.link(cutter)
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.material_mode = 'TRANSFER'
    mod.object = cutter
    cutter.hide_render = True
    deps = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(target.evaluated_get(deps))
    bpy.data.objects.remove(target)
    bpy.data.objects.remove(cutter)
    return result


def finish(car, name):
    """Cuts the body, merges every part into one mesh with three slots and corner colours, and returns
    the object named `name` (LOD0 or LOD1) at the origin."""
    body = apply_boolean(car.body.to_mesh(name + '_body'), car.cutters.to_mesh(name + '_cutters'), name)
    bm = bmesh.new()
    bm.from_mesh(body)
    bm.from_mesh(car.rest.to_mesh(name + '_rest'))
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mat in materials():
        me.materials.append(mat)
    cids = [0] * len(me.polygons)
    me.attributes['cid'].data.foreach_get('value', cids)
    me.polygons.foreach_set('material_index', [slot_of(COLOUR_IDS[c]) for c in cids])
    col = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
    for poly, cid in zip(me.polygons, cids):
        rgba = hex_srgb(COLOURS[COLOUR_IDS[cid]])
        for li in poly.loop_indices:
            col.data[li].color_srgb = rgba
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['cid'])
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(38))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bounds(obj):
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))
