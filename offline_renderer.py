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
        size = (radius - 20 * self.scale) * 2 if is_logo else radius * 1.55
        factor = min(size / asset.shape[1], size / asset.shape[0]) if is_logo else min(1, size / asset.shape[1])
        w, h = max(1, round(asset.shape[1] * factor)), max(1, round(asset.shape[0] * factor))
        resized = cv2.resize(asset, (w, h), interpolation=cv2.INTER_AREA)
        x, y = self.center[0] - w // 2, self.center[1] - h // 2
        alpha = resized[:, :, 3:4].astype(np.float32) / 255
        if is_logo:
            yy, xx = np.ogrid[y:y + h, x:x + w]
            alpha *= (((xx - self.center[0]) ** 2 + (yy - self.center[1]) ** 2) < (radius - 16 * self.scale) ** 2)[:, :, None]
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
        for i in range(s['bars']):
            bands = s['bars'] // 2
            side_index = i if i < bands else s['bars'] - i - 1
            bass_position = s['rotation'] / 180 * (bands - 1)
            idx = abs(side_index - bass_position) / max(bass_position, bands - 1 - bass_position, 1) * (bands - 1)
            first = math.floor(idx)
            fraction = idx - first
            level = levels[first] * (1 - fraction) + levels[min(first + 1, bands - 1)] * fraction
            angle = (i + .5) / s['bars'] * math.tau - math.pi / 2
            start = radius + 8 * scale
            end = start + (3 + level ** 1.35 * 67) * scale
            a = (round(center[0] + math.cos(angle) * start), round(center[1] + math.sin(angle) * start))
            b = (round(center[0] + math.cos(angle) * end), round(center[1] + math.sin(angle) * end))
            ratio = idx / (s['bars'] / 2)
            color = tuple(int(c) for c in self.primary * (1 - ratio) + self.secondary * ratio)
            cv2.line(image, a, b, color, max(1, round(2.2 * scale)), cv2.LINE_AA)
            if glow is not None:
                cv2.line(glow, a, b, color, max(1, round(3 * scale)), cv2.LINE_AA)
        primary = tuple(int(c) for c in self.primary)
        cv2.circle(image, center, round(radius), primary, max(1, round(1.5 * scale)), cv2.LINE_AA)
        if glow is not None:
            cv2.circle(glow, center, round(radius), primary, max(1, round(3 * scale)), cv2.LINE_AA)
            small = cv2.resize(glow, (self.width // 2, self.height // 2))
            small = cv2.GaussianBlur(small, (0, 0), 3 * scale)
            image = cv2.addWeighted(image, 1, cv2.resize(small, (self.width, self.height)), .8, 0)
        rim = tuple(int(c) for c in self.secondary * .4 + self.background * .6)
        cv2.circle(image, center, max(1, round(radius - 5 * scale)), rim, max(1, round(scale)), cv2.LINE_AA)
        cv2.circle(image, center, max(1, round(radius - 9 * scale)), tuple(int(c) for c in self.background), -1, cv2.LINE_AA)
        asset = self.logo if self.logo is not None else self.text
        if asset is not None:
            self._composite(image, asset, radius, self.logo is not None)
        return image
