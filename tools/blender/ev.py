"""Compact EV crossover: smooth, grille-less front with a light bar, and a glass roof (V-2)."""

from common import Car, Shape, box, finish


def light_bar(car):
    x = car.body_len / 2
    w = 2 * (car.half_w - car.s.nose_radius) - 0.06
    box(car.rest, (0.06, w, 0.045), (x + 0.005, 0, car.top(x - 0.05) - 0.05), 'lightbar', car.d.box_bevel)


def shape(spec):
    return Shape(
        length=spec['length'],
        width=spec['width'],
        clearance=0.24,
        wheel=0.38,
        body_keys=[(0.5, 0.66), (0.44, 0.82), (0.24, 0.9), (-0.4, 0.94), (-0.5, 0.84)],
        glass=(0.25, 0.06, -0.22, -0.41),
        roof=1.43,
        nose_radius=0.42,
        pillars=(-0.08,),
        roof_colour='glass',
        grille=False,
        door_lines=(0.2, -0.08, -0.22),
        extras=[light_bar],
    )


def build(spec, lod):
    return finish(Car(shape(spec), lod).build(), f'LOD{lod}')
