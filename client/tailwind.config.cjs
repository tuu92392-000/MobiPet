/** Colors come from CSS variables so the high-contrast theme can swap them. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  theme: {
    extend: {
      colors: {
        cream: v('cream'),
        paper: v('paper'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        sage: { DEFAULT: v('sage'), deep: v('sage-deep') },
        sky: { DEFAULT: v('sky'), deep: v('sky-deep') },
        coral: { DEFAULT: v('coral'), deep: v('coral-deep') },
        cherry: v('cherry'),
        alert: v('alert'),
      },
      fontFamily: {
        body: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        display: ['Nunito', '"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { blob: '2rem' },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
    },
  },
  plugins: [],
};
