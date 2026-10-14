"""Premium saloon: long, low and sleek, with a bright chrome beltline (FE-10)."""

from common import Car, Shape, finish


def chrome_belt(car):
    z = car.top(0)
    x0, x1 = car.xa(car.s.glass[0]), car.xa(car.s.glass[3])
    car.body_strip(x0, x1, z - 0.075, z - 0.045, 'chrome', 10 if car.lod == 0 else 3, 0.008)


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.2,
        wheel=0.36,
        body_keys=[(0.5, 0.62), (0.44, 0.76), (0.3, 0.84), (0.14, 0.87), (-0.32, 0.89), (-0.46, 0.85), (-0.5, 0.72)],
        glass=(0.13, -0.04, -0.21, -0.35),
        roof=1.27,
        nose_radius=0.42,
        pillars=(-0.12,),
        door_lines=(0.18, -0.11, -0.22),
        extras=[chrome_belt],
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
