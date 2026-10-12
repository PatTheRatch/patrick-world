import '@fontsource/besley/400.css';
import '@fontsource/besley/400-italic.css';
import '@fontsource/besley/500.css';
import '@fontsource/besley/600.css';
import '@fontsource/besley/700.css';
import '@fontsource-variable/archivo/wdth.css';
import './app/styles.css';
import { render } from 'preact';
import { App } from './app/App';

// Canvas lettering needs the faces loaded before it can measure them.
const faces = [
  "400 12px 'Besley'",
  "italic 400 12px 'Besley'",
  "500 12px 'Besley'",
  "600 12px 'Besley'",
  "700 12px 'Besley'",
  "600 12px 'Archivo Variable'",
];
void Promise.allSettled(faces.map((f) => document.fonts.load(f))).then(() => {
  render(<App />, document.getElementById('app')!);
});
