export const TEXT_FONTS = {
  poppins: { family: 'Poppins', file: 'Poppins-Medium.ttf', weight: '600' },
  inter: { family: 'Inter', file: 'Inter.ttf', weight: '100 900' },
  montserrat: { family: 'Montserrat', file: 'Montserrat.ttf', weight: '100 900' },
  lato: { family: 'Lato', file: 'Lato.ttf', weight: '600' },
  tektur: { family: 'Tektur', file: 'Tektur.ttf', weight: '400 900' },
};
export const TEXT_FAMILIES = { ...Object.fromEntries(Object.entries(TEXT_FONTS).map(([key, value]) => [key, `${value.family}, sans-serif`])), sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: '"Courier New", monospace' };
