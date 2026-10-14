"""Crew-cab pickup: a four-door cab with an open bed and a tailgate (FE-10)."""

from common import Car, Shape, box, finish

BED_FRONT = -0.17


def open_bed(car):
    """Cuts the bed out of the rear deck; its floor clears the rear wheel arches. The cut faces are liner."""
    rear = -car.body_len / 2 + 0.1
    front = car.xa(BED_FRONT)
    floor = 2 * car.s.wheel + 0.09
    inner = car.half_w - 0.09
    box(car.cutters, (front - rear, 2 * inner, 2.0), ((front + rear) / 2, 0, floor + 1.0), 'liner', 0)
    # Tailgate seam across the rear face.
    w = 2 * (car.half_w - car.s.tail_radius) - 0.1
    box(car.rest, (0.012, w, 0.025), (-car.body_len / 2 - 0.004, 0, car.top(-car.body_len / 2) - 0.1), 'liner', 0)


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.32,
        wheel=0.42,
        body_keys=[(0.5, 0.84), (0.45, 1.0), (0.25, 1.08), (0.0, 1.1), (-0.5, 1.1)],
        glass=(0.22, 0.1, -0.1, -0.14),
        roof=1.69,
        exponent=4.2,
        glass_exponent=3.2,
        tumble=0.88,
        nose_radius=0.3,
        tail_radius=0.12,
        pillars=(0.0,),
        door_lines=(0.21, 0.0),
        extras=[open_bed],
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
