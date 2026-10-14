"""Full-size SUV: tall and boxy, with roof rails (V-2)."""

from common import Car, Shape, box, finish


def roof_rails(car):
    r0, r1 = car.xa(car.s.glass[1]), car.xa(car.s.glass[2])
    length = (r0 - r1) * 0.86
    x = (r0 + r1) / 2
    y = (car.plan_half_width(0) - 0.06) * car.s.tumble - 0.12
    z = car.roof_z(x, y) + 0.03
    for side in (1, -1):
        box(car.rest, (length, 0.06, 0.05), (x, side * y, z), 'rail', car.d.box_bevel)


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.32,
        wheel=0.42,
        body_keys=[(0.5, 0.84), (0.45, 1.0), (0.25, 1.06), (-0.46, 1.1), (-0.5, 1.0)],
        glass=(0.26, 0.11, -0.43, -0.48),
        roof=1.7,
        exponent=4.5,
        glass_exponent=3.5,
        tumble=0.88,
        nose_radius=0.3,
        tail_radius=0.22,
        pillars=(-0.08, -0.28),
        rear_side='glass',
        door_lines=(0.22, -0.07, -0.24),
        extras=[roof_rails],
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
