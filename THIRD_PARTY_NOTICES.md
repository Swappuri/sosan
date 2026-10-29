# Third-party notices

## Tektur

The bundled Tektur variable font in `studio/fonts/Tektur.ttf` is from
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/tektur).
It is distributed under the SIL Open Font License 1.1. The complete copyright
notice and license are preserved in [studio/fonts/OFL.txt](studio/fonts/OFL.txt).
The application's MIT license does not replace the font's license.

## Runtime dependencies

Python dependencies are installed separately from `requirements.txt` and retain
their respective licenses. FFmpeg is an external prerequisite and is not bundled
with this repository.

## Browser export libraries

The GitHub Pages build bundles Mediabunny and its AAC encoder extension, pinned
in `package-lock.json`. Both are licensed under MPL-2.0. Their full license texts
are included in the deployed `licenses/` directory. Source code and the AAC
encoder's FFmpeg implementation notices are available in the upstream repository:
https://github.com/Vanilagy/mediabunny

These dependencies are used unmodified. Application source remains MIT licensed.
