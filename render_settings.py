"""Validated studio controls shared by the HTTP API and renderer."""
import math

DEFAULTS = {
    'primary': '#59ff9b', 'secondary': '#59ff9b', 'background': '#0b1114', 'innerFill': '#0b1114', 'innerRing': True,
    'textColor': '#eeeff2', 'textSize': 100, 'textFont': 'poppins',
    'radius': 115, 'sensitivity': 1.2, 'bars': 128, 'rotation': 90, 'smoothing': 0, 'style': 'bars', 'shape': 'circle',
    'logoFit': 'cover', 'logoZoom': 100, 'logoX': 0, 'logoY': 0,
    'glow': True, 'particles': True, 'pulse': True, 'flashes': True,
    'width': 1280, 'height': 720, 'fps': 30, 'title': '',
}


def validate_settings(value):
    """Accept only the controls exposed by the studio, never file paths or commands."""
    import re
    if not isinstance(value, dict):
        raise ValueError('Settings must be an object.')
    result = {**DEFAULTS, **{key: val for key, val in value.items() if key in DEFAULTS}}
    for name in ('primary', 'secondary', 'innerFill', 'background', 'textColor'):
        if not isinstance(result[name], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', result[name]):
            raise ValueError(f'Invalid {name} color.')
    for name, minimum, maximum in [('textSize', 50, 200), ('radius', 55, 140), ('sensitivity', .3, 2.5), ('rotation', 0, 180), ('smoothing', 0, 100), ('logoZoom', 50, 200), ('logoX', -100, 100), ('logoY', -100, 100)]:
        number = result[name]
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not minimum <= number <= maximum:
            raise ValueError(f'Invalid {name}.')
    if type(result['bars']) is not int or result['bars'] not in range(32, 193, 16):
        raise ValueError('Invalid spectrum bar count.')
    if result['textFont'] not in ('roboto', 'opensans', 'lora', 'nunito', 'raleway', 'oswald', 'playfair', 'merriweather', 'rubik', 'bebas', 'poppins', 'inter', 'montserrat', 'lato', 'tektur', 'sans', 'serif', 'mono'):
        raise ValueError('Invalid text font.')
    if result['logoFit'] not in ('contain', 'cover'):
        raise ValueError('Invalid logo fit.')
    if result['shape'] not in ('circle', 'square', 'triangle'):
        raise ValueError('Invalid shape.')
    if result['style'] not in ('bars', 'wave'):
        raise ValueError('Invalid spectrum style.')
    for name in ('glow', 'particles', 'pulse', 'flashes', 'innerRing'):
        if type(result[name]) is not bool:
            raise ValueError(f'Invalid {name} switch.')
    if type(result['width']) is not int or type(result['height']) is not int or (result['width'], result['height']) not in [(640, 360), (854, 480), (1280, 720), (1920, 1080), (2560, 1440), (3840, 2160)]:
        raise ValueError('Invalid export resolution.')
    if type(result['fps']) is not int or result['fps'] not in (15, 24, 25, 30, 50, 60, 120):
        raise ValueError('Invalid frame rate.')
    if not isinstance(result['title'], str) or len(result['title']) > 50:
        raise ValueError('Display name must be 50 characters or fewer.')
    result['title'] = result['title'].strip()
    return result


