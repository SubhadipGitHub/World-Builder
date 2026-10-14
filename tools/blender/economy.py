"""Economy hatchback: short two-box, the cabin running almost to a steep tail (FE-10)."""

from common import Car, Shape, finish


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.22,
        wheel=0.32,
        body_keys=[(0.5, 0.6), (0.44, 0.74), (0.22, 0.84), (-0.44, 0.88), (-0.5, 0.76)],
        glass=(0.23, 0.08, -0.36, -0.47),
        roof=1.38,
        nose_radius=0.36,
        tail_radius=0.24,
        pillars=(-0.08,),
        door_lines=(0.2, -0.07, -0.2),
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
