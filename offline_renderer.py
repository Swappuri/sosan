"""Deterministic, frame-by-frame rendering of the studio's design settings."""
from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

# Keep Numba's analysis cache outside the source checkout.
os.environ.setdefault('NUMBA_CACHE_DIR', str(Path(tempfile.gettempdir()) / 'sosan-numba'))

import cv2
import librosa
import numpy as np

from render_settings import DEFAULTS, validate_settings


def analyze_track(source, settings, checkpoint=lambda *_: None):
    """Sample a Blackman-window spectrum on the video clock, without playing audio."""
    fps, count, sr, fft_size = settings['fps'], settings['bars'] // 2, 48000, 8192
    y, _ = librosa.load(str(source), sr=sr, mono=True)
    if not len(y):
        raise ValueError('This audio file is empty.')
    duration = len(y) / sr
    frames = math.ceil(duration * fps)
    hop = sr // fps
    padded = np.pad(y, (fft_size // 2, fft_size // 2))
    hz_per_bin = sr / fft_size
    edges = np.geomspace(35, 14000, count + 1)
    ranges = [(max(1, int(a / hz_per_bin)), max(max(1, int(a / hz_per_bin)) + 1, math.ceil(b / hz_per_bin))) for a, b in zip(edges[:-1], edges[1:])]
    levels = np.zeros((frames, count), np.float32)
    bass = np.zeros(frames, np.float32)
    onsets = np.zeros(frames, np.float32)
    smoothed_spectrum = np.zeros(fft_size // 2 + 1)
    previous_bass = 0
    # Frame times, rather than wall time, drive every analysis and render operation.
    for first in range(0, frames, 128):
        checkpoint(first / frames)
        last = min(first + 128, frames)
        segment = padded[first * hop:(last - 1) * hop + fft_size]
        if len(segment) < (last - first - 1) * hop + fft_size:
            segment = np.pad(segment, (0, (last - first - 1) * hop + fft_size - len(segment)))
        magnitudes = np.abs(librosa.stft(segment, n_fft=fft_size, hop_length=hop, center=False, window='blackman')) / fft_size
        for offset in range(last - first):
            frame = first + offset
            smoothed_spectrum = .55 * smoothed_spectrum + .45 * magnitudes[:, offset]
            db = 20 * np.log10(np.maximum(smoothed_spectrum, 1e-12))
            spectrum = np.clip((db + 90) / 75, 0, 1)
            for index, (low, high) in enumerate(ranges):
                levels[frame, index] = 1 - math.exp(-1.5 * np.sqrt(np.mean(spectrum[low:high] ** 2)) * settings['sensitivity'])
            low = spectrum[math.ceil(35 / hz_per_bin):math.ceil(160 / hz_per_bin)]
            bass[frame] = max(0, float(np.mean(low)) - .15) * settings['sensitivity']
            onsets[frame] = min(1, max(0, bass[frame] - previous_bass) * 6)
            previous_bass = bass[frame]
    return levels, bass, onsets, duration


def smooth_spectrum(levels, smoothing=50):
    passes = (min(100, max(0, smoothing)) / 50) ** 2
    result = levels
    for step in range(math.ceil(passes)):
        filtered = np.convolve(np.pad(result, (2, 2), mode='edge'), np.array([1, 4, 6, 4, 1]) / 16, mode='valid')
        result = result + (filtered - result) * min(1, passes - step)
    return result


def shape_radius(shape, radius, angle):
    if shape == 'square':
        return radius / math.sqrt(2) / np.maximum(np.abs(np.cos(angle)), np.abs(np.sin(angle)))
    if shape == 'triangle':
        return radius * .5 / np.maximum.reduce([np.cos(angle - (-math.pi / 6 + i * math.tau / 3)) for i in range(3)])
    return radius


def perimeter_point(shape, radius, progress):
    if shape not in ('square', 'triangle'):
        angle = progress * math.tau - math.pi / 2
        nx, ny = math.cos(angle), math.sin(angle)
        return nx * radius, ny * radius, nx, ny
    sides, start = (4, -math.pi * .75) if shape == 'square' else (3, -math.pi / 2)
    distance = (progress * sides + (.5 if shape == 'square' else 0)) % sides
    edge, t = math.floor(distance), distance % 1
    a, b = start + edge * math.tau / sides, start + (edge + 1) * math.tau / sides
    ax, ay = math.cos(a) * radius, math.sin(a) * radius
    dx, dy = math.cos(b) * radius - ax, math.sin(b) * radius - ay
    length = math.hypot(dx, dy)
    return ax + dx * t, ay + dy * t, dy / length, -dx / length


def spectrum_point(shape, radius, progress, offset):
    if shape not in ('square', 'triangle'):
        return perimeter_point(shape, radius + offset, progress)
    sides, start = (4, -math.pi * .75) if shape == 'square' else (3, -math.pi / 2)
    turn = math.tau / sides
    edge_length, arc_length = 2 * radius * math.sin(math.pi / sides), offset * turn
    segment = edge_length + arc_length
    origin = arc_length + edge_length / 2 if shape == 'square' else arc_length / 2
    distance = (progress * sides * segment + origin) % (sides * segment)
    vertex = math.floor(distance / segment)
    local, angle = distance - vertex * segment, start + vertex * turn
    x, y = math.cos(angle) * radius, math.sin(angle) * radius
    if local < arc_length:
        normal = angle - turn / 2 + local / offset
    else:
        normal = angle + turn / 2
        t = (local - arc_length) / edge_length
        x += (math.cos(angle + turn) * radius - x) * t
        y += (math.sin(angle + turn) * radius - y) * t
    nx, ny = math.cos(normal), math.sin(normal)
    return x + nx * offset, y + ny * offset, nx, ny


def logo_placement(shape, radius, width, height, fit='cover', zoom=100, offset_x=0, offset_y=0):
    center_y = 0
    if fit == 'contain':
        if shape == 'triangle':
            factor = 1.5 * radius / (height + math.sqrt(3) * width / 2)
            center_y = radius / 2 - height * factor / 2
        elif shape == 'square':
            factor = min(math.sqrt(2) * radius / width, math.sqrt(2) * radius / height)
        else:
            factor = 2 * radius / math.hypot(width, height)
    else:
        box_width = radius * (math.sqrt(3) if shape == 'triangle' else math.sqrt(2) if shape == 'square' else 2)
        box_height = radius * (1.5 if shape == 'triangle' else math.sqrt(2) if shape == 'square' else 2)
        factor = max(box_width / width, box_height / height)
        center_y = -radius / 4 if shape == 'triangle' else 0
    w, h = width * factor * zoom / 100, height * factor * zoom / 100
    return radius * offset_x / 100 - w / 2, center_y + radius * offset_y / 100 - h / 2, w, h


def draw_shape(image, shape, center, radius, color, thickness):
    radius = max(1, radius)
    if shape == 'circle':
        cv2.circle(image, center, round(radius), color, thickness, cv2.LINE_AA)
        return
    sides, start = (4, -math.pi * .75) if shape == 'square' else (3, -math.pi / 2)
    points = np.array([[round(center[0] + math.cos(start + i * math.tau / sides) * radius), round(center[1] + math.sin(start + i * math.tau / sides) * radius)] for i in range(sides)], np.int32)
    if thickness < 0:
        cv2.fillPoly(image, [points], color, cv2.LINE_AA)
    else:
        cv2.polylines(image, [points], True, color, thickness, cv2.LINE_AA)


def bgr(color):
    return tuple(int(color[index:index + 2], 16) for index in (5, 3, 1))


class StudioRenderer:
    """Offline counterpart of the canvas: colors, geometry, effects, logo and title."""
    def __init__(self, settings, logo_path=None):
        self.settings = settings
        self.width, self.height = settings['width'], settings['height']
        self.scale = min(self.width / 854, self.height / 480)
        self.center = (self.width // 2, self.height // 2)
        self.primary, self.secondary = np.array(bgr(settings['primary'])), np.array(bgr(settings['secondary']))
        self.background = np.array(bgr(settings['background']))
        self.levels = np.zeros(settings['bars'] // 2)
        self.bass = self.flash = 0.
        yy, xx = np.ogrid[:self.height, :self.width]
        distance = np.sqrt((xx - self.center[0]) ** 2 + (yy - self.center[1]) ** 2) / (360 * self.scale)
        inner = np.clip(1 - distance / .55, 0, 1).astype(np.float32)
        outer = np.clip(1 - abs(distance - .55) / .55, 0, 1).astype(np.float32)
        self.base = np.clip(self.background + inner[:, :, None] * self.primary * .09 + outer[:, :, None] * self.secondary * .025, 0, 255).astype(np.uint8)
        self.flash_aura = inner[:, :, None] * self.primary * .1
        self.particles = []
        for i in range(100):
            self.particles.append(((math.sin(i * 127.1 + 3) * 43758.5453) % 1, (math.sin(i * 311.7 + 9) * 43758.5453) % 1, .6 + (math.sin(i * 41.9) * 43758.5453) % 1 * 1.4, i * 2.7))
        self.logo = None
        if logo_path:
            self.logo = cv2.imread(str(logo_path), cv2.IMREAD_UNCHANGED)
            if self.logo is None:
                raise ValueError('Could not decode the uploaded logo.')
            if self.logo.ndim == 2:
                self.logo = cv2.cvtColor(self.logo, cv2.COLOR_GRAY2BGRA)
            elif self.logo.shape[2] == 3:
                self.logo = cv2.cvtColor(self.logo, cv2.COLOR_BGR2BGRA)
        self.text = self._title_image() if self.logo is None and settings['title'] else None

    def _title_image(self):
        # Match the locally bundled UI font; retain system fallbacks for portability.
        from PIL import Image, ImageDraw, ImageFont
        font_path = next((str(path) for path in [
            Path(__file__).resolve().parent / 'studio' / 'fonts' / 'Tektur.ttf',
            Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
            Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
        ] if path.is_file()), None)
        size = max(12, round(21 * self.scale))
        font = ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default()
        title = self.settings['title']
        box = font.getbbox(title)
        image = Image.new('RGBA', (max(1, box[2] - box[0] + 4), max(1, box[3] - box[1] + 4)))
        ImageDraw.Draw(image).text((2 - box[0], 2 - box[1]), title, font=font, fill=(238, 239, 242, 255))
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGBA2BGRA)

    def _composite(self, image, asset, radius, is_logo):
        shape = self.settings['shape']
        if is_logo:
            clip_radius = radius
            s = self.settings
            px, py, w, h = logo_placement(shape, clip_radius, asset.shape[1], asset.shape[0], s['logoFit'], s['logoZoom'], s['logoX'], s['logoY'])
            # Warp only into the visible region, even for very wide/tall images at high zoom.
            x0, y0 = max(0, math.floor(self.center[0] - clip_radius)), max(0, math.floor(self.center[1] - clip_radius))
            x1, y1 = min(self.width, math.ceil(self.center[0] + clip_radius)), min(self.height, math.ceil(self.center[1] + clip_radius))
            transform = np.array([[w / asset.shape[1], 0, self.center[0] + px - x0], [0, h / asset.shape[0], self.center[1] + py - y0]], np.float64)
            resized = cv2.warpAffine(asset, transform, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR)
            yy, xx = np.ogrid[y0:y1, x0:x1]
            reach = shape_radius(shape, clip_radius, np.arctan2(yy - self.center[1], xx - self.center[0]))
            mask = ((xx - self.center[0]) ** 2 + (yy - self.center[1]) ** 2) <= reach ** 2
            alpha = resized[:, :, 3:4].astype(np.float32) / 255 * mask[:, :, None]
            image[y0:y1, x0:x1] = image[y0:y1, x0:x1] * (1 - alpha) + resized[:, :, :3] * alpha
            return
        content_radius = radius * (.5 if shape == 'triangle' else 1 / math.sqrt(2) if shape == 'square' else 1)
        size = content_radius * 1.55
        factor = min(1, size / asset.shape[1])
        w, h = max(1, round(asset.shape[1] * factor)), max(1, round(asset.shape[0] * factor))
        resized = cv2.resize(asset, (w, h), interpolation=cv2.INTER_AREA)
        x, y = self.center[0] - w // 2, self.center[1] - h // 2
        alpha = resized[:, :, 3:4].astype(np.float32) / 255
        image[y:y + h, x:x + w] = image[y:y + h, x:x + w] * (1 - alpha) + resized[:, :, :3] * alpha

    def frame(self, index, levels, bass, onset):
        s, scale, center = self.settings, self.scale, self.center
        dt = 1 / s['fps']
        self.levels += (levels - self.levels) * (1 - np.exp(-dt * np.where(levels > self.levels, 24, 8)))
        self.bass += (bass - self.bass) * (1 - math.exp(-dt * (22 if bass > self.bass else 6)))
        self.flash = max(self.flash * math.exp(-dt * 9), onset)
        image = np.clip(self.base + self.flash_aura * self.flash, 0, 255).astype(np.uint8) if s['flashes'] else self.base.copy()
        clock = index / s['fps']
        if s['particles']:
            for x, y, size, phase in self.particles:
                px = round((x + math.cos(phase) * clock * .003) % 1 * self.width)
                py = round((y - clock * .004 * size / 2) % 1 * self.height)
                alpha = .15 + .3 * (.5 + .5 * math.sin(clock * .8 + phase))
                color = tuple(int(c) for c in self.primary * alpha + self.background * (1 - alpha))
                cv2.circle(image, (px, py), max(1, round(size * scale)), color, -1, cv2.LINE_AA)
        radius = (s['radius'] + (min(1, self.bass) * 12 if s['pulse'] else 0)) * scale
        glow = np.zeros_like(image) if s['glow'] else None
        levels = smooth_spectrum(self.levels, s['smoothing'])
        wave = []
        count = max(512, s['bars']) if s['style'] == 'wave' else s['bars']
        for i in range(count):
            bands = s['bars'] // 2
            position = (i + .5) / count
            side_index = max(0, min(bands - 1, (position if position < .5 else 1 - position) * s['bars'] - .5))
            bass_position = s['rotation'] / 180 * (bands - 1)
            idx = abs(side_index - bass_position) / max(bass_position, bands - 1 - bass_position, 1) * (bands - 1)
            first = math.floor(idx)
            fraction = idx - first
            level = levels[first] * (1 - fraction) + levels[min(first + 1, bands - 1)] * fraction
            px, py, nx, ny = spectrum_point(s['shape'], radius, (i + .5) / count, 8 * scale)
            start = 0
            end = start + (3 + level ** 1.35 * 67) * scale
            a = (round(center[0] + px + nx * start), round(center[1] + py + ny * start))
            b = (round(center[0] + px + nx * end), round(center[1] + py + ny * end))
            ratio = idx / (s['bars'] / 2)
            color = tuple(int(c) for c in self.primary * (1 - ratio) + self.secondary * ratio)
            if s['style'] == 'wave':
                wave.append((np.array([center[0] + px + nx * end, center[1] + py + ny * end]), color))
                continue
            cv2.line(image, a, b, color, max(1, round(2.2 * scale)), cv2.LINE_AA)
            if glow is not None:
                cv2.line(glow, a, b, color, max(1, round(3 * scale)), cv2.LINE_AA)
        for i, (point, color) in enumerate(wave):
            previous, following = wave[(i - 1) % len(wave)][0], wave[(i + 1) % len(wave)][0]
            start, end = (previous + point) / 2, (point + following) / 2
            curve = np.array([np.rint((1 - t) ** 2 * start + 2 * (1 - t) * t * point + t ** 2 * end) for t in np.linspace(0, 1, 6)], np.int32)
            cv2.polylines(image, [curve], False, color, max(1, round(2.2 * scale)), cv2.LINE_AA)
            if glow is not None:
                cv2.polylines(glow, [curve], False, color, max(1, round(3 * scale)), cv2.LINE_AA)
        has_logo = self.logo is not None
        draw_shape(image, s['shape'], center, radius, bgr(s['innerFill']), -1)
        asset = self.logo if has_logo else self.text
        if asset is not None:
            self._composite(image, asset, radius, has_logo)
        primary = tuple(int(c) for c in self.primary)
        draw_shape(image, s['shape'], center, radius, primary, max(1, round(1.5 * scale)))
        if glow is not None:
            draw_shape(glow, s['shape'], center, radius, primary, max(1, round(3 * scale)))
            small = cv2.resize(glow, (self.width // 2, self.height // 2))
            small = cv2.GaussianBlur(small, (0, 0), 3 * scale)
            image = cv2.addWeighted(image, 1, cv2.resize(small, (self.width, self.height)), .8, 0)
        if s['innerRing']:
            rim = tuple(int(c) for c in self.secondary * .4 + self.background * .6)
            inset_radius = radius - 5 * scale / (.5 if s['shape'] == 'triangle' else 1 / math.sqrt(2) if s['shape'] == 'square' else 1)
            draw_shape(image, s['shape'], center, inset_radius, rim, max(1, round(scale)))
        return image
