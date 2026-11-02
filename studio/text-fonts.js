export const TEXT_FONTS = {
  roboto: { family: 'Roboto', file: 'Roboto.ttf', weight: '100 900' },
  opensans: { family: 'Open Sans', file: 'OpenSans.ttf', weight: '100 900' },
  lora: { family: 'Lora', file: 'Lora.ttf', weight: '100 900' },
  nunito: { family: 'Nunito', file: 'Nunito.ttf', weight: '100 900' },
  raleway: { family: 'Raleway', file: 'Raleway.ttf', weight: '100 900' },
  oswald: { family: 'Oswald', file: 'Oswald.ttf', weight: '100 900' },
  playfair: { family: 'Playfair Display', file: 'PlayfairDisplay.ttf', weight: '100 900' },
  merriweather: { family: 'Merriweather', file: 'Merriweather.ttf', weight: '100 900' },
  rubik: { family: 'Rubik', file: 'Rubik.ttf', weight: '100 900' },
  bebas: { family: 'Bebas Neue', file: 'BebasNeue.ttf', weight: '600' },
  poppins: { family: 'Poppins', file: 'Poppins-Medium.ttf', weight: '600' },
  inter: { family: 'Inter', file: 'Inter.ttf', weight: '100 900' },
  montserrat: { family: 'Montserrat', file: 'Montserrat.ttf', weight: '100 900' },
  lato: { family: 'Lato', file: 'Lato.ttf', weight: '600' },
  tektur: { family: 'Tektur', file: 'Tektur.ttf', weight: '400 900' },
};
export const TEXT_FAMILIES = { ...Object.fromEntries(Object.entries(TEXT_FONTS).map(([key, value]) => [key, `${value.family}, sans-serif`])), sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: '"Courier New", monospace' };
