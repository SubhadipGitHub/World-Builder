"""Mid-size sedan: a low three-box saloon (V-2)."""

from common import Car, Shape, finish


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.24,
        wheel=0.34,
        body_keys=[(0.5, 0.62), (0.44, 0.76), (0.2, 0.84), (-0.3, 0.86), (-0.46, 0.82), (-0.5, 0.7)],
        glass=(0.21, 0.05, -0.17, -0.31),
        roof=1.3,
        pillars=(-0.05,),
        door_lines=(0.19, -0.04, -0.2),
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
