"""Validated studio controls shared by the HTTP API and renderer."""
import math

DEFAULTS = {
    'primary': '#a7f36b', 'secondary': '#5de5ec', 'background': '#0b1114',
    'radius': 115, 'sensitivity': 1.2, 'bars': 128, 'rotation': 0, 'smoothing': 50,
    'glow': True, 'particles': True, 'pulse': True, 'flashes': False,
    'width': 1280, 'height': 720, 'fps': 30, 'title': '',
}


def validate_settings(value):
    """Accept only the controls exposed by the studio, never file paths or commands."""
    import re
    if not isinstance(value, dict):
        raise ValueError('Settings must be an object.')
    result = {**DEFAULTS, **{key: val for key, val in value.items() if key in DEFAULTS}}
    for name in ('primary', 'secondary', 'background'):
        if not isinstance(result[name], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', result[name]):
            raise ValueError(f'Invalid {name} color.')
    for name, minimum, maximum in [('radius', 55, 140), ('sensitivity', .3, 2.5), ('rotation', 0, 180), ('smoothing', 0, 100)]:
        number = result[name]
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not minimum <= number <= maximum:
            raise ValueError(f'Invalid {name}.')
    if type(result['bars']) is not int or result['bars'] not in range(32, 193, 16):
        raise ValueError('Invalid spectrum bar count.')
    for name in ('glow', 'particles', 'pulse', 'flashes'):
        if type(result[name]) is not bool:
            raise ValueError(f'Invalid {name} switch.')
    if type(result['width']) is not int or type(result['height']) is not int or (result['width'], result['height']) not in [(854, 480), (1280, 720), (1920, 1080)]:
        raise ValueError('Invalid export resolution.')
    if type(result['fps']) is not int or result['fps'] not in (30, 60):
        raise ValueError('Invalid frame rate.')
    if not isinstance(result['title'], str) or len(result['title']) > 50:
        raise ValueError('Display name must be 50 characters or fewer.')
    result['title'] = result['title'].strip()
    return result


