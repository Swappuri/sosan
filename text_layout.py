"""Shape-aware wrapping used by the optional Python exporter."""
import math


def text_half_width(shape, radius, y):
    if shape == 'square':
        return radius / math.sqrt(2) if abs(y) <= radius / math.sqrt(2) else 0
    if shape == 'triangle':
        return (y + radius) / math.sqrt(3) if -radius <= y <= radius / 2 else 0
    return math.sqrt(max(0, radius * radius - y * y)) if abs(y) <= radius else 0


def layout_text(text, shape, radius, requested_size, measure):
    words = text.split()
    if not words:
        return {'fontSize': requested_size, 'lines': []}
    center_y = radius / 8 if shape == 'triangle' else 0
    height = radius * (1.5 if shape == 'triangle' else math.sqrt(2) if shape == 'square' else 2)

    def attempt(size):
        line_height = size * 1.2
        for count in range(1, min(len(text), math.floor(height / line_height)) + 1):
            remaining, lines, valid = words.copy(), [], True
            for row in range(count):
                if not remaining:
                    break
                y = center_y + (row - (count - 1) / 2) * line_height
                width = 2 * min(text_half_width(shape, radius, y - line_height / 2), text_half_width(shape, radius, y + line_height / 2))
                if width <= 0:
                    valid = False
                    break
                line = ''
                while remaining:
                    word = remaining[0]
                    candidate = f'{line} {word}' if line else word
                    if measure(candidate, size) <= width:
                        line = candidate
                        remaining.pop(0)
                        continue
                    if line:
                        break
                    prefix, characters = '', list(word)
                    while characters and measure(prefix + characters[0], size) <= width:
                        prefix += characters.pop(0)
                    if not prefix:
                        valid = False
                        break
                    line = prefix
                    if characters:
                        remaining[0] = ''.join(characters)
                    else:
                        remaining.pop(0)
                    break
                if not valid:
                    break
                lines.append({'text': line, 'y': y, 'width': width})
            if valid and not remaining:
                return {'fontSize': size, 'lines': lines, 'lineHeight': line_height}
        return None

    requested = attempt(requested_size)
    if requested:
        return requested
    low, high = min(1, requested_size), requested_size
    best = attempt(low)
    for _ in range(12):
        size = (low + high) / 2
        result = attempt(size)
        if result:
            low, best = size, result
        else:
            high = size
    return best or {'fontSize': low, 'lines': []}
