import unittest
from text_layout import layout_text, text_half_width

class TextLayoutTests(unittest.TestCase):
    def test_selected_size_wraps_before_shrinking(self):
        for shape in ('circle', 'square', 'triangle'):
            with self.subTest(shape=shape):
                result = layout_text('Sky full of stars', shape, 100, 24, lambda text, size: len(text) * size * .6)
                self.assertEqual(result['fontSize'], 24)
                self.assertGreater(len(result['lines']), 1)
                self.assertEqual(' '.join(line['text'] for line in result['lines']), 'Sky full of stars')

    def test_capacity_fallback_preserves_text_inside_all_shapes(self):
        text = 'On The Floor X Sky Full of Stars dsad dsa d sad ds'
        for shape in ('circle', 'square', 'triangle'):
            with self.subTest(shape=shape):
                result = layout_text(text, shape, 70, 84, lambda text, size: len(text) * size * .6)
                self.assertLess(result['fontSize'], 84)
                self.assertEqual(''.join(line['text'] for line in result['lines']).replace(' ', ''), text.replace(' ', ''))
                for line in result['lines']:
                    for y in (line['y'] - result['lineHeight'] / 2, line['y'] + result['lineHeight'] / 2):
                        self.assertLessEqual(len(line['text']) * result['fontSize'] * .6, 2 * text_half_width(shape, 70, y) + 1e-8)
