"""7-seat minivan: tall and rounded, with a long glasshouse and a sliding-door line (FE-10)."""

from common import Car, Shape, finish


def sliding_door(car):
    z = car.top(0)
    n = 6 if car.lod == 0 else 1
    car.body_strip(car.xa(-0.02), car.xa(-0.36), z - 0.08, z - 0.055, 'liner', n)
    if car.lod == 0:
        car.vertical_strip(car.xa(-0.3) + 0.012, car.xa(-0.3) - 0.012, car.s.clearance + 0.12, z - 0.05, 'liner', 4)


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.22,
        wheel=0.36,
        body_keys=[(0.5, 0.66), (0.45, 0.82), (0.33, 0.92), (-0.46, 0.96), (-0.5, 0.86)],
        glass=(0.36, 0.13, -0.44, -0.48),
        roof=1.84,
        exponent=3.6,
        glass_exponent=3.0,
        tumble=0.86,
        nose_radius=0.4,
        tail_radius=0.26,
        pillars=(0.0, -0.25),
        rear_side='glass',
        door_lines=(0.26, 0.0),
        extras=[sliding_door],
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
