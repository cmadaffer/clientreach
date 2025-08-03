// pages/_app.js
import NavBar from '../components/NavBar';

export default function MyApp({ Component, pageProps }) {
  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
      <NavBar />
      <main style={{ maxWidth: 1100, margin: '20px auto', padding: '0 16px' }}>
        <Component {...pageProps} />
      </main>
    </div>
  );
}
